import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path: string) => readFile(join(root, path), "utf8");

test("0040 adds auditable bounded webhook recovery", async () => {
  const sql = await read("supabase/migrations/0040_whatsapp_ops_audit_hardening.sql");
  assert.match(sql, /create table if not exists public\.whatsapp_audit_events/i);
  assert.match(sql, /dead_lettered_at/i);
  assert.match(sql, /next_retry_at/i);
  assert.match(sql, /claim_webhook_event_for_reprocess/i);
  assert.match(sql, /v_required_version constant text := '0040'/i);
  assert.match(sql, /grant execute on function public\.claim_webhook_event_for_reprocess.*service_role/is);
  assert.match(sql, /revoke all on function public\.claim_webhook_event_for_reprocess.*anon, authenticated/is);
});

test("Meta webhook requires HMAC and caps retries", async () => {
  const route = await read("app/api/webhooks/meta/route.ts");
  assert.match(route, /x-hub-signature-256/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /MAX_WEBHOOK_ATTEMPTS = 5/);
  assert.match(route, /status: "dead_lettered"/);
  assert.doesNotMatch(route, /META_AUTO_BIND_SINGLE_OWNER/);
});

test("failed message retry is explicit and human scoped", async () => {
  const route = await read("app/api/inbox/messages/[messageId]/retry/route.ts");
  assert.match(route, /message\.status !== "failed"/);
  assert.match(route, /message\.direction !== "outbound"/);
  assert.match(route, /message_retry_requested/);
  assert.doesNotMatch(route, /isTestMode:\s*true/);
});

test("CRM conversation actions are tenant scoped", async () => {
  const service = await read("server/services/whatsapp-crm-actions.ts");
  assert.match(service, /\.eq\("organization_id", organizationId\)/);
  assert.match(service, /crm_note_added/);
  assert.match(service, /crm_task_created/);
  assert.match(service, /crm_lead_converted/);
  assert.match(service, /crm_quote_opened/);
});

test("template finalizer cannot send to arbitrary recipients", async () => {
  const script = await read("scripts/finalize-whatsapp-template.mjs");
  assert.match(script, /TEST_RECIPIENT = "905550743026"/);
  assert.match(script, /status !== "APPROVED"/);
  assert.match(script, /Safety guard: controlled template conversation is not the allowlisted test recipient/);
  assert.match(script, /TEMPLATE_ID = "1788819732249991"/);
});

test("Inbox exposes progressive paging CRM controls and audit history", async () => {
  const list = await read("components/inbox/conversation-list.tsx");
  const shell = await read("components/inbox/inbox-shell.tsx");
  assert.match(list, /PAGE_SIZE = 30/);
  assert.match(list, /Load .* more/);
  assert.match(shell, /CrmConversationActions/);
  assert.match(shell, /ConversationAuditPanel/);
});
