import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { validateCustomerWindow } from "../lib/utils/customer-window.ts";

const WORKTREE = process.cwd();

describe("WhatsApp Outbound Replies & Delivery Status Tests", () => {
  describe("24-Hour Customer Service Window Validation", () => {
    it("allows outbound reply when last inbound message is within 24 hours", () => {
      const now = new Date();
      const tenHoursAgo = new Date(now.getTime() - 10 * 60 * 60 * 1000);
      const res = validateCustomerWindow(tenHoursAgo);
      assert.equal(res.allowed, true);
    });

    it("allows outbound reply at 24 hours boundary", () => {
      const now = Date.now();
      const boundary24h = new Date(now - (24 * 60 * 60 * 1000 - 1000)); // 23 hours 59 mins 59 secs
      const res = validateCustomerWindow(boundary24h);
      assert.equal(res.allowed, true);
    });

    it("blocks outbound reply when last inbound message is older than 24 hours", () => {
      const now = new Date();
      const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000);
      const res = validateCustomerWindow(twentyFiveHoursAgo);
      assert.equal(res.allowed, false);
      assert.equal(res.reason, "expired");
    });

    it("blocks outbound reply when inbound message timestamp is missing or null", () => {
      assert.equal(validateCustomerWindow(null).allowed, false);
      assert.equal(validateCustomerWindow(undefined).allowed, false);
      assert.equal(validateCustomerWindow("invalid-date").allowed, false);
    });

    it("blocks outbound reply when inbound message has future timestamp", () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 60 * 1000);
      const res = validateCustomerWindow(futureDate);
      assert.equal(res.allowed, false);
      assert.equal(res.reason, "future_timestamp");
    });
  });

  describe("Outbound Service & Endpoint Architecture Contracts", () => {
    it("whatsapp-outbound service implements idempotency, rate limiting, and token decryption", () => {
      const servicePath = path.join(WORKTREE, "server/services/integrations/whatsapp-outbound.ts");
      const code = fs.readFileSync(servicePath, "utf-8");

      assert.ok(code.includes("checkRateLimit"), "Must check distributed rate limit");
      assert.ok(code.includes("decryptToken"), "Must decrypt access token server-side");
      assert.ok(code.includes("outbound_idempotency_keys"), "Must use atomic idempotency table");
      assert.ok(code.includes("validateCustomerWindow"), "Must validate 24-hour customer service window");
      assert.ok(code.includes("userRole === \"viewer\""), "Must block viewer role");
      assert.ok(code.includes("DEMO_ORGANIZATION_ID"), "Must block demo organization");
    });

    it("reply API route validates input, role permissions, and returns typed errors", () => {
      const routePath = path.join(WORKTREE, "app/api/inbox/conversations/[conversationId]/reply/route.ts");
      const code = fs.readFileSync(routePath, "utf-8");

      assert.ok(code.includes("loadWorkspaceContext"), "Must load workspace context");
      assert.ok(code.includes("template_required"), "Must handle template_required typed error");
      assert.ok(code.includes("rate_limit_exceeded"), "Must handle 429 rate limit exceeded");
      assert.ok(code.includes("rate_limit_unavailable"), "Must handle 503 rate limit unavailable");
      assert.ok(code.includes("status: 403"), "Must return 403 for unauthorized viewer/demo access");
      assert.ok(code.includes("status: 404"), "Must return 404 for invalid/cross-workspace conversation ID");
    });

    it("migration 0035 defines outbound idempotency table and status precedence RPC", () => {
      const migrationPath = path.join(WORKTREE, "supabase/migrations/0035_whatsapp_outbound_replies.sql");
      const code = fs.readFileSync(migrationPath, "utf-8");

      assert.ok(code.includes("create table if not exists public.outbound_idempotency_keys"), "Must create outbound_idempotency_keys table");
      assert.ok(code.includes("uq_outbound_idempotency_key"), "Must enforce unique idempotency constraint");
      assert.ok(code.includes("update_message_delivery_status"), "Must create update_message_delivery_status RPC");
      assert.ok(code.includes("v_rank_current >= 5"), "Must enforce status precedence (read state cannot be downgraded)");
      assert.ok(code.includes("0035_whatsapp_outbound_replies.sql"), "Must register migration version 0035");
    });

    it("meta webhook route handles statuses payloads without status downgrade", () => {
      const webhookPath = path.join(WORKTREE, "app/api/webhooks/meta/route.ts");
      const code = fs.readFileSync(webhookPath, "utf-8");

      assert.ok(code.includes("value?.statuses"), "Must handle statuses payload array");
      assert.ok(code.includes("update_message_delivery_status"), "Must call update_message_delivery_status RPC for delivery updates");
      assert.ok(code.includes("statuses_updated"), "Must log observability event for statuses");
    });
  });
});
