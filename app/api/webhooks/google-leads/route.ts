import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { processGoogleLeadSubmission } from "@/server/services/integrations/google-lead-ingestion";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get("organization_id") || request.nextUrl.searchParams.get("workspace_id");
    if (!workspaceId) {
      return NextResponse.json({ success: false, error: "workspace_id parametresi gereklidir." }, { status: 400 });
    }

    const payload = await request.json();
    const googleKeyConfigured = process.env.GOOGLE_ADS_WEBHOOK_KEY?.trim();

    const result = await processGoogleLeadSubmission(payload, workspaceId, googleKeyConfigured);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.errorMessage }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      lead: result.leadRecord,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("google_leads_webhook.unhandled_exception", { error: message });
    return NextResponse.json({ success: false, error: "Sunucu içi webhook işleme hatası." }, { status: 500 });
  }
}
