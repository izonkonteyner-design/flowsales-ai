import { SocialMediaError, type SocialMediaProvider } from "./base";
import type { SocialMediaPublishInput } from "@/types/social-media";

const PLATFORM = "threads" as const;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw SocialMediaError.notConfigured(PLATFORM, "Set " + name + " in .env.local.");
  return value;
}

const API_VERSION = "v19.0";
/**
 * Threads uses Meta Login for OAuth (the authorization dialog is on Facebook's domain),
 * but the Threads Graph API is at graph.threads.net. Token exchange goes through
 * Facebook's OAuth token endpoint.
 */
const OAUTH_BASE = "https://www.threads.net/oauth/authorize";
const TOKEN_URL = "https://graph.threads.net/oauth/access_token";
const THREADS_API = "https://graph.threads.net/" + API_VERSION;

const DEFAULT_SCOPES = ["threads_basic", "threads_content_publish", "threads_manage_insights"];

function threadsErrorMessage(json: Record<string, unknown>, fallback: string): string {
  if (json.error && typeof json.error === "object" && "message" in json.error) {
    return String((json.error as { message: unknown }).message);
  }
  return String(json.error_message ?? json.error ?? fallback);
}

function threadsMediaType(url: string): "IMAGE" | "VIDEO" {
  const isVideo = /\.(mp4|mov|avi|mkv|webm)(\?|$)/i.test(url);
  return isVideo ? "VIDEO" : "IMAGE";
}

export const threadsProvider: SocialMediaProvider = {
  platform: PLATFORM,
  label: "Threads",
  capabilities: { publishing: true, analytics: false, story: false, reel: false, scheduling: true },

  authorizeUrl(state, redirectUri, scopes = DEFAULT_SCOPES) {
    const params = new URLSearchParams({
      client_id: requireEnv("THREADS_CLIENT_ID"),
      redirect_uri: redirectUri,
      scope: scopes.join(","),
      response_type: "code",
      state,
    });
    return OAUTH_BASE + "?" + params.toString();
  },

  async exchangeCode(code, redirectUri) {
    if (!code) throw SocialMediaError.validation("Authorization code is required.");

    const body = new URLSearchParams({
      client_id: requireEnv("THREADS_CLIENT_ID"),
      client_secret: requireEnv("THREADS_CLIENT_SECRET"),
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    });

    let response: Response;
    try {
      response = await fetch(TOKEN_URL, {
        method: "POST",
        body,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(15000),
      });
    } catch (cause) {
      throw SocialMediaError.transient("Threads token exchange failed.", cause);
    }

    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw SocialMediaError.permanent(
        "Threads error: " + threadsErrorMessage(json, "token exchange failed"),
      );
    }

    const accessToken = String(json.access_token ?? "");
    if (!accessToken) {
      throw SocialMediaError.permanent("Threads did not return an access token.");
    }

    return {
      access_token: accessToken,
      refresh_token: json.refresh_token ? String(json.refresh_token) : undefined,
      expires_in: json.expires_in ? Number(json.expires_in) : undefined,
      platform_account_id: "",
      username: undefined,
      scopes: DEFAULT_SCOPES,
    };
  },

  async refreshToken(refreshToken) {
    if (!refreshToken) throw SocialMediaError.validation("Refresh token is required.");

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: requireEnv("THREADS_CLIENT_ID"),
      client_secret: requireEnv("THREADS_CLIENT_SECRET"),
    });

    let response: Response;
    try {
      response = await fetch(TOKEN_URL, {
        method: "POST",
        body,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(15000),
      });
    } catch (cause) {
      throw SocialMediaError.transient("Threads token refresh failed.", cause);
    }

    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw SocialMediaError.permanent(
        "Threads error: " + threadsErrorMessage(json, "token refresh failed"),
      );
    }

    return {
      access_token: String(json.access_token ?? ""),
      refresh_token: json.refresh_token ? String(json.refresh_token) : refreshToken,
      expires_in: json.expires_in ? Number(json.expires_in) : undefined,
    };
  },

  async publish(accessToken, post: SocialMediaPublishInput) {
    if (!accessToken) throw SocialMediaError.validation("Access token is required.");
    if (!post.content.trim() && post.media_urls.length === 0) {
      throw SocialMediaError.validation("A post must contain text or media.");
    }

    // Step 1: Get the Threads user ID (IG user ID equivalent).
    let userId: string;
    try {
      const meResponse = await fetch(
        THREADS_API + "/me?fields=id,username",
        { headers: { Authorization: "Bearer " + accessToken }, signal: AbortSignal.timeout(15000) },
      );
      if (!meResponse.ok) {
        const j = (await meResponse.json().catch(() => ({}))) as Record<string, unknown>;
        throw SocialMediaError.permanent(
          "Threads user lookup failed: " + threadsErrorMessage(j, meResponse.statusText),
        );
      }
      const meJson = (await meResponse.json()) as Record<string, unknown>;
      userId = String(meJson.id ?? "");
      if (!userId) {
        throw SocialMediaError.permanent("Threads did not return a user id.");
      }
    } catch (cause) {
      if (cause instanceof SocialMediaError) throw cause;
      throw SocialMediaError.transient("Threads user lookup failed.", cause);
    }

    // Step 2: Create media container(s).
    let containerId: string | undefined;
    let mediaContainerIds: string[] = [];
    const isMedia = post.media_urls.length > 0;

    try {
      if (isMedia && post.media_urls.length === 1) {
        // Single image: create one container.
        const containerBody = new URLSearchParams();
        containerBody.set("text", post.content.trim().slice(0, 500) || "\u2026");
        containerBody.set("media_type", threadsMediaType(post.media_urls[0]));
        containerBody.set("image_url", post.media_urls[0]);

        const containerResponse = await fetch(
          THREADS_API + "/" + userId + "/threads",
          {
            method: "POST",
            body: containerBody,
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            signal: AbortSignal.timeout(30000),
          },
        );
        const containerJson = (await containerResponse.json().catch(() => ({}))) as Record<string, unknown>;
        if (!containerResponse.ok) {
          const errMsg = threadsErrorMessage(containerJson, "Threads container creation failed");
          throw SocialMediaError.transient("Threads error: " + errMsg, containerJson);
        }
        containerId = String(containerJson.id ?? "");
        if (!containerId) {
          throw SocialMediaError.transient("Threads did not return a container id.");
        }
        mediaContainerIds.push(containerId);
      } else if (isMedia && post.media_urls.length > 1) {
        // Carousel: create one container per image, then a CAROUSEL container.
        const imageContainerIds: string[] = [];
        for (const url of post.media_urls) {
          const containerBody = new URLSearchParams();
          containerBody.set("text", "");
          containerBody.set("media_type", "IMAGE");
          containerBody.set("image_url", url);

          const containerResponse = await fetch(
            THREADS_API + "/" + userId + "/threads",
            {
              method: "POST",
              body: containerBody,
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              signal: AbortSignal.timeout(30000),
            },
          );
          const containerJson = (await containerResponse.json().catch(() => ({}))) as Record<string, unknown>;
          if (!containerResponse.ok) {
            const errMsg = threadsErrorMessage(containerJson, "Threads carousel container creation failed");
            throw SocialMediaError.transient("Threads error: " + errMsg, containerJson);
          }
          const cid = String(containerJson.id ?? "");
          if (!cid) {
            throw SocialMediaError.transient("Threads did not return a carousel container id.");
          }
          imageContainerIds.push(cid);
        }

        // Create CAROUSEL container.
        const carouselBody = new URLSearchParams();
        carouselBody.set("text", post.content.trim().slice(0, 500) || "\u2026");
        carouselBody.set("media_type", "CAROUSEL");
        carouselBody.set("children", imageContainerIds.join(","));

        const carouselResponse = await fetch(
          THREADS_API + "/" + userId + "/threads",
          {
            method: "POST",
            body: carouselBody,
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            signal: AbortSignal.timeout(30000),
          },
        );
        const carouselJson = (await carouselResponse.json().catch(() => ({}))) as Record<string, unknown>;
        if (!carouselResponse.ok) {
          const errMsg = threadsErrorMessage(carouselJson, "Threads carousel container creation failed");
          throw SocialMediaError.transient("Threads error: " + errMsg, carouselJson);
        }
        containerId = String(carouselJson.id ?? "");
        if (!containerId) {
          throw SocialMediaError.transient("Threads did not return a carousel container id.");
        }
        mediaContainerIds = [containerId];
      }
    } catch (cause) {
      if (cause instanceof SocialMediaError) throw cause;
      throw SocialMediaError.transient("Threads container creation failed.", cause);
    }

    // Step 3: Verify container(s) are in FINISHED status before publishing.
    for (const cid of mediaContainerIds) {
      let containerStatus: string | undefined;
      try {
        const statusResponse = await fetch(
          THREADS_API + "/" + cid + "?fields=status",
          { headers: { Authorization: "Bearer " + accessToken }, signal: AbortSignal.timeout(15000) },
        );
        if (statusResponse.ok) {
          const statusJson = (await statusResponse.json()) as Record<string, unknown>;
          containerStatus = String(statusJson.status ?? "");
        }
      } catch {
        // Non-fatal: if status check fails, proceed with publish attempt.
      }

      if (containerStatus && containerStatus !== "FINISHED") {
        throw SocialMediaError.transient(
          "Threads container not ready for publishing (status: " + containerStatus + ").",
        );
      }
    }

    // Step 4: Publish the container.
    let publishResponse: Response;
    try {
      publishResponse = await fetch(
        THREADS_API + "/" + userId + "/threads_publish",
        {
          method: "POST",
          body: new URLSearchParams({
            publish_type: "PUBLISH",
            media_container_id: mediaContainerIds[0],
          }),
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          signal: AbortSignal.timeout(30000),
        },
      );
    } catch (cause) {
      throw SocialMediaError.transient("Threads publish failed.", cause);
    }

    const publishJson = (await publishResponse.json().catch(() => ({}))) as Record<string, unknown>;
    if (!publishResponse.ok) {
      const errMsg = threadsErrorMessage(publishJson, "Threads publish failed");
      throw SocialMediaError.transient("Threads error: " + errMsg, publishJson);
    }

    const publishedId = String(publishJson.id ?? containerId);

    // Step 5: Query real permalink from API - do not construct URL from ID without verification.
    let platformPostUrl: string | null = null;
    try {
      const permalinkResponse = await fetch(
        THREADS_API + "/" + publishedId + "?fields=permalink",
        { headers: { Authorization: "Bearer " + accessToken }, signal: AbortSignal.timeout(15000) },
      );
      if (permalinkResponse.ok) {
        const permalinkJson = (await permalinkResponse.json()) as Record<string, unknown>;
        platformPostUrl = String(permalinkJson.permalink ?? null);
      }
    } catch {
      // Non-fatal: if permalink lookup fails, we still have the post id.
    }

    return {
      platform_post_id: publishedId,
      platform_post_url: platformPostUrl ?? null,
    };
  },

  async getAccount(accessToken) {
    let response: Response;
    try {
      response = await fetch(
        THREADS_API + "/me?fields=id,username,name,profile_picture_url",
        { headers: { Authorization: "Bearer " + accessToken }, signal: AbortSignal.timeout(15000) },
      );
    } catch (cause) {
      throw SocialMediaError.transient("Threads account lookup failed.", cause);
    }
    if (!response.ok) {
      const j = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      throw SocialMediaError.permanent(
        "Threads account lookup failed: " + threadsErrorMessage(j, response.statusText),
      );
    }
    const json = (await response.json()) as Record<string, unknown>;
    return {
      platform_account_id: String(json.id ?? ""),
      username: json.username ? String(json.username) : null,
      profile_picture_url: json.profile_picture_url ? String(json.profile_picture_url) : null,
    };
  },
};


