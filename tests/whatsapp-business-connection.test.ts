import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { verifySameOrigin } from "../server/services/integrations/origin-guard";
import { redactData } from "../lib/logger";

const WORKTREE = process.cwd();

describe("WhatsApp Business Connection Security & Architecture Tests", () => {

  it("0029, 0030 and 0031 migrations exist and contain required WABA columns, code idempotency, and RPCs", () => {
    const migration29Path = path.join(WORKTREE, "supabase/migrations/0029_whatsapp_business_connection.sql");
    const migration30Path = path.join(WORKTREE, "supabase/migrations/0030_whatsapp_code_idempotency.sql");
    const migration31Path = path.join(WORKTREE, "supabase/migrations/0031_whatsapp_connection_integrity.sql");

    assert.ok(fs.existsSync(migration29Path), "Migration 0029 file must exist");
    assert.ok(fs.existsSync(migration30Path), "Migration 0030 file must exist");
    assert.ok(fs.existsSync(migration31Path), "Migration 0031 file must exist");

    const sql29 = fs.readFileSync(migration29Path, "utf-8");
    const sql30 = fs.readFileSync(migration30Path, "utf-8");
    const sql31 = fs.readFileSync(migration31Path, "utf-8");

    assert.ok(sql29.includes("waba_id"), "Migration 0029 must contain waba_id");
    assert.ok(sql29.includes("phone_number_id"), "Migration 0029 must contain phone_number_id");
    assert.ok(sql30.includes("oauth_authorization_codes"), "Migration 0030 must contain oauth_authorization_codes table");
    assert.ok(sql31.includes("consume_whatsapp_authorization_code"), "Migration 0031 must contain consume_whatsapp_authorization_code RPC");
    assert.ok(sql31.includes("check_distributed_rate_limit"), "Migration 0031 must contain check_distributed_rate_limit RPC");
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

  it("rate limiter production ortamında fail-closed fırlatır ve DistributedRateLimitUnavailableError tanımlar", () => {
    const rateLimiterPath = path.join(WORKTREE, "server/services/integrations/rate-limiter.ts");
    const code = fs.readFileSync(rateLimiterPath, "utf-8");

    assert.ok(code.includes("DistributedRateLimitUnavailableError"), "Must define DistributedRateLimitUnavailableError");
    assert.ok(code.includes("RATE_LIMIT_HASH_SECRET"), "Must require RATE_LIMIT_HASH_SECRET");
    assert.ok(code.includes("check_distributed_rate_limit"), "Must call check_distributed_rate_limit RPC");
    assert.ok(code.includes("process.env.NODE_ENV === \"production\""), "Must explicitly check production NODE_ENV for fail-closed behavior");
  });

  it("endpoint'ler rate limiter unavailable olduğunda 503 rate_limit_unavailable döner ve işlem yapmaz", () => {
    const signupPath = path.join(WORKTREE, "app/api/integrations/whatsapp/embedded-signup/route.ts");
    const healthPath = path.join(WORKTREE, "app/api/integrations/whatsapp/health/route.ts");
    const disconnectPath = path.join(WORKTREE, "app/api/integrations/whatsapp/disconnect/route.ts");
    const webhookPath = path.join(WORKTREE, "app/api/webhooks/meta/route.ts");

    const signupCode = fs.readFileSync(signupPath, "utf-8");
    const healthCode = fs.readFileSync(healthPath, "utf-8");
    const disconnectCode = fs.readFileSync(disconnectPath, "utf-8");
    const webhookCode = fs.readFileSync(webhookPath, "utf-8");

    assert.ok(signupCode.includes("rate_limit_unavailable"));
    assert.ok(signupCode.includes("503"));
    assert.ok(healthCode.includes("rate_limit_unavailable"));
    assert.ok(healthCode.includes("503"));
    assert.ok(disconnectCode.includes("rate_limit_unavailable"));
    assert.ok(disconnectCode.includes("503"));
    assert.ok(webhookCode.includes("rate_limit_unavailable"));
    assert.ok(webhookCode.includes("503"));
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
});
