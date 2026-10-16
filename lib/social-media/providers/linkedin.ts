import { SocialMediaError, type SocialMediaProvider } from "./base";
import type { SocialMediaPublishInput } from "@/types/social-media";

const PLATFORM = "linkedin" as const;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw SocialMediaError.notConfigured(PLATFORM, "Set " + name + " in .env.local.");
  return value;
}

const LINKEDIN_API = "https://api.linkedin.com/rest";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const LINKEDIN_VERSION = "202604";

const DEFAULT_SCOPES = ["openid", "profile", "w_member_social", "r_organization_social"];

function linkedinErrorMessage(json: Record<string, unknown>, fallback: string): string {
  if (json.error && typeof json.error === "object" && "message" in json.error) {
    return String((json.error as { message: unknown }).message);
  }
  if (json.error_description) return String(json.error_description);
  return String(json.error ?? json.message ?? fallback);
}

/** LinkedIn organization page info returned by /organizationAcls. */
export interface LinkedInOrganization {
  id: string;
  name: string;
  localizedName: string;
  vanityName: string | null;
}

/** List of pages the authenticated user can manage (w_organization_social required). */
export async function listLinkedInPages(accessToken: string): Promise<LinkedInOrganization[]> {
  let response: Response;
  try {
    response = await fetch(LINKEDIN_API + "/organizationAcls?q=roleAssignee&state=approved",
      {
        headers: {
          Authorization: "Bearer " + accessToken,
          "X-Restli-Protocol-Version": "2.0.0",
          "Linkedin-Version": LINKEDIN_VERSION,
        },
        signal: AbortSignal.timeout(15000),
      },
    );
  } catch (cause) {
    throw SocialMediaError.transient("LinkedIn organization ACL lookup failed.", cause);
  }

  if (!response.ok) {
    const j = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    throw SocialMediaError.permanent(
      "LinkedIn page listing failed: " + linkedinErrorMessage(j, response.statusText),
    );
  }

  const json = (await response.json()) as Record<string, unknown>;
  const elements = json.elements as unknown[] | undefined;
  if (!elements) return [];

  return elements.map((el) => {
    const record = el as Record<string, unknown>;
    const nameObj = (record.name as Record<string, unknown> | undefined)?.localized as
      | Record<string, unknown>
      | undefined;
    const defaultName = (nameObj?.default as string | undefined) ?? "";
    const vanityObj = record.vanityName as Record<string, unknown> | undefined;
    const vanityDefault = (vanityObj?.default as string | undefined) ?? "";
    return {
      id: String(record.organization ?? ""),
      name: String(defaultName),
      localizedName: String(defaultName),
      vanityName: String(vanityDefault),
    };
  });
}

/**
 * Register an image upload with LinkedIn Images API.
 * Returns the image URN and upload URL. The caller must PUT the image bytes
 * to the upload URL, then use the image URN in a share.
 */
export async function registerImageUpload(
  accessToken: string,
): Promise<{ imageUrn: string; uploadUrl: string }> {
  let response: Response;
  try {
    response = await fetch(LINKEDIN_API + "/images", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + accessToken,
        "X-Restli-Protocol-Version": "2.0.0",
        "Linkedin-Version": LINKEDIN_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uploadRequest: {
          headers: {
            "content-type": "image/jpeg",
            "x-linkedin-size": "1200x1200",
          },
        },
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (cause) {
    throw SocialMediaError.transient("LinkedIn image upload registration failed.", cause);
  }

  if (!response.ok) {
    const j = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    throw SocialMediaError.permanent(
      "LinkedIn image upload registration failed: " + linkedinErrorMessage(j, response.statusText),
    );
  }

  const json = (await response.json()) as Record<string, unknown>;
  const value = json.value as Record<string, unknown> | undefined;
  const uploadUrl = String(value?.uploadUrl ?? "");
  const imageUrn = String(value?.image ?? "");

  if (!uploadUrl || !imageUrn) {
    throw SocialMediaError.transient(
      "LinkedIn image upload registration returned incomplete data.",
    );
  }

  return { imageUrn, uploadUrl };
}

/**
 * Register a video upload with LinkedIn Videos API.
 * Returns the video URN and upload URL. The caller must PUT the video bytes
 * to the upload URL, then use the video URN in a share.
 */
export async function registerVideoUpload(
  accessToken: string,
): Promise<{ videoUrn: string; uploadUrl: string }> {
  let response: Response;
  try {
    response = await fetch(LINKEDIN_API + "/videos", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + accessToken,
        "X-Restli-Protocol-Version": "2.0.0",
        "Linkedin-Version": LINKEDIN_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uploadRequest: {
          headers: {
            "content-type": "video/mp4",
            "x-linkedin-size": "1920x1080",
          },
        },
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (cause) {
    throw SocialMediaError.transient("LinkedIn video upload registration failed.", cause);
  }

  if (!response.ok) {
    const j = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    throw SocialMediaError.permanent(
      "LinkedIn video upload registration failed: " + linkedinErrorMessage(j, response.statusText),
    );
  }

  const json = (await response.json()) as Record<string, unknown>;
  const value = json.value as Record<string, unknown> | undefined;
  const uploadUrl = String(value?.uploadUrl ?? "");
  const videoUrn = String(value?.video ?? "");

  if (!uploadUrl || !videoUrn) {
    throw SocialMediaError.transient(
      "LinkedIn video upload registration returned incomplete data.",
    );
  }

  return { videoUrn, uploadUrl };
}

/**
 * Upload media bytes to a LinkedIn upload URL and return the media URN.
 */
export async function uploadMediaBytes(
  accessToken: string,
  uploadUrl: string,
  sourceUrl: string,
): Promise<string> {
  let mediaResponse: Response;
  try {
    mediaResponse = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(60000),
    });
  } catch (cause) {
    throw SocialMediaError.transient("Failed to fetch media from " + sourceUrl + ".", cause);
  }

  if (!mediaResponse.ok) {
    throw SocialMediaError.transient(
      "Source media returned " + mediaResponse.status + " for " + sourceUrl + ".",
    );
  }

  const mediaBytes = await mediaResponse.arrayBuffer();

  let uploadResponse: Response;
  try {
    uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      body: mediaBytes,
      headers: {
        "Content-Type": mediaResponse.headers.get("content-type") ?? "application/octet-stream",
      },
      signal: AbortSignal.timeout(120000),
    });
  } catch (cause) {
    throw SocialMediaError.transient("LinkedIn media upload PUT failed.", cause);
  }

  if (!uploadResponse.ok) {
    throw SocialMediaError.transient(
      "LinkedIn media upload returned " + uploadResponse.status + ".",
    );
  }

  const location = uploadResponse.headers.get("location");
  if (location) {
    return location;
  }

  const uploadJson = (await uploadResponse.json().catch(() => ({}))) as Record<string, unknown>;
  return String(uploadJson.id ?? uploadJson.urn ?? "");
}

export const linkedinProvider: SocialMediaProvider = {
  platform: PLATFORM,
  label: "LinkedIn",
  capabilities: { publishing: true, analytics: false, story: false, reel: false, scheduling: true },

  authorizeUrl(state, redirectUri, scopes = DEFAULT_SCOPES) {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: requireEnv("LINKEDIN_CLIENT_ID"),
      redirect_uri: redirectUri,
      scope: scopes.join(" "),
      state,
    });
    return "https://www.linkedin.com/oauth/v2/authorization?" + params.toString();
  },

  async exchangeCode(code, redirectUri) {
    if (!code) throw SocialMediaError.validation("Authorization code is required.");

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: requireEnv("LINKEDIN_CLIENT_ID"),
      client_secret: requireEnv("LINKEDIN_CLIENT_SECRET"),
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
      throw SocialMediaError.transient("LinkedIn token exchange failed.", cause);
    }

    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw SocialMediaError.permanent(
        "LinkedIn error: " + linkedinErrorMessage(json, "token exchange failed"),
      );
    }

    const accessToken = String(json.access_token ?? "");
    if (!accessToken) {
      throw SocialMediaError.permanent("LinkedIn did not return an access token.");
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
      client_id: requireEnv("LINKEDIN_CLIENT_ID"),
      client_secret: requireEnv("LINKEDIN_CLIENT_SECRET"),
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
      throw SocialMediaError.transient("LinkedIn token refresh failed.", cause);
    }

    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw SocialMediaError.permanent(
        "LinkedIn error: " + linkedinErrorMessage(json, "token refresh failed"),
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

    // Resolve the author URN: personal profile or organization page.
    let authorUrn: string;
    if (post.organization_id) {
      // Company page publishing: requires w_organization_social scope.
      if (!post.scopes || !post.scopes.includes("w_organization_social")) {
        throw SocialMediaError.permanent(
          "LinkedIn company page publishing requires w_organization_social scope. " +
            "Please reconnect your LinkedIn account with organization permissions.",
        );
      }
      authorUrn = "urn:li:organization:" + post.organization_id;
    } else {
      // Personal profile: resolve member ID via /userinfo.
      let memberId: string;
      try {
        const me = await fetch(LINKEDIN_API + "/userinfo", {
          headers: {
            Authorization: "Bearer " + accessToken,
            "Linkedin-Version": LINKEDIN_VERSION,
          },
          signal: AbortSignal.timeout(15000),
        });
        if (!me.ok) {
          const j = (await me.json().catch(() => ({}))) as Record<string, unknown>;
          throw SocialMediaError.permanent(
            "LinkedIn userinfo failed: " + linkedinErrorMessage(j, me.statusText),
          );
        }
        const meJson = (await me.json()) as Record<string, unknown>;
        memberId = String(meJson.sub ?? "");
        if (!memberId) {
          throw SocialMediaError.permanent("LinkedIn did not return a member id.");
        }
      } catch (cause) {
        if (cause instanceof SocialMediaError) throw cause;
        throw SocialMediaError.transient("LinkedIn member lookup failed.", cause);
      }
      authorUrn = "urn:li:person:" + memberId;
    }

    // Register and upload media to LinkedIn's CDN. Do not pass raw external URLs
    // directly -- LinkedIn requires media to be uploaded first and referenced by URN.
    const media: Record<string, unknown>[] = [];
    for (const url of post.media_urls) {
      const isVideo = /\.(mp4|mov|avi|mkv|webm)(\?|$)/i.test(url);

      let mediaUrn: string;
      try {
        if (isVideo) {
          const { videoUrn, uploadUrl } = await registerVideoUpload(accessToken);
          await uploadMediaBytes(accessToken, uploadUrl, url);
          mediaUrn = videoUrn;
        } else {
          const { imageUrn, uploadUrl } = await registerImageUpload(accessToken);
          await uploadMediaBytes(accessToken, uploadUrl, url);
          mediaUrn = imageUrn;
        }
      } catch (cause) {
        if (cause instanceof SocialMediaError) throw cause;
        throw SocialMediaError.transient(
          "LinkedIn media upload failed for " + url + ".",
          cause,
        );
      }

      media.push({
        status: "READY",
        description: { text: "" },
        title: { text: "Shared media" },
        id: mediaUrn,
      });
    }

    const shareBody: Record<string, unknown> = {
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: post.content.trim().slice(0, 1300) || "\u2026" },
          shareMediaCategory:
            post.media_urls.length > 0 ? "IMAGE" : "NONE",
          media: media.length > 0 ? media : undefined,
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "CONNECTIONS",
      },
    };

    let shareResponse: Response;
    try {
      shareResponse = await fetch(LINKEDIN_API + "/posts", {
        method: "POST",
        body: JSON.stringify(shareBody),
        headers: {
          Authorization: "Bearer " + accessToken,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
          "Linkedin-Version": LINKEDIN_VERSION,
        },
        signal: AbortSignal.timeout(30000),
      });
    } catch (cause) {
      throw SocialMediaError.transient("LinkedIn post creation failed.", cause);
    }

    const shareJson = (await shareResponse.json().catch(() => ({}))) as Record<string, unknown>;
    if (!shareResponse.ok) {
      const errMsg = linkedinErrorMessage(shareJson, "LinkedIn post creation failed");
      throw SocialMediaError.transient("LinkedIn error: " + errMsg, shareJson);
    }

    const shareId = String(shareJson.id ?? "");
    if (!shareId) {
      throw SocialMediaError.transient("LinkedIn did not return a post id.");
    }

    return {
      platform_post_id: shareId,
      platform_post_url: "https://www.linkedin.com/feed/update/" + shareId,
    };
  },

  async getAccount(accessToken) {
    let response: Response;
    try {
      response = await fetch(LINKEDIN_API + "/userinfo", {
        headers: {
          Authorization: "Bearer " + accessToken,
          "Linkedin-Version": LINKEDIN_VERSION,
        },
        signal: AbortSignal.timeout(15000),
      });
    } catch (cause) {
      throw SocialMediaError.transient("LinkedIn account lookup failed.", cause);
    }
    if (!response.ok) {
      const j = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      throw SocialMediaError.permanent(
        "LinkedIn account lookup failed: " + linkedinErrorMessage(j, response.statusText),
      );
    }
    const json = (await response.json()) as Record<string, unknown>;
    return {
      platform_account_id: String(json.sub ?? ""),
      username: json.name ? String(json.name) : null,
      profile_picture_url: json.picture ? String(json.picture) : null,
    };
  },
};








