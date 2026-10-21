import assert from "node:assert/strict";
import test from "node:test";

import { encryptToken, decryptToken, isEncryptionConfigured } from "@/lib/crypto";

const TEST_KEY = "test-encryption-key-for-flowsales-social-media-tokens";

test("encryption is configured when SOCIAL_TOKEN_ENCRYPTION_KEY is set", () => {
  const prev = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = TEST_KEY;
  try {
    assert.equal(isEncryptionConfigured(), true);
  } finally {
    if (prev === undefined) delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
    else process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = prev;
  }
});

test("encryption is not configured when key is missing", () => {
  const prev = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  try {
    assert.equal(isEncryptionConfigured(), false);
  } finally {
    if (prev === undefined) delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
    else process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = prev;
  }
});

test("encrypt/decrypt roundtrip preserves the token", () => {
  const prev = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = TEST_KEY;
  try {
    const token = "ya29.a0AfH6SMC...";
    const encrypted = encryptToken(token);
    assert.equal(typeof encrypted.encrypted, "string");
    assert.equal(typeof encrypted.iv, "string");
    assert.equal(encrypted.keyVersion, 1);
    assert.notEqual(encrypted.encrypted, token);

    const decrypted = decryptToken({
      encrypted: encrypted.encrypted,
      iv: encrypted.iv,
      keyVersion: encrypted.keyVersion,
    });
    assert.equal(decrypted, token);
  } finally {
    if (prev === undefined) delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
    else process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = prev;
  }
});

test("decrypt fails with wrong key", () => {
  const prev = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = TEST_KEY;
  try {
    const encrypted = encryptToken("secret-token");
    // Use a different key for decryption.
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = "different-key";
    assert.throws(() =>
      decryptToken({
        encrypted: encrypted.encrypted,
        iv: encrypted.iv,
        keyVersion: encrypted.keyVersion,
      }),
    );
  } finally {
    if (prev === undefined) delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
    else process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = prev;
  }
});

test("encrypt throws when key is not configured", () => {
  const prev = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  try {
    assert.throws(() => encryptToken("token"), /SOCIAL_TOKEN_ENCRYPTION_KEY/);
  } finally {
    if (prev === undefined) delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
    else process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = prev;
  }
});
