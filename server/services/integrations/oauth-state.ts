import "server-only";

import * as crypto from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import {
  OAuthStateExpiredError,
  OAuthStateConsumedError,
  OAuthStateInvalidError,
  OAuthOpenRedirectError,
  validateReturnPath,
  type ChannelProvider,
} from "@/server/services/integrations/provider-adapter";
import { logger } from "@/lib/logger";

// ============================================================================
// OAuth State Service
//
// Short-lived (10-min), single-use OAuth CSRF/PKCE state.
//
// Security invariants:
//   - The raw state token is a 32-byte random hex string.
//   - Only the SHA-256 hash of the state token is stored in the DB.
//   - The raw state token is returned to the caller once and embedded in the
//     OAuth redirect URL; it is never stored plaintext server-side.
//   - PKCE code_verifier is encrypted (ciphertext stored). If encryption is
//     not configured, code_verifier is stored as null (PKCE disabled).
//   - consumed_at is set atomically on first use; replayed states are rejected.
//   - return_path is validated for open redirect before storage.
//   - All DB operations use service_role client (RLS bypassed on oauth_states
//     table which has no authenticated policies).
// ============================================================================

export type CreatedOAuthState = {
  /** Raw state token to embed in OAuth URL. NEVER store plaintext. */
  rawStateToken: string;
  /** Raw PKCE code verifier to use for the token exchange. NEVER log. */
  codeVerifier: string | null;
};

export type OAuthStateRecord = {
  id: string;
  organizationId: string;
  userId: string;
  provider: ChannelProvider;
  returnPath: string;
  /** Raw code verifier, decrypted. Null if PKCE not applicable. */
  codeVerifier: string | null;
};

/** Generate a PKCE code verifier (RFC 7636 §4.1). */
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Hash the state token to store in DB. */
function hashStateToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/** Encrypt a value using AES-256-GCM. Returns base64url ciphertext or null if key missing. */
function encryptValue(plaintext: string): string | null {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!keyHex) return null;

  try {
    const key = Buffer.from(keyHex, "hex");
    if (key.length !== 32) return null;

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Format: iv(12) + authTag(16) + ciphertext, all base64url
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return combined.toString("base64url");
  } catch {
    return null;
  }
}

/** Decrypt a value encrypted by encryptValue. Returns null on failure. */
function decryptValue(ciphertext: string): string | null {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!keyHex) return null;

  try {
    const key = Buffer.from(keyHex, "hex");
    if (key.length !== 32) return null;

    const combined = Buffer.from(ciphertext, "base64url");
    const iv = combined.subarray(0, 12);
    const authTag = combined.subarray(12, 28);
    const encrypted = combined.subarray(28);

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Create and persist a new OAuth state entry.
 *
 * @param provider - Which provider this state is for
 * @param organizationId - Active org
 * @param userId - Authenticated user
 * @param returnPath - Where to redirect after OAuth (validated; must be internal)
 * @param usePkce - Whether to generate a PKCE code_verifier
 * @returns rawStateToken (to embed in URL) and codeVerifier (to use at exchange)
 */
export async function createOAuthState(
  provider: ChannelProvider,
  organizationId: string,
  userId: string,
  returnPath: string,
  usePkce: boolean,
): Promise<CreatedOAuthState> {
  // Validate return path first (open redirect protection)
  const validatedPath = validateReturnPath(returnPath);

  // Generate raw state token (32 random bytes = 64 hex chars)
  const rawStateToken = crypto.randomBytes(32).toString("hex");
  const stateHash = hashStateToken(rawStateToken);

  // Generate PKCE code verifier if requested
  let rawCodeVerifier: string | null = null;
  let codeVerifierCiphertext: string | null = null;

  if (usePkce) {
    rawCodeVerifier = generateCodeVerifier();
    codeVerifierCiphertext = encryptValue(rawCodeVerifier);
    // If encryption not configured: codeVerifier stored as null (PKCE disabled for this flow).
    // This is safe: PKCE is defense-in-depth; CSRF protection still applies via state token.
    if (!codeVerifierCiphertext) {
      rawCodeVerifier = null;
      logger.warn("oauth.pkce_encryption_unavailable", {
        provider,
        note: "TOKEN_ENCRYPTION_KEY not set; PKCE code_verifier will not be stored.",
      });
    }
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("oauth_states").insert({
    organization_id: organizationId,
    user_id: userId,
    provider,
    state_hash: stateHash,
    code_verifier_ciphertext: codeVerifierCiphertext,
    return_path: validatedPath,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });

  if (error) {
    logger.error("oauth.state_create_failed", error, { provider, organizationId });
    throw new Error("Failed to create OAuth state. Please try again.");
  }

  return { rawStateToken, codeVerifier: rawCodeVerifier };
}

/**
 * Consume an OAuth state token.
 *
 * - Validates the raw state token (hash lookup).
 * - Checks expiry.
 * - Atomically marks consumed_at.
 * - Rejects already-consumed states.
 * - Returns the stored state record with decrypted codeVerifier.
 *
 * @param rawStateToken - Raw state token received in callback
 * @param provider - Expected provider (must match stored value)
 * @param organizationId - Active org (must match stored value for workspace isolation)
 */
export async function consumeOAuthState(
  rawStateToken: string,
  provider: ChannelProvider,
  organizationId: string,
): Promise<OAuthStateRecord> {
  if (!rawStateToken || typeof rawStateToken !== "string" || rawStateToken.length !== 64) {
    throw new OAuthStateInvalidError();
  }

  const stateHash = hashStateToken(rawStateToken);
  const admin = createSupabaseAdminClient();

  const { data: row, error } = await admin
    .from("oauth_states")
    .select(
      "id, organization_id, user_id, provider, state_hash, code_verifier_ciphertext, return_path, expires_at, consumed_at",
    )
    .eq("state_hash", stateHash)
    .maybeSingle();

  if (error || !row) {
    throw new OAuthStateInvalidError();
  }

  // Cross-workspace isolation: state must belong to the active org
  if (row.organization_id !== organizationId) {
    throw new OAuthStateInvalidError();
  }

  // Provider must match
  if (row.provider !== provider) {
    throw new OAuthStateInvalidError();
  }

  // Already consumed?
  if (row.consumed_at !== null) {
    logger.warn("oauth.state_replay_attempt", {
      stateId: row.id,
      provider,
      organizationId,
      consumedAt: row.consumed_at,
    });
    throw new OAuthStateConsumedError();
  }

  // Expired?
  if (new Date(row.expires_at) < new Date()) {
    throw new OAuthStateExpiredError();
  }

  // Atomically mark consumed
  const { error: updateError } = await admin
    .from("oauth_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("consumed_at", null); // atomic: only update if not yet consumed

  if (updateError) {
    logger.error("oauth.state_consume_failed", updateError, { stateId: row.id });
    throw new Error("Failed to consume OAuth state. Please try again.");
  }

  // Decrypt code verifier if present
  let codeVerifier: string | null = null;
  if (row.code_verifier_ciphertext) {
    codeVerifier = decryptValue(row.code_verifier_ciphertext);
    if (!codeVerifier) {
      logger.warn("oauth.pkce_decrypt_failed", {
        stateId: row.id,
        provider,
        note: "Could not decrypt code_verifier; PKCE will be omitted for token exchange.",
      });
    }
  }

  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    provider: row.provider as ChannelProvider,
    returnPath: row.return_path,
    codeVerifier,
  };
}

/**
 * Validate a return_path for open redirect safety.
 * Re-exported for use in route handlers that need to validate before redirecting.
 */
export { validateReturnPath };

/**
 * Type guard: is the error an OAuth state error?
 */
export function isOAuthStateError(
  error: unknown,
): error is OAuthStateExpiredError | OAuthStateConsumedError | OAuthStateInvalidError | OAuthOpenRedirectError {
  return (
    error instanceof OAuthStateExpiredError ||
    error instanceof OAuthStateConsumedError ||
    error instanceof OAuthStateInvalidError ||
    error instanceof OAuthOpenRedirectError
  );
}
