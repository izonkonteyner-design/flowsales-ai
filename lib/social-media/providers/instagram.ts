import { SocialMediaError, type SocialMediaProvider } from "./base";

const PLATFORM = "instagram" as const;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw SocialMediaError.notConfigured(PLATFORM, `Set ${name} in .env.local.`);
  return value;
}

export const instagramProvider: SocialMediaProvider = {
  platform: PLATFORM,
  label: "Instagram",
  capabilities: { publishing: true, analytics: false, story: false, reel: false, scheduling: true },

  authorizeUrl(state, redirectUri, scopes = ["user_profile", "user_media"]) {
    const params = new URLSearchParams({
      client_id: requireEnv("INSTAGRAM_CLIENT_ID"),
      redirect_uri: redirectUri,
      scope: scopes.join(","),
      response_type: "code",
      state,
    });
    return `https://api.instagram.com/oauth/authorize?${params.toString()}`;
  },

  async exchangeCode(code, redirectUri) {
    if (!code) throw SocialMediaError.validation("Authorization code is required.");
    const body = new URLSearchParams({
      client_id: requireEnv("INSTAGRAM_CLIENT_ID"),
      client_secret: requireEnv("INSTAGRAM_CLIENT_SECRET"),
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    });
    let response: Response;
    try {
      response = await fetch("https://api.instagram.com/oauth/access_token", {
        method: "POST",
        body,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(15000),
      });
    } catch (cause) {
      throw SocialMediaError.transient("Instagram token exchange failed.", cause);
    }
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const errMsg =
        json.error && typeof json.error === "object" && "message" in json.error
          ? String((json.error as { message: unknown }).message)
          : String(json.error_message ?? json.error ?? "token exchange failed");
      throw SocialMediaError.permanent(`Instagram error: ${errMsg}`);
    }
    return {
      access_token: String(json.access_token ?? ""),
      refresh_token: json.refresh_token ? String(json.refresh_token) : undefined,
      expires_in: json.expires_in ? Number(json.expires_in) : undefined,
      platform_account_id: String(json.user_id ?? ""),
      username: json.username ? String(json.username) : undefined,
    };
  },

  async refreshToken(refreshToken) {
    if (!refreshToken) throw SocialMediaError.validation("Refresh token is required.");
    const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
    let response: Response;
    try {
      response = await fetch("https://graph.instagram.com/refresh_access_token", {
        method: "POST",
        body,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(15000),
      });
    } catch (cause) {
      throw SocialMediaError.transient("Instagram token refresh failed.", cause);
    }
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw SocialMediaError.permanent(`Instagram refresh failed: ${String(json.error_message ?? json.error)}`);
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
    const creationResponse = await fetch(
      `https://graph.facebook.com/v19.0/me/media?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: "POST",
        body: JSON.stringify({ image_url: post.media_urls[0] ?? "", caption: post.content }),
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(20000),
      },
    );
    const creationJson = (await creationResponse.json().catch(() => ({}))) as Record<string, unknown>;
    if (!creationResponse.ok) {
      const errMsg = (creationJson.error as { message?: unknown } | undefined)?.message
        ? String((creationJson.error as { message: unknown }).message)
        : String(creationJson.error_message ?? creationResponse.statusText);
      throw SocialMediaError.transient(`Instagram media creation failed: ${errMsg}`, creationJson);
    }
    const creationId = String(creationJson.id ?? "");
    if (!creationId) throw SocialMediaError.transient("Instagram media container id missing.");
    const publishResponse = await fetch(
      `https://graph.facebook.com/v19.0/me/media_publish?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: "POST",
        body: JSON.stringify({ creation_id: creationId }),
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(20000),
      },
    );
    const publishJson = (await publishResponse.json().catch(() => ({}))) as Record<string, unknown>;
    if (!publishResponse.ok) {
      const errMsg = (publishJson.error as { message?: unknown } | undefined)?.message
        ? String((publishJson.error as { message: unknown }).message)
        : String(publishJson.error_message ?? publishResponse.statusText);
      throw SocialMediaError.transient(`Instagram media publish failed: ${errMsg}`, publishJson);
    }
    return { platform_post_id: String(publishJson.id ?? creationId), platform_post_url: null };
  },

  async getAccount(accessToken) {
    let response: Response;
    try {
      response = await fetch(
        "https://graph.instagram.com/me?fields=id,username,profile_picture_url&access_token=" +
          encodeURIComponent(accessToken),
        { signal: AbortSignal.timeout(15000) },
      );
    } catch (cause) {
      throw SocialMediaError.transient("Instagram account lookup failed.", cause);
    }
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw SocialMediaError.permanent(`Instagram account lookup failed: ${String((json.error as { message?: unknown } | undefined)?.message ?? response.statusText)}`);
    }
    return {
      platform_account_id: String(json.id ?? ""),
      username: json.username ? String(json.username) : null,
      profile_picture_url: json.profile_picture_url ? String(json.profile_picture_url) : null,
    };
  },
};
