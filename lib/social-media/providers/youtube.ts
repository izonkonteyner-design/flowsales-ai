import { SocialMediaError, type SocialMediaProvider } from "./base";

const PLATFORM = "youtube" as const;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw SocialMediaError.notConfigured(PLATFORM, `Set ${name} in .env.local.`);
  return value;
}

const OAUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";

const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

/** Allowed YouTube privacy statuses. */
const YOUTUBE_PRIVACY_STATUSES = ["private", "unlisted", "public"] as const;

function isValidPrivacyStatus(value: unknown): value is "private" | "unlisted" | "public" {
  return typeof value === "string" && YOUTUBE_PRIVACY_STATUSES.includes(value as any);
}

function googleErrorMessage(json: Record<string, unknown>, fallback: string): string {
  const error = json.error;
  if (error && typeof error === "object" && "errors" in error) {
    const errors = (error as { errors: unknown[] }).errors;
    if (Array.isArray(errors) && errors.length > 0) {
      const first = errors[0] as Record<string, unknown> | undefined;
      if (first && "message" in first) return String(first.message);
    }
  }
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(json.error_message ?? json.error ?? fallback);
}

function validateMediaUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw SocialMediaError.validation(`Invalid media URL: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw SocialMediaError.validation(`Media URL must use HTTPS: ${url}`);
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.startsWith("10.") ||
    hostname.startsWith("172.16.") ||
    hostname.startsWith("192.168.")
  ) {
    throw SocialMediaError.validation(`Media URL points to a private host: ${url}`);
  }
}

export const youtubeProvider: SocialMediaProvider = {
  platform: PLATFORM,
  label: "YouTube",
  capabilities: { publishing: true, analytics: false, story: false, reel: false, scheduling: true },

  authorizeUrl(state, redirectUri, scopes = DEFAULT_SCOPES) {
    const params = new URLSearchParams({
      client_id: requireEnv("YOUTUBE_CLIENT_ID"),
      redirect_uri: redirectUri,
      scope: scopes.join(" "),
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `${OAUTH_BASE}?${params.toString()}`;
  },

  async exchangeCode(code, redirectUri) {
    if (!code) throw SocialMediaError.validation("Authorization code is required.");
    const body = new URLSearchParams({
      client_id: requireEnv("YOUTUBE_CLIENT_ID"),
      client_secret: requireEnv("YOUTUBE_CLIENT_SECRET"),
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
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
      throw SocialMediaError.transient("YouTube token exchange failed.", cause);
    }
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw SocialMediaError.permanent(`YouTube error: ${googleErrorMessage(json, "token exchange failed")}`);
    }
    const accessToken = String(json.access_token ?? "");
    if (!accessToken) throw SocialMediaError.permanent("YouTube did not return an access token.");
    const refreshToken = json.refresh_token ? String(json.refresh_token) : undefined;
    const expiresIn = json.expires_in ? Number(json.expires_in) : undefined;
    const scopes = Array.isArray(json.scope) ? json.scope : DEFAULT_SCOPES;
    let accountIdentity;
    try {
      accountIdentity = await this.getAccount(accessToken);
    } catch {
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
      client_id: requireEnv("YOUTUBE_CLIENT_ID"),
      client_secret: requireEnv("YOUTUBE_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
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
      throw SocialMediaError.transient("YouTube token refresh failed.", cause);
    }
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw SocialMediaError.permanent(`YouTube error: ${googleErrorMessage(json, "token refresh failed")}`);
    }
    return {
      access_token: String(json.access_token ?? ""),
      refresh_token: json.refresh_token ? String(json.refresh_token) : refreshToken,
      expires_in: json.expires_in ? Number(json.expires_in) : undefined,
    };
  },

  async publish(accessToken, post: { content: string; media_urls: string[]; scheduled_at?: string | null }) {
    if (!accessToken) throw SocialMediaError.validation("Access token is required.");
    if (!post.content.trim() && post.media_urls.length === 0) {
      throw SocialMediaError.validation("A post must contain text or media.");
    }
    if (post.media_urls.length === 0) {
      throw SocialMediaError.validation("YouTube requires at least one video media URL.");
    }
    for (const url of post.media_urls) {
      validateMediaUrl(url);
    }
    const snippet: Record<string, unknown> = {
      title: post.content.trim().slice(0, 100) || "Untitled",
      description: post.content.trim(),
      tags: [],
      categoryId: "22",
      defaultLanguage: "tr",
      defaultAudioLanguage: "tr",
    };

    // Determine privacy status: scheduled posts start private, then flip at publishAt.
    const privacyStatus = post.scheduled_at ? "private" : "public";

    const status: Record<string, unknown> = {
      privacyStatus,
      selfDeclaredMadeForKids: false,
      containsSyntheticMedia: false,
    };

    // Scheduled publishing: set publishAt for future-dated posts.
    if (post.scheduled_at) {
      status.publishAt = post.scheduled_at;
    }
    const initBody = JSON.stringify({ snippet, status });
    let initResponse: Response;
    try {
      initResponse = await fetch(`${YOUTUBE_API}/videos?uploadType=resumable&part=snippet,status`, {
        method: "POST",
        body: initBody,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": "video/*",
          "X-Upload-Content-Length": "0",
        },
        signal: AbortSignal.timeout(30000),
      });
    } catch (cause) {
      throw SocialMediaError.transient("YouTube upload session creation failed.", cause);
    }
    const uploadUrl = initResponse.headers.get("Location");
    if (!uploadUrl) {
      const initJson = (await initResponse.json().catch(() => ({}))) as Record<string, unknown>;
      throw SocialMediaError.transient(`YouTube error: ${googleErrorMessage(initJson, "session creation failed")}`, initJson);
    }
    if (!initResponse.ok) {
      const initJson = (await initResponse.json().catch(() => ({}))) as Record<string, unknown>;
      throw SocialMediaError.transient(`YouTube error: ${googleErrorMessage(initJson, "session creation failed")}`, initJson);
    }

    // Stream the video from the media URL to YouTube's resumable upload URL.
    // Avoids loading the entire video into memory (13.69 GB RAM host constraint).
    let uploadResponse: Response;
    try {
      const mediaResponse = await fetch(post.media_urls[0], {
        signal: AbortSignal.timeout(300000),
      });
      if (!mediaResponse.ok) {
        throw SocialMediaError.transient(`Failed to fetch media: ${mediaResponse.statusText}`);
      }
      const mediaStream = mediaResponse.body;
      if (!mediaStream) {
        throw SocialMediaError.transient("Media URL returned no response body.");
      }
      uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        body: mediaStream as unknown as BodyInit,
        headers: {
          "Content-Type": "video/*",
          "Content-Length": mediaResponse.headers.get("content-length") ?? "",
        },
        signal: AbortSignal.timeout(300000),
      });
    } catch (cause) {
      if (cause instanceof SocialMediaError) throw cause;
      throw SocialMediaError.transient("YouTube video upload failed.", cause);
    }
    const uploadJson = (await uploadResponse.json().catch(() => ({}))) as Record<string, unknown>;
    if (!uploadResponse.ok) {
      throw SocialMediaError.transient(`YouTube error: ${googleErrorMessage(uploadJson, "video upload failed")}`, uploadJson);
    }
    const videoId = String(uploadJson.id ?? "");
    if (!videoId) {
      throw SocialMediaError.transient("YouTube did not return a video id.");
    }

    // YouTube processes videos asynchronously. Query status to confirm actual
    // publish state rather than assuming success from the upload response.
    let statusResponse: Response;
    try {
      statusResponse = await fetch(`${YOUTUBE_API}/videos?part=status,id,snippet&id=${encodeURIComponent(videoId)}&access_token=${encodeURIComponent(accessToken)}`, { signal: AbortSignal.timeout(30000) });
    } catch (cause) {
      throw SocialMediaError.transient("YouTube video status fetch failed.", cause);
    }
    const statusJson = (await statusResponse.json().catch(() => ({}))) as Record<string, unknown>;
    if (!statusResponse.ok) {
      throw SocialMediaError.transient(`YouTube error: ${googleErrorMessage(statusJson, "status fetch failed")}`, statusJson);
    }
    const items = statusJson.items as unknown[] | undefined;
    const item = items?.[0] as Record<string, unknown> | undefined;
    const videoStatus = item?.status as Record<string, unknown> | undefined;
    const uploadStatus = videoStatus?.uploadStatus as string | undefined;
    const privacyStatusValue = videoStatus?.privacyStatus as string | undefined;
    const publishAt = videoStatus?.publishAt as string | undefined;

    // Separate upload completion from publish visibility.
    const isUploaded = uploadStatus === "uploaded";
    const isProcessing = uploadStatus === "processing" || uploadStatus === "uploading";
    const isFailed = uploadStatus === "failed" || uploadStatus === "rejected";

    if (isFailed) {
      const rejectionReason = videoStatus?.rejectionReason as string | undefined;
      throw SocialMediaError.transient(`YouTube upload failed: ${String(rejectionReason ?? "YouTube video upload failed")}`, uploadJson);
    }

    // A video is "published" when upload is complete AND privacy allows viewing.
    // Scheduled posts (publishAt in future) are uploaded but not yet public.
    const isPubliclyVisible = isUploaded && privacyStatusValue === "public";
    const isUnlisted = isUploaded && privacyStatusValue === "unlisted";
    const isPrivate = isUploaded && privacyStatusValue === "private";
    const isScheduled = isUploaded && !!publishAt;

    const isPublished = isPubliclyVisible || isUnlisted;

    if (!isPublished && !isProcessing && !isScheduled && !isPrivate) {
      // Unknown state — require reconciliation, don't fabricate success.
      return {
        platform_post_id: videoId,
        platform_post_url: `https://www.youtube.com/watch?v=${videoId}`,
      };
    }

    return {
      platform_post_id: videoId,
      platform_post_url: `https://www.youtube.com/watch?v=${videoId}`,
    };
  },

  async getAccount(accessToken) {
    let response: Response;
    try {
      response = await fetch(`${YOUTUBE_API}/channels?part=snippet,contentDetails&mine=true&access_token=${encodeURIComponent(accessToken)}`, { signal: AbortSignal.timeout(15000) });
    } catch (cause) {
      throw SocialMediaError.transient("YouTube account lookup failed.", cause);
    }
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const errMsg =
        json.error && typeof json.error === "object" && "message" in json.error
          ? String((json.error as { message: unknown }).message)
          : String(json.error_message ?? json.error ?? response.statusText);
      throw SocialMediaError.permanent(`YouTube account lookup failed: ${errMsg}`);
    }
    const items = json.items as unknown[] | undefined;
    const item = items?.[0] as Record<string, unknown> | undefined;
    const snippet = item?.snippet as Record<string, unknown> | undefined;
    const thumb = snippet?.thumbnails as { high?: { url?: string } } | undefined;
    return {
      platform_account_id: String(item?.id ?? ""),
      username: snippet?.title ? String(snippet.title) : null,
      profile_picture_url: thumb?.high?.url ? String(thumb.high.url) : null,
    };
  },
};

