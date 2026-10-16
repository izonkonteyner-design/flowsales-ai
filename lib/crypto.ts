
import * as crypto from "node:crypto";

/**
 * Symmetric encryption for OAuth tokens at rest.
 *
 * Uses AES-256-GCM (authenticated encryption). The encryption key is derived
 * from the SOCIAL_TOKEN_ENCRYPTION_KEY environment variable via SHA-256 so the
 * operator can set any-length secret. The key version column lets us rotate
 * keys in the future without re-encrypting everything at once.
 *
 * Never log or return plaintext tokens. This module is server-only.
 */

const ALGORITHM = "aes-256-gcm";
const KEY_VERSION = 1;

function getEncryptionKey(): Buffer {
  const raw = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  if (!raw || raw.trim().length === 0) {
    throw new Error(
      "SOCIAL_TOKEN_ENCRYPTION_KEY is not configured. Set it in .env.local before encrypting tokens.",
    );
  }
  return crypto.createHash("sha256").update(raw.trim()).digest();
}

export function encryptToken(plaintext: string): {
  encrypted: string;
  iv: string;
  keyVersion: number;
} {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return {
    encrypted: Buffer.concat([encrypted, authTag]).toString("base64"),
    iv: iv.toString("base64"),
    keyVersion: KEY_VERSION,
  };
}

export function decryptToken(params: {
  encrypted: string;
  iv: string;
  keyVersion?: number;
}): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(params.encrypted, "base64");
  // Last 16 bytes are the GCM auth tag.
  const ciphertext = combined.slice(0, -16);
  const authTag = combined.slice(-16);
  const iv = Buffer.from(params.iv, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function isEncryptionConfigured(): boolean {
  return Boolean(process.env.SOCIAL_TOKEN_ENCRYPTION_KEY?.trim());
}

/**
 * Encrypts a legacy plaintext token for at-rest migration.
 *
 * Returns the encrypted representation plus the metadata columns to persist.
 * Callers are responsible for clearing the legacy plaintext `access_token`
 * column after successful encryption.
 */
export function migrateLegacyPlaintextToken(plaintext: string): {
  encrypted: string;
  iv: string;
  keyVersion: number;
} {
  return encryptToken(plaintext);
}


