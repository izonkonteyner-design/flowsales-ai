import { SocialMediaError, type SocialMediaProvider } from "./base";

const PLATFORM = "facebook" as const;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw SocialMediaError.notConfigured(PLATFORM, `Set ${name} in .env.local.`);
  return value;
}

const API_VERSION = "v19.0";
const DEFAULT_SCOPES = ["pages_show_list", "pages_manage_posts", "pages_read_engagement"];

export const facebookProvider: SocialMediaProvider = {
  platform: PLATFORM,
  label: "Facebook Pages",
  capabilities: { publishing: true, analytics: false, story: false, reel: false, scheduling: true },

  authorizeUrl(state, redirectUri, scopes = DEFAULT_SCOPES) {
    const params = new URLSearchParams({
      client_id: requireEnv("FACEBOOK_APP_ID"),
      redirect_uri: redirectUri,
      scope: scopes.join(","),
      response_type: "code",
      state,
    });
    return `https://www.facebook.com/${API_VERSION}/dialog/oauth?${params.toString()}`;
  },
  async exchangeCode(code, redirectUri) {
    if (!code) throw SocialMediaError.validation("Authorization code is required.");

    // 1. Exchange the short-lived code for a short-lived user access token.
    const tokenBody = new URLSearchParams({
      client_id: requireEnv("FACEBOOK_APP_ID"),
      client_secret: requireEnv("FACEBOOK_APP_SECRET"),
      redirect_uri: redirectUri,
      code,
      grant_type: "authorization_code",
    });
    let tokenResponse: Response;
    try {
      tokenResponse = await fetch(
        `https://graph.facebook.com/${API_VERSION}/oauth/access_token?${tokenBody.toString()}`,
        { method: "GET", signal: AbortSignal.timeout(15000) },
      );
    } catch (cause) {
      throw SocialMediaError.transient("Facebook token exchange failed.", cause);
    }
    const tokenJson = (await tokenResponse.json().catch(() => ({}))) as Record<string, unknown>;
    if (!tokenResponse.ok) {
      const errMsg = String(tokenJson.error_message ?? tokenJson.error ?? "token exchange failed");
      throw SocialMediaError.permanent(`Facebook error: ${errMsg}`);
    }
    const shortLivedToken = String(tokenJson.access_token ?? "");
    if (!shortLivedToken) {
      throw SocialMediaError.permanent("Facebook did not return an access token.");
    }

    // 2. Extend to a long-lived user access token.
    const extendBody = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: requireEnv("FACEBOOK_APP_ID"),
      client_secret: requireEnv("FACEBOOK_APP_SECRET"),
      fb_exchange_token: shortLivedToken,
    });
    let extendResponse: Response;
    try {
      extendResponse = await fetch(
        `https://graph.facebook.com/${API_VERSION}/oauth/access_token?${extendBody.toString()}`,
        { method: "GET", signal: AbortSignal.timeout(15000) },
      );
    } catch (cause) {
      throw SocialMediaError.transient("Facebook token extension failed.", cause);
    }
    const extendJson = (await extendResponse.json().catch(() => ({}))) as Record<string, unknown>;
    if (!extendResponse.ok) {
      const errMsg = String(extendJson.error_message ?? extendJson.error ?? "token extension failed");
      throw SocialMediaError.permanent(`Facebook error: ${errMsg}`);
    }
    const accessToken = String(extendJson.access_token ?? shortLivedToken);
    const expiresIn = extendJson.expires_in ? Number(extendJson.expires_in) : undefined;

    // 3. List the user's Pages so the app can bind a specific Page account.
    let pages;
    try {
      const pagesResponse = await fetch(
        `https://graph.facebook.com/${API_VERSION}/me/accounts?fields=id,name,access_token,picture&access_token=${encodeURIComponent(accessToken)}`,
        { signal: AbortSignal.timeout(15000) },
      );
      pages = (await pagesResponse.json().catch(() => ({}))) as Record<string, unknown>;
    } catch (cause) {
      throw SocialMediaError.transient("Facebook page lookup failed.", cause);
    }
    const pageList = Array.isArray(pages.data) ? pages.data : [];
    if (pageList.length === 0) {
      throw SocialMediaError.permanent(
        "No Facebook Pages found. Make sure the user is an admin of at least one Page.",
      );
    }

    // Return the first manageable Page. The caller should let the user pick a Page;
    // here we bind the first available Page as the connected account.
    const page = pageList[0] as Record<string, unknown>;
    const pageAccessToken = String(page.access_token ?? accessToken);
    const pageId = String(page.id ?? "");

    return {
      access_token: pageAccessToken,
      refresh_token: undefined,
      expiresIn,
      platform_account_id: pageId,
      username: String(page.name ?? ""),
      scopes: DEFAULT_SCOPES,
    };
  },

  async refreshToken(refreshToken) {
    // Facebook long-lived tokens are refreshed by re-running the OAuth flow or
    // by calling the token endpoint with the current long-lived token. There is
    // no dedicated refresh_token grant for Pages. Return the same token if no
    // refresh token is provided; callers should handle expiry via getAccount.
    if (!refreshToken) throw SocialMediaError.validation("Refresh token is required.");
    return {
      access_token: refreshToken,
      refresh_token: refreshToken,
      expires_in: undefined,
    };
  },

  async publish(accessToken, post) {
    if (!accessToken) throw SocialMediaError.validation("Access token is required.");
    if (!post.content.trim() && post.media_urls.length === 0) {
      throw SocialMediaError.validation("A post must contain text or media.");
    }

    // Facebook Pages publishing: POST /{page-id}/feed with message (+ link/picture).
    const body = new URLSearchParams({
      access_token: accessToken,
      message: post.content,
    });
    // Attach the first media URL as a link/picture when present.
    if (post.media_urls.length > 0) {
      body.set("link", post.media_urls[0]);
    }

    let response: Response;
    try {
      response = await fetch(
        `https://graph.facebook.com/${API_VERSION}/me/feed?${body.toString()}`,
        { method: "POST", signal: AbortSignal.timeout(25000) },
      );
    } catch (cause) {
      throw SocialMediaError.transient("Facebook publish failed.", cause);
    }

    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const errMsg =
        json.error && typeof json.error === "object" && "message" in json.error
          ? String((json.error as { message: unknown }).message)
          : String(json.error_message ?? json.error ?? response.statusText);
      throw SocialMediaError.transient(`Facebook publish failed: ${errMsg}`, json);
    }

    return {
      platform_post_id: String(json.id ?? ""),
      platform_post_url: `https://facebook.com/${String(json.id ?? "")}`,
    };
  },

  async getAccount(accessToken) {
    let response: Response;
    try {
      response = await fetch(
        `https://graph.facebook.com/${API_VERSION}/me?fields=id,name,picture&access_token=${encodeURIComponent(accessToken)}`,
        { signal: AbortSignal.timeout(15000) },
      );
    } catch (cause) {
      throw SocialMediaError.transient("Facebook account lookup failed.", cause);
    }
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const errMsg =
        json.error && typeof json.error === "object" && "message" in json.error
          ? String((json.error as { message: unknown }).message)
          : String(json.error_message ?? json.error ?? response.statusText);
      throw SocialMediaError.permanent(`Facebook account lookup failed: ${errMsg}`);
    }
    return {
      platform_account_id: String(json.id ?? ""),
      username: json.name ? String(json.name) : null,
      profile_picture_url: (json.picture as { data?: { url?: string } | null })?.data?.url ?? null,
    };
  },
};

