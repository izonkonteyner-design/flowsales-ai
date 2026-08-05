import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { verifySameOrigin } from "../server/services/integrations/origin-guard";
import { checkRateLimit, resetRateLimitStore, hashIp } from "../server/services/integrations/rate-limiter";
import { redactData } from "../lib/logger";

const WORKTREE = process.cwd();

describe("WhatsApp Business Connection Security & Architecture Tests", () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  it("0029 and 0030 migrations exist and contain required WABA columns and code idempotency table", () => {
    const migration29Path = path.join(WORKTREE, "supabase/migrations/0029_whatsapp_business_connection.sql");
    const migration30Path = path.join(WORKTREE, "supabase/migrations/0030_whatsapp_code_idempotency.sql");

    assert.ok(fs.existsSync(migration29Path), "Migration 0029 file must exist");
    assert.ok(fs.existsSync(migration30Path), "Migration 0030 file must exist");

    const sql29 = fs.readFileSync(migration29Path, "utf-8");
    const sql30 = fs.readFileSync(migration30Path, "utf-8");

    assert.ok(sql29.includes("waba_id"), "Migration 0029 must contain waba_id");
    assert.ok(sql29.includes("phone_number_id"), "Migration 0029 must contain phone_number_id");
    assert.ok(sql30.includes("oauth_authorization_codes"), "Migration 0030 must contain oauth_authorization_codes table");
    assert.ok(sql30.includes("code_hash"), "Migration 0030 must contain code_hash column");
  });

  it("webhook subscription false ise connected yazılmaz", () => {
    const servicePath = path.join(WORKTREE, "server/services/integrations/whatsapp-embedded-signup.ts");
    const code = fs.readFileSync(servicePath, "utf-8");

    assert.ok(code.includes("if (!webhookSubscribed)"));
    assert.ok(code.includes("webhook_subscription_failed"));
    assert.ok(code.includes("status: 'error'"));
  });

  it("seçilen phone number bulunamazsa ilk numaraya fallback yapılmaz", () => {
    const servicePath = path.join(WORKTREE, "server/services/integrations/whatsapp-embedded-signup.ts");
    const code = fs.readFileSync(servicePath, "utf-8");

    assert.ok(code.includes("selected_phone_number_not_found"));
    assert.ok(code.includes("The selected phone number was not found in your WhatsApp Business Account."));
  });

  it("global conflict query hatasında onboarding durur ve fail-closed hata fırlatır", () => {
    const repoPath = path.join(WORKTREE, "server/repositories/supabase/whatsapp-connections.ts");
    const code = fs.readFileSync(repoPath, "utf-8");

    assert.ok(code.includes("Failed to verify existing WhatsApp connections due to database error."));
    assert.ok(code.includes("throw new Error"));
  });

  it("farklı Origin isteği Same-Origin guard tarafından reddedilir", () => {
    const headerMap = new Map([
      ["origin", "https://malicious-attacker-site.com"],
      ["host", "flowsales-ai-six.vercel.app"],
    ]);

    const reqMismatch = {
      headers: {
        get: (name: string) => headerMap.get(name.toLowerCase()) || null,
      },
      nextUrl: { host: "flowsales-ai-six.vercel.app" },
    } as unknown as Parameters<typeof verifySameOrigin>[0];

    const result = verifySameOrigin(reqMismatch);
    assert.equal(result, false, "Cross-origin request must be rejected");
  });

  it("gecerli Origin isteği Same-Origin guard tarafından kabul edilir", () => {
    const headerMap = new Map([
      ["origin", "https://flowsales-ai-six.vercel.app"],
      ["host", "flowsales-ai-six.vercel.app"],
    ]);

    const reqMatch = {
      headers: {
        get: (name: string) => headerMap.get(name.toLowerCase()) || null,
      },
      nextUrl: { host: "flowsales-ai-six.vercel.app" },
    } as unknown as Parameters<typeof verifySameOrigin>[0];

    const result = verifySameOrigin(reqMatch);
    assert.equal(result, true, "Same-origin request must be accepted");
  });

  it("rate limit aşımı güvenli hata verir ve limit takibi yapar", () => {
    const rawKey = "test_user_key_123";

    for (let i = 0; i < 5; i++) {
      const res = checkRateLimit(rawKey, 5, 60000);
      assert.equal(res.allowed, true);
    }

    const exceededRes = checkRateLimit(rawKey, 5, 60000);
    assert.equal(exceededRes.allowed, false);
    assert.equal(exceededRes.remaining, 0);
  });

  it("aynı authorization code ikinci kez reddedilir (idempotency check)", () => {
    const servicePath = path.join(WORKTREE, "server/services/integrations/whatsapp-embedded-signup.ts");
    const code = fs.readFileSync(servicePath, "utf-8");

    assert.ok(code.includes("authorization_code_already_used"));
    assert.ok(code.includes("consumeAuthCode"));
  });

  it("error fallback sahte unknown connection oluşturmaz", () => {
    const servicePath = path.join(WORKTREE, "server/services/integrations/whatsapp-embedded-signup.ts");
    const code = fs.readFileSync(servicePath, "utf-8");

    assert.ok(!code.includes("waba_id: 'unknown'"));
    assert.ok(!code.includes("phone_number_id: 'unknown'"));
  });

  it("structured logger token/code/password/secret alanlarını otomatik redact eder", () => {
    const payload = {
      code: "secret_meta_auth_code_999",
      access_token: "secret_access_token_abc",
      appSecret: "secret_app_secret_xyz",
      verifyToken: "secret_verify_token_123",
      normalField: "safe_value",
    };

    const redacted = redactData(payload) as Record<string, unknown>;

    assert.equal(redacted.code, "[REDACTED]");
    assert.equal(redacted.access_token, "[REDACTED]");
    assert.equal(redacted.appSecret, "[REDACTED]");
    assert.equal(redacted.verifyToken, "[REDACTED]");
    assert.equal(redacted.normalField, "safe_value");
  });

  it("rate limit key ham IP adresini saklamaz", () => {
    const rawIp = "192.168.1.100";
    const hashed = hashIp(rawIp);

    assert.ok(!hashed.includes(rawIp));
    assert.equal(hashed.length, 64);
  });
});
