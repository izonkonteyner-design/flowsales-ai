import { SocialMediaError, type SocialMediaProvider } from "./base";

const PLATFORM = "tiktok" as const;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw SocialMediaError.notConfigured(PLATFORM, `Set ${name} in .env.local.`);
  return value;
}

const API_VERSION = "v2";
const BASE_URL = `https://open.tiktokapis.com/${API_VERSION}`;

/** Default scopes for the TikTok Login Kit. */
const DEFAULT_SCOPES = ["user.info.basic", "video.upload", "video.publish"];

/** Extracts a surface-safe error message from a TikTok API error body. */
function tiktokErrorMessage(json: Record<string, unknown>, fallback: string): string {
  const error = json.error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(json.error_message ?? json.error ?? fallback);
}

export const tiktokProvider: SocialMediaProvider = {
  platform: PLATFORM,
  label: "TikTok",
  capabilities: { publishing: true, analytics: false, story: false, reel: false, scheduling: true },

  authorizeUrl(state, redirectUri, scopes = DEFAULT_SCOPES) {
    const params = new URLSearchParams({
      client_key: requireEnv("TIKTOK_CLIENT_KEY"),
      scope: scopes.join(","),
      response_type: "code",
      redirect_uri: redirectUri,
      state,
    });
    return `https://www.tiktok.com/${API_VERSION}/auth/authorize/?${params.toString()}`;
  },
  async exchangeCode(code, redirectUri) {
    if (!code) throw SocialMediaError.validation("Authorization code is required.");

    const body = new URLSearchParams({
      client_key: requireEnv("TIKTOK_CLIENT_KEY"),
      client_secret: requireEnv("TIKTOK_CLIENT_SECRET"),
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/oauth/token/`, {
        method: "POST",
        body,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(15000),
      });
    } catch (cause) {
      throw SocialMediaError.transient("TikTok token exchange failed.", cause);
    }

    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const errMsg = tiktokErrorMessage(json, "TikTok token exchange failed");
      throw SocialMediaError.permanent(`TikTok error: ${errMsg}`);
    }

    const accessToken = String(json.access_token ?? "");
    if (!accessToken) {
      throw SocialMediaError.permanent("TikTok did not return an access token.");
    }

    const refreshToken = json.refresh_token ? String(json.refresh_token) : undefined;
    const expiresIn = json.expires_in ? Number(json.expires_in) : undefined;
    const scopes = Array.isArray(json.scope) ? json.scope : DEFAULT_SCOPES;

    // Fetch the user identity to bind the connected account.
    let accountIdentity;
    try {
      accountIdentity = await this.getAccount(accessToken);
    } catch {
      // If account lookup fails we still return the tokens; the caller can retry.
      accountIdentity = null;
    }

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn,
      platform_account_id: accountIdentity?.platform_account_id ?? "",
      username: accountIdentity?.username ?? undefined,
      scopes,
    };
  },

  async refreshToken(refreshToken) {
    if (!refreshToken) throw SocialMediaError.validation("Refresh token is required.");

    const body = new URLSearchParams({
      client_key: requireEnv("TIKTOK_CLIENT_KEY"),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/oauth/token/`, {
        method: "POST",
        body,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(15000),
      });
    } catch (cause) {
      throw SocialMediaError.transient("TikTok token refresh failed.", cause);
    }

    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const errMsg = tiktokErrorMessage(json, "TikTok token refresh failed");
      throw SocialMediaError.permanent(`TikTok error: ${errMsg}`);
    }

    return {
      access_token: String(json.access_token ?? ""),
      refresh_token: json.refresh_token ? String(json.refresh_token) : refreshToken,
      expires_in: json.expires_in ? Number(json.expires_in) : undefined,
    };
  },

  async publish(accessToken, post) {
    if (!accessToken) throw SocialMediaError.validation("Access token is required.");
    if (!post.content.trim() && post.media_urls.length === 0) {
      throw SocialMediaError.validation("A post must contain text or media.");
    }

    // TikTok requires a title for every post. Use the post content as the title
    // (TikTok titles are typically short; truncate to 2000 chars).
    const title = post.content.trim().slice(0, 2000) || "Untitled";

    // Validate privacy level; unverified apps cannot use PUBLIC.
    const privacyLevel = "SELF_ONLY";

    // Determine media type: if any URL looks like a video, treat as video;
    // otherwise treat as an image carousel.
    const isVideo = post.media_urls.some((url) =>
      /\.(mp4|mov|avi|mkv|webm)(\?|$)/i.test(url),
    );

    const sourceInfo: Record<string, unknown> = {
      source: "PULL_FROM_URL",
    };

    if (isVideo) {
      sourceInfo.video_url = post.media_urls[0];
    } else if (post.media_urls.length > 0) {
      sourceInfo.images = post.media_urls;
    } else {
      throw SocialMediaError.validation("TikTok requires at least one media URL.");
    }

    // Validate all media URLs are absolute HTTPS URLs.
    for (const url of post.media_urls) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:") {
          throw SocialMediaError.validation(`Invalid media URL: ${url}`);
        }
      } catch {
        throw SocialMediaError.validation(`Invalid media URL: ${url}`);
      }
    }

    const body = {
      post_info: {
        title,
        privacy_level: privacyLevel,
        disable_comment: false,
        disable_duet: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000,
        ai_generated: 0,
        self_declare_ai_generated: 0,
      },
      source_info: sourceInfo,
    };

    let initResponse: Response;
    try {
      initResponse = await fetch(`${BASE_URL}/post/publish/video/init/`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(30000),
      });
    } catch (cause) {
      throw SocialMediaError.transient("TikTok publish init failed.", cause);
    }

    const initJson = (await initResponse.json().catch(() => ({}))) as Record<string, unknown>;
    if (!initResponse.ok) {
      const errMsg = tiktokErrorMessage(initJson, "TikTok publish init failed");
      throw SocialMediaError.transient(`TikTok error: ${errMsg}`, initJson);
    }

    const publishId = String(initJson.publish_id ?? "");
    if (!publishId) {
      throw SocialMediaError.transient("TikTok did not return a publish id.");
    }

    // TikTok publishes asynchronously. Fetch the status to confirm the result
    // before reporting success. Never count a successful init as a publish.
    let statusResponse: Response;
    try {
      statusResponse = await fetch(
        `${BASE_URL}/post/publish/status/fetch/?publish_id=${encodeURIComponent(publishId)}`,
        { signal: AbortSignal.timeout(30000) },
      );
    } catch (cause) {
      throw SocialMediaError.transient("TikTok publish status fetch failed.", cause);
    }

    const statusJson = (await statusResponse.json().catch(() => ({}))) as Record<string, unknown>;
    if (!statusResponse.ok) {
      const errMsg = tiktokErrorMessage(statusJson, "TikTok publish status failed");
      throw SocialMediaError.transient(`TikTok error: ${errMsg}`, statusJson);
    }

    const publishStatus = statusJson.status;
    const isPublished = publishStatus === "PUBLISH_COMPLETE";
    const isFailed = publishStatus === "FAILED" || publishStatus === "REVIEW_FAILED";

    if (isFailed) {
      const errMsg = String(
        statusJson.fail_reason ?? statusJson.error_message ?? "TikTok publish failed",
      );
      throw SocialMediaError.transient(`TikTok publish failed: ${errMsg}`, statusJson);
    }

    if (!isPublished) {
      // Still processing (PENDING, PROCESSING_UPLOAD, PROCESSING, SCHEDULE, etc.).
      // Preserve the platform id without claiming a confirmed public publish;
      // do not treat incomplete statuses as permanent failures.
      return {
        status: "processing", // SELF_ONLY uploads require manual visibility verification.
        platform_post_id: publishId,
        platform_post_url: null,
      };
    }

    return {
      status: "processing", // SELF_ONLY uploads require manual visibility verification.
        platform_post_id: publishId,
      platform_post_url: null,
    };
  },

  async getAccount(accessToken) {
    let response: Response;
    try {
      response = await fetch(
        `${BASE_URL}/user/info/?fields=open_id,avatar_url,display_name,username`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(15000),
        },
      );
    } catch (cause) {
      throw SocialMediaError.transient("TikTok account lookup failed.", cause);
    }
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const errMsg =
        json.error && typeof json.error === "object" && "message" in json.error
          ? String((json.error as { message: unknown }).message)
          : String(json.error_message ?? json.error ?? response.statusText);
      throw SocialMediaError.permanent(`TikTok account lookup failed: ${errMsg}`);
    }
    const data = json.data as Record<string, unknown> | undefined;
    return {
      platform_account_id: String(data?.open_id ?? ""),
      username: data?.username ? String(data.username) : null,
      profile_picture_url: data?.avatar_url ? String(data.avatar_url) : null,
    };
  },
};
