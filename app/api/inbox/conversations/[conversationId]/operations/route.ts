import { NextRequest, NextResponse } from "next/server";
import { loadWorkspaceContext } from "@/server/services/workspace-context";
import { WhatsAppV1OperationsService, writeConversationAudit } from "@/server/services/whatsapp-v1-operations";

interface RouteParams { params: Promise<{ conversationId: string }> }

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { conversationId } = await params;
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.mode === "demo") return NextResponse.json({ audit: [] });
  const service = new WhatsAppV1OperationsService();
  return NextResponse.json({ audit: await service.getAudit(ctx.organization.id, conversationId) });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { conversationId } = await params;
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.mode === "demo" || ctx.role === "viewer") return NextResponse.json({ error: "read_only" }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const service = new WhatsAppV1OperationsService();
  let result: Record<string, unknown>;
  switch (body.action) {
    case "add_note":
      result = await service.addNote({ organizationId: ctx.organization.id, conversationId, userId: ctx.userId, detail: String(body.detail || "") });
      break;
    case "create_follow_up":
      result = await service.createFollowUp({ organizationId: ctx.organization.id, conversationId, userId: ctx.userId, dueAt: typeof body.dueAt === "string" ? body.dueAt : undefined });
      break;
    case "create_quote":
      result = await service.createDraftQuote({ organizationId: ctx.organization.id, conversationId, userId: ctx.userId });
      break;
    case "convert_lead":
      result = await service.convertLead({ organizationId: ctx.organization.id, conversationId, userId: ctx.userId });
      break;
    case "retry_message":
      result = await service.retryFailedMessage({ organizationId: ctx.organization.id, conversationId, userId: ctx.userId, userRole: ctx.role, messageId: String(body.messageId || "") });
      break;
    case "review_ai":
      await writeConversationAudit({ organizationId: ctx.organization.id, conversationId, actorUserId: ctx.userId, eventType: "ai_suggestion_reviewed", metadata: { decision: body.decision === "dismissed" ? "dismissed" : "copied_for_review" } });
      result = { success: true };
      break;
    default:
      return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }
  return NextResponse.json(result, { status: result.success === false ? 400 : 200 });
}
