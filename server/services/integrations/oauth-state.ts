import "server-only";

import * as crypto from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import {
  OAuthStateExpiredError,
  OAuthStateConsumedError,
  OAuthStateInvalidError,
  OAuthOpenRedirectError,
  OAuthTokenEncryptionNotConfiguredError,
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
//     not configured for a PKCE flow, throws OAuthTokenEncryptionNotConfiguredError (fail closed).
//   - consumed_at is set atomically on first use; replayed states are rejected.
//   - user_id is strictly bound; different users cannot consume each other's states.
//   - return_path is validated for open redirect before storage.
//   - All DB operations use service_role client.
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

  // Generate PKCE code verifier if requested (FAIL CLOSED if encryption key missing)
  let rawCodeVerifier: string | null = null;
  let codeVerifierCiphertext: string | null = null;

  if (usePkce) {
    rawCodeVerifier = generateCodeVerifier();
    codeVerifierCiphertext = encryptValue(rawCodeVerifier);
    if (!codeVerifierCiphertext) {
      logger.warn("oauth.pkce_encryption_missing", {
        provider,
        organizationId,
        note: "TOKEN_ENCRYPTION_KEY required for PKCE OAuth flow.",
      });
      throw new OAuthTokenEncryptionNotConfiguredError();
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
 * Consume an OAuth state token atomically.
 *
 * - Binds state_hash, provider, organization_id, AND user_id.
 * - Atomically checks consumed_at IS NULL and expires_at > NOW.
 * - Sets consumed_at = NOW() in a single atomic update.
 * - If 0 rows updated, inspects reason to throw exact typed error.
 * - Decrypts PKCE codeVerifier if present.
 *
 * @param rawStateToken - Raw state token received in callback
 * @param provider - Expected provider
 * @param organizationId - Expected org ID
 * @param userId - Current authenticated user ID (binds state to initiator)
 */
export async function consumeOAuthState(
  rawStateToken: string,
  provider: ChannelProvider,
  organizationId: string,
  userId: string,
): Promise<OAuthStateRecord> {
  if (!rawStateToken || typeof rawStateToken !== "string" || rawStateToken.length !== 64) {
    throw new OAuthStateInvalidError();
  }

  if (!userId || typeof userId !== "string") {
    throw new OAuthStateInvalidError();
  }

  const stateHash = hashStateToken(rawStateToken);
  const admin = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  // Primary: Attempt atomic RPC `consume_oauth_state`
  try {
    const { data: rpcData, error: rpcError } = await admin.rpc("consume_oauth_state", {
      p_state_hash: stateHash,
      p_provider: provider,
      p_organization_id: organizationId,
      p_user_id: userId,
    });

    if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
      const row = rpcData[0];
      let codeVerifier: string | null = null;
      if (row.code_verifier_ciphertext) {
        codeVerifier = decryptValue(row.code_verifier_ciphertext);
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
  } catch {
    // Fall back to atomic query below if RPC is not present in mock DB / environment
  }

  // Fallback: Atomic PostgreSQL UPDATE ... RETURNING query
  const { data: updatedRow } = await admin
    .from("oauth_states")
    .update({ consumed_at: nowIso })
    .eq("state_hash", stateHash)
    .eq("provider", provider)
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .is("consumed_at", null)
    .gt("expires_at", nowIso)
    .select("id, organization_id, user_id, provider, code_verifier_ciphertext, return_path")
    .maybeSingle();

  if (updatedRow) {
    let codeVerifier: string | null = null;
    if (updatedRow.code_verifier_ciphertext) {
      codeVerifier = decryptValue(updatedRow.code_verifier_ciphertext);
    }
    return {
      id: updatedRow.id,
      organizationId: updatedRow.organization_id,
      userId: updatedRow.user_id,
      provider: updatedRow.provider as ChannelProvider,
      returnPath: updatedRow.return_path,
      codeVerifier,
    };
  }

  // Atomic update affected 0 rows -> diagnose root cause for precise security error
  const { data: existing } = await admin
    .from("oauth_states")
    .select("id, organization_id, user_id, provider, expires_at, consumed_at")
    .eq("state_hash", stateHash)
    .maybeSingle();

  if (!existing) {
    throw new OAuthStateInvalidError();
  }

  if (
    existing.organization_id !== organizationId ||
    existing.provider !== provider ||
    existing.user_id !== userId
  ) {
    throw new OAuthStateInvalidError();
  }

  if (existing.consumed_at !== null) {
    logger.warn("oauth.state_replay_attempt", {
      stateId: existing.id,
      provider,
      organizationId,
      userId,
      consumedAt: existing.consumed_at,
    });
    throw new OAuthStateConsumedError();
  }

  if (new Date(existing.expires_at) <= new Date()) {
    throw new OAuthStateExpiredError();
  }

  throw new OAuthStateInvalidError();
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
