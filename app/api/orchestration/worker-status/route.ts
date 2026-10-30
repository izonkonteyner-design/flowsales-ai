import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { getWorkerOperationalMetrics } from "@/server/services/orchestration/worker";
import { getWorkspaceContext } from "@/server/services/workspace-context";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET?.trim();
    const authHeader = request.headers.get("authorization");
    const isCronAuthorized = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);

    let orgId: string | null = request.nextUrl.searchParams.get("organizationId");

    if (!isCronAuthorized) {
      // Session tabanlı workspace bağlamını doğrula
      try {
        const context = await getWorkspaceContext();
        if (!context || !context.organization?.id) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        // Kiracı güvenliği: Kullanıcı sadece kendi organizasyonunu sorgulayabilir
        orgId = context.organization.id;
      } catch {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
    }

    if (!orgId) {
      return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const metrics = await getWorkerOperationalMetrics(supabase, orgId);

    return NextResponse.json({
      success: true,
      metrics,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to fetch worker metrics";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
