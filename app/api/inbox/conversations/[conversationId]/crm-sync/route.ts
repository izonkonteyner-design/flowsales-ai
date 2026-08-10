import { NextRequest, NextResponse } from "next/server";
import { loadWorkspaceContext } from "@/server/services/workspace-context";
import { applyQualificationToLead } from "@/server/services/sales-execution-v2";

interface RouteParams { params: Promise<{ conversationId: string }> }

export async function POST(request: NextRequest, { params }: RouteParams) {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.mode === "demo" || ctx.role === "viewer") return NextResponse.json({ error: "read_only", message: "Salt okunur modda CRM önerileri uygulanamaz." }, { status: 403 });
  const { conversationId } = await params;
  const body = await request.json().catch(() => null) as { qualificationId?: string } | null;
  if (!body?.qualificationId) return NextResponse.json({ error: "invalid_input", message: "Qualification ID gerekli." }, { status: 400 });
  try {
    const result = await applyQualificationToLead({
      organizationId: ctx.organization.id,
      userId: ctx.userId,
      userRole: ctx.role,
      conversationId,
      qualificationId: body.qualificationId,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: "crm_sync_failed", message: error instanceof Error ? error.message : "CRM önerileri uygulanamadı." }, { status: 400 });
  }
}
