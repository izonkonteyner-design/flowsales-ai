import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { runSalesAutomationCycle } from "@/server/services/sales-automation-runner-v5";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORGANIZATION_PAGE_SIZE = 500;

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
  const includeWeeklySnapshot = isMondayInIstanbul();
  const failures: Array<{ organizationId: string; error: string }> = [];
  let processedOrganizations = 0;
  let offset = 0;

  while (true) {
    const { data: organizations, error } = await admin.from("organizations")
      .select("id")
      .order("id", { ascending: true })
      .range(offset, offset + ORGANIZATION_PAGE_SIZE - 1);
    if (error) return NextResponse.json({ error: "organization_lookup_failed", processedOrganizations, failures }, { status: 500 });

    for (const organization of organizations || []) {
      try {
        await runSalesAutomationCycle(organization.id, { includeWeeklySnapshot });
      } catch (errorValue) {
        failures.push({
          organizationId: organization.id,
          error: errorValue instanceof Error ? errorValue.message : "unknown",
        });
      }
      processedOrganizations += 1;
    }

    if (!organizations || organizations.length < ORGANIZATION_PAGE_SIZE) break;
    offset += ORGANIZATION_PAGE_SIZE;
  }

  return NextResponse.json({
    ok: failures.length === 0,
    processedOrganizations,
    failedOrganizations: failures.length,
    failures: failures.slice(0, 100),
    failuresTruncated: failures.length > 100,
  }, { status: failures.length === 0 ? 200 : 207 });
}
