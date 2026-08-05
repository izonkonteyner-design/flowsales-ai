import * as crypto from "node:crypto";

/**
 * Checks whether TOKEN_ENCRYPTION_KEY is present and valid (32-byte key in hex or base64).
 */
export function isTokenEncryptionConfigured(): boolean {
  const keyStr = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!keyStr) return false;

  try {
    const key = parseKey(keyStr);
    return key.length === 32;
  } catch {
    return false;
  }
}

function parseKey(keyStr: string): Buffer {
  if (keyStr.length === 64 && /^[0-9a-fA-F]+$/.test(keyStr)) {
    return Buffer.from(keyStr, "hex");
  }
  const buf = Buffer.from(keyStr, "base64");
  if (buf.length === 32) return buf;
  return Buffer.from(keyStr, "utf8");
}

/**
 * Encrypts plaintext using AES-256-GCM with TOKEN_ENCRYPTION_KEY.
 * Returns base64url ciphertext string format (IV:12 + AuthTag:16 + Ciphertext).
 */
export function encryptToken(plaintext: string): string {
  const keyStr = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!keyStr) {
    throw new Error("TOKEN_ENCRYPTION_KEY is not configured.");
  }

  const key = parseKey(keyStr);
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must resolve to 32 bytes.");
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString("base64url");
}

/**
 * Decrypts AES-256-GCM base64url ciphertext using TOKEN_ENCRYPTION_KEY.
 */
export function decryptToken(ciphertext: string): string {
  const keyStr = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!keyStr) {
    throw new Error("TOKEN_ENCRYPTION_KEY is not configured.");
  }

  const key = parseKey(keyStr);
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must resolve to 32 bytes.");
  }

  const combined = Buffer.from(ciphertext, "base64url");
  if (combined.length < 28) {
    throw new Error("Invalid ciphertext blob length.");
  }

  const iv = combined.subarray(0, 12);
  const authTag = combined.subarray(12, 28);
  const encrypted = combined.subarray(28);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
