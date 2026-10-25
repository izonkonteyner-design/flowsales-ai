import "server-only";

import * as crypto from "node:crypto";
import { decryptToken, encryptToken } from "@/server/services/integrations/encryption";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { upsertChannelConnection } from "@/server/services/integrations/channel-connections";
import { getSiteUrl } from "@/server/env";

/**
 * Omnichannel Provider Adapter Interface
 *
 * Defines the contract that every channel provider adapter must implement.
 * Currently Meta (WhatsApp/Instagram/Facebook), Google, and TikTok have
 * stub implementations that return `configuration_required` when env vars
 * are absent. Full provider implementations are out of scope for this PR.
 *
 * Security invariants:
 *   - buildAuthorizationUrl never returns tokens; returns only a URL + opaque state.
 *   - exchangeCode returns a TokenSet whose cipher fields are populated only
 *     when TOKEN_ENCRYPTION_KEY is configured; otherwise throws
 *     OAuthTokenEncryptionNotConfiguredError.
 *   - No raw token values are logged. Use logger (which redacts 'token' keys).
 *   - PKCE codeVerifier is generated server-side and NEVER sent to the browser.
 */

// ============================================================================
// Shared types
// ============================================================================

export type ChannelProvider = "whatsapp" | "instagram" | "facebook" | "google" | "tiktok" | "youtube";

export type ConnectionStatus =
  | "not_connected"
  | "connecting"
  | "connected"
  | "expired"
  | "error"
  | "revoked";

export type NormalizedAccount = {
  externalId: string;
  displayName: string | null;
  username: string | null;
  profilePictureUrl: string | null;
  scopes: string[];
  metadata: Record<string, unknown>;
};

/** A validated, decrypted token set. Never stored in plaintext. */
export type TokenSet = {
  /** AES-GCM ciphertext blob, base64-encoded. Only populated when encryption configured. */
  accessTokenCipher: string;
  /** AES-GCM ciphertext blob, base64-encoded. Only populated when encryption configured. */
  refreshTokenCipher: string | null;
  tokenType: string;
  expiresAt: Date | null;
  refreshExpiresAt: Date | null;
  scopes: string[];
};

export type BuildAuthUrlParams = {
  organizationId: string;
  userId: string;
  returnPath: string;
  /** PKCE codeVerifier generated server-side; passed so adapter can derive codeChallenge. */
  codeVerifier: string | null;
  stateToken: string;
};

export type BuildAuthUrlResult = {
  url: string;
  /** Opaque state token to be stored server-side (hashed) and validated on callback. */
  stateToken: string;
};

export type ExchangeCodeParams = {
  code: string;
  codeVerifier: string | null;
  redirectUri: string;
  organizationId: string;
  userId?: string | null;
};

export type RefreshTokenParams = {
  refreshTokenCipher: string;
  organizationId: string;
  connectionId: string;
};

export type RevokeConnectionParams = {
  accessTokenCipher: string;
  organizationId: string;
  connectionId: string;
};

export type ValidateWebhookSignatureParams = {
  rawBody: string;
  signature: string;
  secret: string;
};

// ============================================================================
// Provider Adapter interface
// ============================================================================

export interface ProviderAdapter {
  readonly provider: ChannelProvider;

  /**
   * Generates the OAuth authorization URL to redirect the user to.
   * Returns the url and the stateToken (which will be hashed and stored server-side).
   * PKCE codeVerifier is provided by the caller (from oauth-state service).
   */
  buildAuthorizationUrl(params: BuildAuthUrlParams): BuildAuthUrlResult;

  /**
   * Exchanges the authorization code for tokens.
   * Throws OAuthConfigurationRequiredError if provider credentials are missing.
   * Throws OAuthTokenEncryptionNotConfiguredError if TOKEN_ENCRYPTION_KEY absent.
   */
  exchangeCode(params: ExchangeCodeParams): Promise<TokenSet>;

  /**
   * Refreshes an access token using the stored refresh token cipher.
   */
  refreshAccessToken(params: RefreshTokenParams): Promise<TokenSet>;

  /**
   * Revokes the OAuth connection with the provider.
   */
  revokeConnection(params: RevokeConnectionParams): Promise<void>;

  /**
   * Normalizes raw provider account data to a common shape.
   */
  normalizeAccount(raw: unknown): NormalizedAccount;

  /**
   * Validates an incoming webhook signature.
   * Returns true if valid.
   */
  validateWebhookSignature(params: ValidateWebhookSignatureParams): boolean;
}

// ============================================================================
// Adapter errors
// ============================================================================

export class OAuthConfigurationRequiredError extends Error {
  code = "configuration_required" as const;
  status = 503;
  constructor(public provider: ChannelProvider) {
    super(`Provider credentials for '${provider}' are not configured.`);
    this.name = "OAuthConfigurationRequiredError";
  }
}

export class OAuthTokenEncryptionNotConfiguredError extends Error {
  code = "token_encryption_not_configured" as const;
  status = 503;
  constructor() {
    super(
      "TOKEN_ENCRYPTION_KEY is not set. OAuth tokens cannot be stored securely. " +
        "Configure the key to enable real OAuth connections.",
    );
    this.name = "OAuthTokenEncryptionNotConfiguredError";
  }
}

export class OAuthStateExpiredError extends Error {
  code = "state_expired" as const;
  status = 400;
  constructor() {
    super("OAuth state token has expired.");
    this.name = "OAuthStateExpiredError";
  }
}

export class OAuthStateConsumedError extends Error {
  code = "state_already_consumed" as const;
  status = 400;
  constructor() {
    super("OAuth state token has already been used.");
    this.name = "OAuthStateConsumedError";
  }
}

export class OAuthStateInvalidError extends Error {
  code = "state_invalid" as const;
  status = 400;
  constructor() {
    super("OAuth state token is invalid.");
    this.name = "OAuthStateInvalidError";
  }
}

export class OAuthOpenRedirectError extends Error {
  code = "open_redirect_blocked" as const;
  status = 400;
  constructor(public attempted: string) {
    super("Return URL is not an allowed internal path.");
    this.name = "OAuthOpenRedirectError";
  }
}

// ============================================================================
// Return path validation (open redirect prevention)
// ============================================================================

const ALLOWED_RETURN_PATH_PREFIX = "/";
const BLOCKED_SCHEMES = ["http:", "https:", "//", "javascript:", "data:"];

export function validateReturnPath(returnPath: string | null | undefined): string {
  const defaultPath = "/settings/integrations";

  if (!returnPath || typeof returnPath !== "string") {
    return defaultPath;
  }

  const trimmed = returnPath.trim();

  // Must start with / and not //
  if (!trimmed.startsWith(ALLOWED_RETURN_PATH_PREFIX) || trimmed.startsWith("//")) {
    throw new OAuthOpenRedirectError(trimmed);
  }

  // Must not contain any blocked scheme
  for (const scheme of BLOCKED_SCHEMES) {
    if (trimmed.includes(scheme)) {
      throw new OAuthOpenRedirectError(trimmed);
    }
  }

  // Must not contain @, which could be used to inject a user in a URL
  if (trimmed.includes("@")) {
    throw new OAuthOpenRedirectError(trimmed);
  }

  // Must not be longer than 512 chars
  if (trimmed.length > 512) {
    throw new OAuthOpenRedirectError(trimmed);
  }

  return trimmed;
}

// ============================================================================
// Stub: MetaAdapter (WhatsApp / Instagram / Facebook)
// ============================================================================

export class MetaAdapter implements ProviderAdapter {
  readonly provider: ChannelProvider;

  constructor(provider: "whatsapp" | "instagram" | "facebook") {
    this.provider = provider;
  }

  private assertConfigured(): void {
    const clientId = process.env.META_CLIENT_ID?.trim();
    const clientSecret = process.env.META_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
      throw new OAuthConfigurationRequiredError(this.provider);
    }
  }

  buildAuthorizationUrl(params: BuildAuthUrlParams): BuildAuthUrlResult {
    this.assertConfigured();

    const clientId = process.env.META_CLIENT_ID!;
    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/meta/callback`;

    const scopes: Record<string, string[]> = {
      whatsapp: ["whatsapp_business_management", "whatsapp_business_messaging"],
      instagram: ["instagram_basic", "instagram_content_publish", "instagram_manage_messages"],
      facebook: ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "pages_manage_metadata", "pages_messaging"],
    };

    const url = new URL("https://www.facebook.com/v20.0/dialog/oauth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", (scopes[this.provider] ?? []).join(","));
    url.searchParams.set("state", params.stateToken);
    url.searchParams.set("response_type", "code");

    return { url: url.toString(), stateToken: params.stateToken };
  }

  async exchangeCode(params: ExchangeCodeParams): Promise<TokenSet> {
    this.assertConfigured();
    assertEncryptionConfigured();

    const clientId = process.env.META_CLIENT_ID!.trim();
    const clientSecret = process.env.META_CLIENT_SECRET!.trim();

    const tokenUrl = new URL("https://graph.facebook.com/v20.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", clientId);
    tokenUrl.searchParams.set("client_secret", clientSecret);
    tokenUrl.searchParams.set("redirect_uri", params.redirectUri);
    tokenUrl.searchParams.set("code", params.code);

    const response = await fetch(tokenUrl.toString(), { method: "GET", cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      token_type?: string;
      expires_in?: number;
      error?: { message?: string };
    };

    if (!response.ok || !data.access_token) {
      throw new Error(data.error?.message || `Meta OAuth code exchange failed (${response.status}).`);
    }

    const expiresAt = typeof data.expires_in === "number"
      ? new Date(Date.now() + data.expires_in * 1000)
      : null;

    return {
      accessTokenCipher: encryptToken(data.access_token),
      refreshTokenCipher: null,
      tokenType: data.token_type || "Bearer",
      expiresAt,
      refreshExpiresAt: null,
      scopes: [],
    };
  }

  async refreshAccessToken(params: RefreshTokenParams): Promise<TokenSet> {
    this.assertConfigured();
    assertEncryptionConfigured();

    const clientId = process.env.META_CLIENT_ID!.trim();
    const clientSecret = process.env.META_CLIENT_SECRET!.trim();
    const currentToken = decryptToken(params.refreshTokenCipher);

    const tokenUrl = new URL("https://graph.facebook.com/v20.0/oauth/access_token");
    tokenUrl.searchParams.set("grant_type", "fb_exchange_token");
    tokenUrl.searchParams.set("client_id", clientId);
    tokenUrl.searchParams.set("client_secret", clientSecret);
    tokenUrl.searchParams.set("fb_exchange_token", currentToken);

    const response = await fetch(tokenUrl.toString(), { method: "GET", cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      token_type?: string;
      expires_in?: number;
      error?: { message?: string };
    };

    if (!response.ok || !data.access_token) {
      throw new Error(data.error?.message || `Meta token refresh failed (${response.status}).`);
    }

    const expiresAt = typeof data.expires_in === "number"
      ? new Date(Date.now() + data.expires_in * 1000)
      : null;

    return {
      accessTokenCipher: encryptToken(data.access_token),
      refreshTokenCipher: encryptToken(data.access_token),
      tokenType: data.token_type || "Bearer",
      expiresAt,
      refreshExpiresAt: expiresAt,
      scopes: [],
    };
  }

  async revokeConnection(params: RevokeConnectionParams): Promise<void> {
    this.assertConfigured();
    void params;
    // Meta doesn't support programmatic revoke; mark as revoked locally only.
  }

  normalizeAccount(raw: unknown): NormalizedAccount {
    const data = raw as Record<string, unknown>;
    return {
      externalId: String(data.id ?? ""),
      displayName: String(data.name ?? ""),
      username: data.username ? String(data.username) : null,
      profilePictureUrl: null,
      scopes: [],
      metadata: {},
    };
  }

  validateWebhookSignature(params: ValidateWebhookSignatureParams): boolean {
    const appSecret = process.env.META_CLIENT_SECRET;
    if (!appSecret || !params.signature) return false;
    const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(params.rawBody, "utf8").digest("hex")}`;
    try {
      return crypto.timingSafeEqual(Buffer.from(params.signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }
}

// ============================================================================
// GoogleAdapter
// ============================================================================

export class GoogleAdapter implements ProviderAdapter {
  readonly provider: ChannelProvider = "google";

  private getCredentials(): { clientId: string; clientSecret: string } {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || process.env.GOOGLE_ADS_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || process.env.GOOGLE_ADS_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
      throw new OAuthConfigurationRequiredError(this.provider);
    }
    return { clientId, clientSecret };
  }

  private assertConfigured(): void {
    this.getCredentials();
  }

  buildAuthorizationUrl(params: BuildAuthUrlParams): BuildAuthUrlResult {
    const { clientId } = this.getCredentials();
    const redirectUri = `${getSiteUrl()}/api/integrations/google/callback`;

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set(
      "scope",
      "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/business.manage openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
    );
    url.searchParams.set("state", params.stateToken);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");

    // PKCE (supported by Google)
    if (params.codeVerifier) {
      const codeChallenge = crypto
        .createHash("sha256")
        .update(params.codeVerifier, "utf8")
        .digest("base64url");
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
    }

    return { url: url.toString(), stateToken: params.stateToken };
  }

  async exchangeCode(params: ExchangeCodeParams): Promise<TokenSet> {
    const { clientId, clientSecret } = this.getCredentials();
    assertEncryptionConfigured();

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: params.code,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    });

    if (params.codeVerifier) {
      body.set("code_verifier", params.codeVerifier);
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });

    const data = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      token_type?: string;
      expires_in?: number;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (!response.ok || !data.access_token) {
      throw new Error(
        data.error_description || data.error || `Google OAuth token exchange failed (${response.status}).`,
      );
    }

    const scopes = typeof data.scope === "string"
      ? data.scope.split(" ").map((s) => s.trim()).filter(Boolean)
      : ["https://www.googleapis.com/auth/calendar.events"];
    const expiresAt = typeof data.expires_in === "number"
      ? new Date(Date.now() + data.expires_in * 1000)
      : new Date(Date.now() + 3600 * 1000);

    const tokenSet: TokenSet = {
      accessTokenCipher: encryptToken(data.access_token),
      refreshTokenCipher: data.refresh_token ? encryptToken(data.refresh_token) : null,
      tokenType: data.token_type || "Bearer",
      expiresAt,
      refreshExpiresAt: null,
      scopes,
    };

    let displayName = "Google Account";
    let externalAccountId = "primary";

    try {
      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${data.access_token}` },
        cache: "no-store",
      });
      if (userRes.ok) {
        const userInfo = (await userRes.json()) as { id?: string; email?: string; name?: string };
        if (userInfo.email) {
          displayName = userInfo.name ? `${userInfo.name} (${userInfo.email})` : userInfo.email;
          externalAccountId = userInfo.id || userInfo.email;
        }
      }
    } catch {
      // Best-effort profile retrieval
    }

    try {
      const connection = await upsertChannelConnection({
        organizationId: params.organizationId,
        provider: "google",
        status: "connected",
        displayName,
        externalAccountId,
        scopes,
        createdByUserId: params.userId ?? null,
      });

      if ("error" in connection) {
        throw new Error(connection.error);
      }

      const admin = createSupabaseAdminClient();
      const { error: tokenError } = await admin.from("integration_tokens").upsert(
        {
          organization_id: params.organizationId,
          connection_id: connection.id,
          provider: "google",
          access_token_cipher: tokenSet.accessTokenCipher,
          refresh_token_cipher: tokenSet.refreshTokenCipher,
          token_type: tokenSet.tokenType,
          expires_at: tokenSet.expiresAt ? tokenSet.expiresAt.toISOString() : null,
          scopes: tokenSet.scopes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "connection_id" },
      );

      if (tokenError) {
        throw new Error(tokenError.message);
      }
    } catch (err) {
      const isMissingEnv = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!isMissingEnv) {
        throw err;
      }
    }

    return tokenSet;
  }

  async refreshAccessToken(params: RefreshTokenParams): Promise<TokenSet> {
    const { clientId, clientSecret } = this.getCredentials();
    assertEncryptionConfigured();

    const refreshToken = decryptToken(params.refreshTokenCipher);

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });

    const data = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      token_type?: string;
      expires_in?: number;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (!response.ok || !data.access_token) {
      throw new Error(
        data.error_description || data.error || `Google OAuth token refresh failed (${response.status}).`,
      );
    }

    const scopes = typeof data.scope === "string"
      ? data.scope.split(" ").map((s) => s.trim()).filter(Boolean)
      : [];
    const expiresAt = typeof data.expires_in === "number"
      ? new Date(Date.now() + data.expires_in * 1000)
      : new Date(Date.now() + 3600 * 1000);

    return {
      accessTokenCipher: encryptToken(data.access_token),
      refreshTokenCipher: data.refresh_token ? encryptToken(data.refresh_token) : params.refreshTokenCipher,
      tokenType: data.token_type || "Bearer",
      expiresAt,
      refreshExpiresAt: null,
      scopes,
    };
  }

  async revokeConnection(params: RevokeConnectionParams): Promise<void> {
    this.assertConfigured();
    const token = decryptToken(params.accessTokenCipher);
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      cache: "no-store",
    });
  }

  normalizeAccount(raw: unknown): NormalizedAccount {
    const data = raw as Record<string, unknown>;
    return {
      externalId: String(data.name ?? ""),
      displayName: String(data.title ?? ""),
      username: null,
      profilePictureUrl: null,
      scopes: [],
      metadata: {},
    };
  }

  validateWebhookSignature(params: ValidateWebhookSignatureParams): boolean {
    void params;
    return false; // Stub
  }
}

// ============================================================================
// TikTokAdapter (TikTok Login Kit & Content Posting API v2)
// ============================================================================

export class TikTokAdapter implements ProviderAdapter {
  readonly provider: ChannelProvider = "tiktok";

  private getCredentials(): { clientKey: string; clientSecret: string } {
    const clientKey =
      process.env.TIKTOK_CLIENT_KEY?.trim() ||
      process.env.TIKTOK_CLIENT_ID?.trim() ||
      process.env.TIKTOK_APP_ID?.trim();
    const clientSecret =
      process.env.TIKTOK_CLIENT_SECRET?.trim() ||
      process.env.TIKTOK_APP_SECRET?.trim();
    if (!clientKey || !clientSecret) {
      throw new OAuthConfigurationRequiredError(this.provider);
    }
    return { clientKey, clientSecret };
  }

  private assertConfigured(): void {
    this.getCredentials();
  }

  buildAuthorizationUrl(params: BuildAuthUrlParams): BuildAuthUrlResult {
    const { clientKey } = this.getCredentials();
    const redirectUri = `${getSiteUrl()}/api/integrations/tiktok/callback`;

    // TikTok Login Kit & Content Posting API v2
    const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
    url.searchParams.set("client_key", clientKey);
    url.searchParams.set("scope", "user.info.basic,video.upload,video.publish");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", params.stateToken);

    // PKCE: TikTok supports S256
    if (params.codeVerifier) {
      const codeChallenge = crypto
        .createHash("sha256")
        .update(params.codeVerifier, "utf8")
        .digest("base64url");
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
    }

    return { url: url.toString(), stateToken: params.stateToken };
  }

  async exchangeCode(params: ExchangeCodeParams): Promise<TokenSet> {
    const { clientKey, clientSecret } = this.getCredentials();
    assertEncryptionConfigured();

    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code: params.code,
      grant_type: "authorization_code",
      redirect_uri: params.redirectUri,
    });

    if (params.codeVerifier) {
      body.set("code_verifier", params.codeVerifier);
    }

    const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });

    const data = (await response.json().catch(() => ({}))) as {
      data?: {
        access_token?: string;
        refresh_token?: string;
        token_type?: string;
        expires_in?: number;
        refresh_expires_in?: number;
        scope?: string;
        open_id?: string;
      };
      error?: {
        code?: string | number;
        message?: string;
      };
    };

    if (!response.ok || !data.data?.access_token) {
      throw new Error(
        data.error?.message || `TikTok OAuth token exchange failed (${response.status}).`,
      );
    }

    const scopes = typeof data.data.scope === "string"
      ? data.data.scope.split(",").map((s) => s.trim()).filter(Boolean)
      : ["user.info.basic", "video.upload", "video.publish"];

    const expiresAt = typeof data.data.expires_in === "number"
      ? new Date(Date.now() + data.data.expires_in * 1000)
      : new Date(Date.now() + 86400 * 1000);

    const refreshExpiresAt = typeof data.data.refresh_expires_in === "number"
      ? new Date(Date.now() + data.data.refresh_expires_in * 1000)
      : null;

    let displayName = "TikTok Channel";
    let externalAccountId = data.data.open_id || "primary";

    try {
      const userRes = await fetch(
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username",
        {
          headers: { Authorization: `Bearer ${data.data.access_token}` },
          cache: "no-store",
        },
      );
      if (userRes.ok) {
        const userData = (await userRes.json()) as {
          data?: { user?: { display_name?: string; username?: string; open_id?: string } };
        };
        if (userData.data?.user) {
          displayName = userData.data.user.display_name || userData.data.user.username || displayName;
          externalAccountId = userData.data.user.open_id || externalAccountId;
        }
      }
    } catch {
      // Best-effort profile fetch
    }

    const tokenSet: TokenSet = {
      accessTokenCipher: encryptToken(data.data.access_token),
      refreshTokenCipher: data.data.refresh_token ? encryptToken(data.data.refresh_token) : null,
      tokenType: data.data.token_type || "Bearer",
      expiresAt,
      refreshExpiresAt,
      scopes,
    };

    try {
      const connection = await upsertChannelConnection({
        organizationId: params.organizationId,
        provider: "tiktok",
        status: "connected",
        displayName,
        externalAccountId,
        scopes,
        createdByUserId: params.userId ?? null,
      });

      if ("error" in connection) {
        throw new Error(connection.error);
      }

      const admin = createSupabaseAdminClient();
      const { error: tokenError } = await admin.from("integration_tokens").upsert(
        {
          organization_id: params.organizationId,
          connection_id: connection.id,
          provider: "tiktok",
          access_token_cipher: tokenSet.accessTokenCipher,
          refresh_token_cipher: tokenSet.refreshTokenCipher,
          token_type: tokenSet.tokenType,
          expires_at: tokenSet.expiresAt ? tokenSet.expiresAt.toISOString() : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "connection_id" },
      );

      if (tokenError) {
        throw new Error(tokenError.message);
      }
    } catch (err) {
      const isMissingEnv = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!isMissingEnv) {
        throw err;
      }
    }

    return tokenSet;
  }

  async refreshAccessToken(params: RefreshTokenParams): Promise<TokenSet> {
    const { clientKey, clientSecret } = this.getCredentials();
    assertEncryptionConfigured();

    const refreshToken = decryptToken(params.refreshTokenCipher);

    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });

    const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });

    const data = (await response.json().catch(() => ({}))) as {
      data?: {
        access_token?: string;
        refresh_token?: string;
        token_type?: string;
        expires_in?: number;
        refresh_expires_in?: number;
        scope?: string;
      };
      error?: { code?: string | number; message?: string };
    };

    if (!response.ok || !data.data?.access_token) {
      throw new Error(
        data.error?.message || `TikTok OAuth token refresh failed (${response.status}).`,
      );
    }

    const scopes = typeof data.data.scope === "string"
      ? data.data.scope.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const expiresAt = typeof data.data.expires_in === "number"
      ? new Date(Date.now() + data.data.expires_in * 1000)
      : new Date(Date.now() + 86400 * 1000);
    const refreshExpiresAt = typeof data.data.refresh_expires_in === "number"
      ? new Date(Date.now() + data.data.refresh_expires_in * 1000)
      : null;

    return {
      accessTokenCipher: encryptToken(data.data.access_token),
      refreshTokenCipher: data.data.refresh_token ? encryptToken(data.data.refresh_token) : params.refreshTokenCipher,
      tokenType: data.data.token_type || "Bearer",
      expiresAt,
      refreshExpiresAt,
      scopes,
    };
  }

  async revokeConnection(params: RevokeConnectionParams): Promise<void> {
    const { clientKey, clientSecret } = this.getCredentials();
    const token = decryptToken(params.accessTokenCipher);

    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      token,
    });

    await fetch("https://open.tiktokapis.com/v2/oauth/revoke/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    }).catch(() => {});
  }

  normalizeAccount(raw: unknown): NormalizedAccount {
    const data = raw as Record<string, unknown>;
    const user = (data.user as Record<string, unknown>) || data;
    return {
      externalId: String(user.open_id ?? user.id ?? user.advertiser_id ?? ""),
      displayName: (user.display_name ?? user.advertiser_name ?? user.username ?? null) as string | null,
      username: (user.username ?? null) as string | null,
      profilePictureUrl: (user.avatar_url ?? null) as string | null,
      scopes: [],
      metadata: {},
    };
  }

  validateWebhookSignature(params: ValidateWebhookSignatureParams): boolean {
    void params;
    return false;
  }
}


// ============================================================================
// Stub: YouTubeAdapter
// ============================================================================

export class YouTubeAdapter implements ProviderAdapter {
  readonly provider: ChannelProvider = "youtube";

  private getCredentials(): { clientId: string; clientSecret: string } {
    const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
      throw new OAuthConfigurationRequiredError(this.provider);
    }
    return { clientId, clientSecret };
  }

  private assertConfigured(): void {
    this.getCredentials();
  }

  buildAuthorizationUrl(params: BuildAuthUrlParams): BuildAuthUrlResult {
    const { clientId } = this.getCredentials();
    const redirectUri = `${getSiteUrl()}/api/integrations/youtube/callback`;

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set(
      "scope",
      "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.profile",
    );
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", params.stateToken);

    if (params.codeVerifier) {
      const codeChallenge = crypto
        .createHash("sha256")
        .update(params.codeVerifier)
        .digest("base64url");
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
    }

    return { url: url.toString(), stateToken: params.stateToken };
  }

  async exchangeCode(params: ExchangeCodeParams): Promise<TokenSet> {
    const { clientId, clientSecret } = this.getCredentials();
    assertEncryptionConfigured();

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: params.code,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    });

    if (params.codeVerifier) {
      body.set("code_verifier", params.codeVerifier);
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`YouTube OAuth token exchange failed: ${response.status} ${errText}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      token_type?: string;
      expires_in?: number;
      scope?: string;
    };

    if (!data.access_token) {
      throw new Error("YouTube OAuth response did not contain access_token");
    }

    const scopes = typeof data.scope === "string"
      ? data.scope.split(" ").map((s) => s.trim()).filter(Boolean)
      : ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];
    const expiresAt = typeof data.expires_in === "number"
      ? new Date(Date.now() + data.expires_in * 1000)
      : new Date(Date.now() + 3600 * 1000);

    const tokenSet: TokenSet = {
      accessTokenCipher: encryptToken(data.access_token),
      refreshTokenCipher: data.refresh_token ? encryptToken(data.refresh_token) : null,
      tokenType: data.token_type || "Bearer",
      expiresAt,
      refreshExpiresAt: null,
      scopes,
    };

    let channelTitle = "YouTube Channel";
    let channelId = "primary";
    try {
      const channelRes = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
        headers: { Authorization: `Bearer ${data.access_token}` },
        cache: "no-store",
      });
      if (channelRes.ok) {
        const channelData = (await channelRes.json()) as { items?: Array<{ id: string; snippet?: { title?: string } }> };
        if (channelData.items && channelData.items.length > 0) {
          channelId = channelData.items[0].id;
          channelTitle = channelData.items[0].snippet?.title || channelTitle;
        }
      }
    } catch {
      // Best-effort channel metadata retrieval
    }

    try {
      const connection = await upsertChannelConnection({
        organizationId: params.organizationId,
        provider: "youtube",
        status: "connected",
        displayName: channelTitle,
        externalAccountId: channelId,
        scopes,
        createdByUserId: params.userId ?? null,
      });

      if ("error" in connection) {
        throw new Error(connection.error);
      }

      const admin = createSupabaseAdminClient();
      const { error: tokenError } = await admin.from("integration_tokens").upsert(
        {
          organization_id: params.organizationId,
          connection_id: connection.id,
          provider: "youtube",
          access_token_cipher: tokenSet.accessTokenCipher,
          refresh_token_cipher: tokenSet.refreshTokenCipher,
          token_type: tokenSet.tokenType,
          expires_at: tokenSet.expiresAt ? tokenSet.expiresAt.toISOString() : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "connection_id" },
      );

      if (tokenError) {
        throw new Error(tokenError.message);
      }
    } catch (err) {
      const isMissingEnv = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!isMissingEnv) {
        throw err;
      }
    }

    return tokenSet;
  }

  async refreshAccessToken(params: RefreshTokenParams): Promise<TokenSet> {
    const { clientId, clientSecret } = this.getCredentials();
    assertEncryptionConfigured();

    const refreshToken = decryptToken(params.refreshTokenCipher);
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error(`YouTube token refresh failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      token_type?: string;
      expires_in?: number;
      scope?: string;
    };

    const expiresAt = typeof data.expires_in === "number"
      ? new Date(Date.now() + data.expires_in * 1000)
      : new Date(Date.now() + 3600 * 1000);

    return {
      accessTokenCipher: encryptToken(data.access_token),
      refreshTokenCipher: data.refresh_token ? encryptToken(data.refresh_token) : params.refreshTokenCipher,
      tokenType: data.token_type || "Bearer",
      expiresAt,
      refreshExpiresAt: null,
      scopes: typeof data.scope === "string" ? data.scope.split(" ") : [],
    };
  }

  async revokeConnection(params: RevokeConnectionParams): Promise<void> {
    this.assertConfigured();
    try {
      const accessToken = decryptToken(params.accessTokenCipher);
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
    } catch {
      // Best-effort provider revocation
    }
  }

  normalizeAccount(raw: unknown): NormalizedAccount {
    const data = raw as Record<string, unknown>;
    const snippet = (data.snippet as Record<string, unknown>) || {};
    return {
      externalId: String(data.id ?? ""),
      displayName: String(snippet.title ?? data.title ?? data.name ?? ""),
      username: (snippet.customUrl as string) ?? null,
      profilePictureUrl: ((snippet.thumbnails as Record<string, unknown>)?.default as Record<string, unknown>)?.url as string ?? null,
      scopes: [],
      metadata: {},
    };
  }

  validateWebhookSignature(params: ValidateWebhookSignatureParams): boolean {
    void params;
    return false;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function getProviderAdapter(provider: ChannelProvider): ProviderAdapter {
  switch (provider) {
    case "whatsapp":
      return new MetaAdapter("whatsapp");
    case "instagram":
      return new MetaAdapter("instagram");
    case "facebook":
      return new MetaAdapter("facebook");
    case "google":
      return new GoogleAdapter();
    case "tiktok":
      return new TikTokAdapter();
    case "youtube":
      return new YouTubeAdapter();
    default: {
      const _exhaustive: never = provider;
      void _exhaustive;
      throw new Error(`Unknown provider: ${String(provider)}`);
    }
  }
}

export function isProviderConfigured(provider: ChannelProvider): boolean {
  try {
    const adapter = getProviderAdapter(provider);
    // Attempt to build a URL with dummy params; if config check throws, it's not configured.
    adapter.buildAuthorizationUrl({
      organizationId: "test",
      userId: "test",
      returnPath: "/settings/integrations",
      codeVerifier: null,
      stateToken: "test",
    });
    return true;
  } catch (err) {
    if (err instanceof OAuthConfigurationRequiredError) return false;
    return false;
  }
}

// ============================================================================
// Encryption guard
// ============================================================================

function assertEncryptionConfigured(): void {
  const key = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!key) {
    throw new OAuthTokenEncryptionNotConfiguredError();
  }
}
