
import type {
  SocialPlatform,
  PublishResult,
  OAuthTokens,
  ProviderCapabilities,
  SocialMediaPublishInput,
} from "@/types/social-media";

/**
 * Error raised by social media providers.
 *
 * Mirrors `lib/ai-errors.ts`: never fabricate a successful publish when the
 * provider is misconfigured or unreachable. Surface-safe codes let the API
 * layer map to HTTP status without leaking raw provider errors.
 */
export class SocialMediaError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_CONFIGURED" | "TRANSIENT" | "PERMANENT" | "VALIDATION",
    public readonly statusCode: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SocialMediaError";
  }

  static notConfigured(platform: string, hint?: string): SocialMediaError {
    return new SocialMediaError(
      `${platform} provider is not configured. ${hint ?? "Add OAuth credentials and connect an account to publish."}`,
      "NOT_CONFIGURED",
      503,
    );
  }

  static transient(message: string, cause?: unknown): SocialMediaError {
    return new SocialMediaError(message, "TRANSIENT", 502, cause);
  }

  static permanent(message: string, cause?: unknown): SocialMediaError {
    return new SocialMediaError(message, "PERMANENT", 500, cause);
  }

  static validation(message: string): SocialMediaError {
    return new SocialMediaError(message, "VALIDATION", 400);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
    };
  }
}

export function isSocialMediaError(error: unknown): error is SocialMediaError {
  return error instanceof SocialMediaError;
}

/** Contract every platform provider must implement. */
export interface SocialMediaProvider {
  readonly platform: SocialPlatform;
  /** Human-readable label shown in the account picker. */
  readonly label: string;
  /** Capabilities the UI can gate on (e.g. hide Reels for platforms without it). */
  readonly capabilities: ProviderCapabilities;

  /** Build the OAuth authorize URL for the given state/redirect/scopes. */
  authorizeUrl(state: string, redirectUri: string, scopes?: string[]): string;

  /** Exchange an authorization code for tokens. Throws NOT_CONFIGURED without credentials. */
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens>;

  /** Refresh an expired access token. */
  refreshToken(refreshToken: string): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }>;

  /** Publish a post. Returns the platform-assigned post id/url. */
  publish(
    accessToken: string,
    post: SocialMediaPublishInput,
  ): Promise<PublishResult>;

  /** Fetch the connected account identity for a token. */
  getAccount(accessToken: string): Promise<{
    platform_account_id: string;
    username?: string | null;
    profile_picture_url?: string | null;
  }>;

  /** Optional: fetch post-level analytics. */
  getAnalytics?: (
    accessToken: string,
    platformPostId: string,
  ) => Promise<Record<string, unknown>>;
}

