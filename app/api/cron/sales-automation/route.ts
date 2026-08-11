import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { runSalesAutomationCycle } from "@/server/services/sales-automation-runner-v5";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function isMondayInIstanbul() {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Istanbul", weekday: "short" }).format(new Date());
  return weekday === "Mon";
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const { data: organizations, error } = await admin.from("organizations").select("id").limit(1000);
  if (error) return NextResponse.json({ error: "organization_lookup_failed" }, { status: 500 });

  const results: Array<{ organizationId: string; ok: boolean; detail?: unknown }> = [];
  for (const organization of organizations || []) {
    try {
      const detail = await runSalesAutomationCycle(organization.id, { includeWeeklySnapshot: isMondayInIstanbul() });
      results.push({ organizationId: organization.id, ok: true, detail });
    } catch (errorValue) {
      results.push({ organizationId: organization.id, ok: false, detail: errorValue instanceof Error ? errorValue.message : "unknown" });
    }
  }
  return NextResponse.json({ ok: results.every((item) => item.ok), processedOrganizations: results.length, results });
}
