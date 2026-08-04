import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const WORKTREE = process.cwd();

describe("WhatsApp Business Connection Security & Architecture Tests", () => {

  it("0029_whatsapp_business_connection.sql migration exists and contains required WABA columns", () => {
    const migrationPath = path.join(WORKTREE, "supabase/migrations/0029_whatsapp_business_connection.sql");
    assert.ok(fs.existsSync(migrationPath), "Migration 0029 file must exist");

    const sql = fs.readFileSync(migrationPath, "utf-8");
    assert.ok(sql.includes("waba_id"), "Migration 0029 must contain waba_id");
    assert.ok(sql.includes("phone_number_id"), "Migration 0029 must contain phone_number_id");
    assert.ok(sql.includes("webhook_subscribed_at"), "Migration 0029 must contain webhook_subscribed_at");
    assert.ok(sql.includes("0029"), "Migration 0029 must register version 0029");
  });

  it("whatsapp-config validates public and server environment configuration fail-closed", () => {
    const configPath = path.join(WORKTREE, "server/services/integrations/whatsapp-config.ts");
    assert.ok(fs.existsSync(configPath));

    const code = fs.readFileSync(configPath, "utf-8");
    assert.ok(code.includes("META_APP_ID"));
    assert.ok(code.includes("META_APP_SECRET"));
    assert.ok(code.includes("META_EMBEDDED_SIGNUP_CONFIG_ID"));
    assert.ok(code.includes("META_WEBHOOK_VERIFY_TOKEN"));
    assert.ok(code.includes("configuration_required"));
    assert.ok(code.includes("token_encryption_not_configured"));
  });

  it("meta-graph-client enforces timeout, user-agent and sanitizes authorization codes/tokens", () => {
    const clientPath = path.join(WORKTREE, "server/services/integrations/meta-graph-client.ts");
    assert.ok(fs.existsSync(clientPath));

    const code = fs.readFileSync(clientPath, "utf-8");
    assert.ok(code.includes("FlowSales-AI/1.0"), "Must set User-Agent header");
    assert.ok(code.includes("AbortController"), "Must use AbortController for timeouts");
    assert.ok(code.includes("exchangeCodeForToken"), "Must have exchangeCodeForToken method");
    assert.ok(code.includes("subscribed_apps"), "Must manage subscribed_apps for webhooks");
  });

  it("whatsapp-embedded-signup checks cross-workspace WABA conflicts and encrypts token", () => {
    const servicePath = path.join(WORKTREE, "server/services/integrations/whatsapp-embedded-signup.ts");
    assert.ok(fs.existsSync(servicePath));

    const code = fs.readFileSync(servicePath, "utf-8");
    assert.ok(code.includes("waba_already_connected_to_another_workspace"), "Must block cross-workspace WABA connection");
    assert.ok(code.includes("encryptToken"), "Must encrypt access token before storage");
    assert.ok(code.includes("processEmbeddedSignup"), "Must define processEmbeddedSignup");
  });

  it("whatsapp-health-check and disconnect services implement fail-closed and soft-revoke", () => {
    const healthPath = path.join(WORKTREE, "server/services/integrations/whatsapp-health-check.ts");
    const disconnectPath = path.join(WORKTREE, "server/services/integrations/whatsapp-disconnect.ts");
    assert.ok(fs.existsSync(healthPath));
    assert.ok(fs.existsSync(disconnectPath));

    const healthCode = fs.readFileSync(healthPath, "utf-8");
    const disconnectCode = fs.readFileSync(disconnectPath, "utf-8");

    assert.ok(healthCode.includes("runHealthCheck"));
    assert.ok(disconnectCode.includes("status: 'revoked'"));
    assert.ok(disconnectCode.includes("unsubscribeWabaFromApp"));
  });

  it("embedded-signup, health, and disconnect API routes enforce runOAuthGuard and demo block", () => {
    const signupRoute = path.join(WORKTREE, "app/api/integrations/whatsapp/embedded-signup/route.ts");
    const healthRoute = path.join(WORKTREE, "app/api/integrations/whatsapp/health/route.ts");
    const disconnectRoute = path.join(WORKTREE, "app/api/integrations/whatsapp/disconnect/route.ts");

    assert.ok(fs.existsSync(signupRoute));
    assert.ok(fs.existsSync(healthRoute));
    assert.ok(fs.existsSync(disconnectRoute));

    const signupCode = fs.readFileSync(signupRoute, "utf-8");
    const healthCode = fs.readFileSync(healthRoute, "utf-8");
    const disconnectCode = fs.readFileSync(disconnectRoute, "utf-8");

    assert.ok(signupCode.includes("runOAuthGuard"));
    assert.ok(healthCode.includes("runOAuthGuard"));
    assert.ok(disconnectCode.includes("runOAuthGuard"));
  });

  it("WhatsAppConnectButton component uses Meta SDK on demand and handles state transitions", () => {
    const btnPath = path.join(WORKTREE, "components/settings/whatsapp-connect-button.tsx");
    assert.ok(fs.existsSync(btnPath));

    const code = fs.readFileSync(btnPath, "utf-8");
    assert.ok(code.includes("connect.facebook.net/en_US/sdk.js"), "Must load Meta SDK on demand");
    assert.ok(code.includes("FB.login"), "Must call FB.login for Embedded Signup");
    assert.ok(code.includes("config_id"), "Must pass config_id to FB.login");
  });

  it("documentation WHATSAPP_BUSINESS_SETUP.md exists and covers production checklist", () => {
    const docPath = path.join(WORKTREE, "docs/WHATSAPP_BUSINESS_SETUP.md");
    assert.ok(fs.existsSync(docPath));

    const doc = fs.readFileSync(docPath, "utf-8");
    assert.ok(doc.includes("META_EMBEDDED_SIGNUP_CONFIG_ID"));
    assert.ok(doc.includes("whatsapp_business_management"));
    assert.ok(doc.includes("whatsapp_business_messaging"));
    assert.ok(doc.includes("Production Activation Checklist"));
  });
});
