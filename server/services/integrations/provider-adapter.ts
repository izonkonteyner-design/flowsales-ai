import "server-only";

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

export type ChannelProvider = "whatsapp" | "instagram" | "facebook" | "google" | "tiktok";

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
      instagram: ["instagram_basic", "instagram_manage_messages"],
      facebook: ["pages_manage_metadata", "pages_messaging"],
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
    void params;
    // Stub: real implementation would call Meta token endpoint
    throw new OAuthConfigurationRequiredError(this.provider);
  }

  async refreshAccessToken(params: RefreshTokenParams): Promise<TokenSet> {
    this.assertConfigured();
    assertEncryptionConfigured();
    void params;
    throw new OAuthConfigurationRequiredError(this.provider);
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
    if (!appSecret) return false;
    void params;
    return false; // Stub: always reject until real implementation
  }
}

// ============================================================================
// Stub: GoogleAdapter
// ============================================================================

export class GoogleAdapter implements ProviderAdapter {
  readonly provider: ChannelProvider = "google";

  private assertConfigured(): void {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
      throw new OAuthConfigurationRequiredError(this.provider);
    }
  }

  buildAuthorizationUrl(params: BuildAuthUrlParams): BuildAuthUrlResult {
    this.assertConfigured();

    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/google/callback`;

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "https://www.googleapis.com/auth/business.manage");
    url.searchParams.set("state", params.stateToken);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");

    // PKCE (supported by Google)
    if (params.codeVerifier) {
      // real: derive codeChallenge = base64url(sha256(codeVerifier))
      // Stub: omit for now; full PKCE wires in final implementation
      url.searchParams.set("code_challenge_method", "S256");
    }

    return { url: url.toString(), stateToken: params.stateToken };
  }

  async exchangeCode(params: ExchangeCodeParams): Promise<TokenSet> {
    this.assertConfigured();
    assertEncryptionConfigured();
    void params;
    throw new OAuthConfigurationRequiredError(this.provider);
  }

  async refreshAccessToken(params: RefreshTokenParams): Promise<TokenSet> {
    this.assertConfigured();
    assertEncryptionConfigured();
    void params;
    throw new OAuthConfigurationRequiredError(this.provider);
  }

  async revokeConnection(params: RevokeConnectionParams): Promise<void> {
    this.assertConfigured();
    void params;
    // Google: POST https://oauth2.googleapis.com/revoke?token=<decrypted_access_token>
    // Stub: not implemented
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
// Stub: TikTokAdapter
// ============================================================================

export class TikTokAdapter implements ProviderAdapter {
  readonly provider: ChannelProvider = "tiktok";

  private assertConfigured(): void {
    const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();
    if (!clientKey || !clientSecret) {
      throw new OAuthConfigurationRequiredError(this.provider);
    }
  }

  buildAuthorizationUrl(params: BuildAuthUrlParams): BuildAuthUrlResult {
    this.assertConfigured();

    const clientKey = process.env.TIKTOK_CLIENT_KEY!;
    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/tiktok/callback`;

    // TikTok for Business OAuth 2.0
    const url = new URL("https://business-api.tiktok.com/portal/auth");
    url.searchParams.set("app_id", clientKey);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", params.stateToken);

    // PKCE: TikTok supports S256
    if (params.codeVerifier) {
      url.searchParams.set("code_challenge_method", "S256");
    }

    return { url: url.toString(), stateToken: params.stateToken };
  }

  async exchangeCode(params: ExchangeCodeParams): Promise<TokenSet> {
    this.assertConfigured();
    assertEncryptionConfigured();
    void params;
    throw new OAuthConfigurationRequiredError(this.provider);
  }

  async refreshAccessToken(params: RefreshTokenParams): Promise<TokenSet> {
    this.assertConfigured();
    assertEncryptionConfigured();
    void params;
    throw new OAuthConfigurationRequiredError(this.provider);
  }

  async revokeConnection(params: RevokeConnectionParams): Promise<void> {
    this.assertConfigured();
    void params;
    // Stub
  }

  normalizeAccount(raw: unknown): NormalizedAccount {
    const data = raw as Record<string, unknown>;
    return {
      externalId: String(data.advertiser_id ?? ""),
      displayName: String(data.advertiser_name ?? ""),
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
