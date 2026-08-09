import { describe, it } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

describe("FlowSales productization + Turkish locale", () => {
  it("uses Turkish as the default locale with English fallback support", () => {
    const src = read("lib/i18n.ts");
    assert.ok(src.includes('SUPPORTED_LOCALES = ["tr", "en"]'));
    assert.ok(src.includes('DEFAULT_LOCALE: Locale = "tr"'));
    assert.ok(src.includes('LOCALE_COOKIE = "flowsales_locale"'));
  });

  it("persists locale through a protected profile-aware API", () => {
    const src = read("app/api/locale/route.ts");
    assert.ok(src.includes('from("profiles").upsert'));
    assert.ok(src.includes("response.cookies.set"));
  });

  it("requests only the Meta messaging scopes the Inbox implements", () => {
    const src = read("app/api/integrations/meta/connect/route.ts");
    assert.ok(src.includes('"pages_read_engagement"'));
    assert.ok(src.includes('"instagram_business_manage_messages"'));
    assert.ok(src.includes('"pages_messaging"'));
    assert.ok(!src.includes('"instagram_business_manage_comments"'));
  });

  it("keeps Meta readiness diagnostics secret-free", () => {
    const src = read("app/api/integrations/meta/status/route.ts");
    assert.ok(src.includes("appSecretConfigured"));
    assert.ok(src.includes("verifyTokenConfigured"));
    assert.ok(!src.includes("appSecret:"));
    assert.ok(!src.includes("verifyToken:"));
  });

  it("adds live calendar, API-key and audit tables with RLS", () => {
    const sql = read("supabase/migrations/0042_productization_i18n_calendar_api.sql");
    assert.ok(sql.includes("create table if not exists public.calendar_events"));
    assert.ok(sql.includes("create table if not exists public.api_keys"));
    assert.ok(sql.includes("create table if not exists public.app_audit_logs"));
    assert.ok(sql.includes("alter table public.calendar_events enable row level security"));
    assert.ok(sql.includes("alter table public.api_keys enable row level security"));
    assert.ok(sql.includes("enforce_workspace_member_seat_limit"));
    assert.ok(sql.includes("enforce_ai_run_entitlement"));
    assert.ok(sql.includes("alter publication supabase_realtime add table public.notifications"));
  });

  it("never stores the raw API key", () => {
    const service = read("server/services/productivity.ts");
    assert.ok(service.includes('const raw = `fsa_'));
    assert.ok(service.includes('createHash("sha256")'));
    assert.ok(service.includes("key_hash: hash"));
    assert.ok(!service.includes("raw_key:"));
  });

  it("public API requires bearer auth scopes rate limits and idempotency", () => {
    const auth = read("server/services/api-auth.ts");
    const leads = read("app/api/v1/leads/route.ts");
    assert.ok(auth.includes('header.startsWith("Bearer ")'));
    assert.ok(auth.includes("timingSafeEqual"));
    assert.ok(auth.includes("checkRateLimit"));
    assert.ok(leads.includes('authenticateApiRequest(request, "crm:read")'));
    assert.ok(leads.includes('authenticateApiRequest(request, "crm:write")'));
    assert.ok(leads.includes('request.headers.get("idempotency-key")'));
  });

  it("tasks and calendar no longer depend on demo workspace-data", () => {
    const tasks = read("app/(app)/tasks/page.tsx");
    const calendar = read("app/(app)/calendar/page.tsx");
    assert.ok(tasks.includes("listWorkspaceTasks"));
    assert.ok(calendar.includes("listCalendarEvents"));
    assert.ok(!tasks.includes("getTasks"));
    assert.ok(!calendar.includes("getCalendarEvents"));
  });

  it("billing exposes live checkout and portal routes with demo guards", () => {
    const checkout = read("app/api/billing/checkout/route.ts");
    const portal = read("app/api/billing/portal/route.ts");
    assert.ok(checkout.includes("createLemonSqueezyCheckout"));
    assert.ok(checkout.includes('workspace.mode === "demo"'));
    assert.ok(portal.includes("getLemonSqueezyPortalUrl"));
    assert.ok(portal.includes('workspace.mode === "demo"'));
  });
});
