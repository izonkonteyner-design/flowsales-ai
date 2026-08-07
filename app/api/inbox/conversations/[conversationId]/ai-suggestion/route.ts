import { NextResponse } from "next/server";
import { loadWorkspaceContext } from "@/server/services/workspace-context";
import { generateWhatsAppReplySuggestion } from "@/server/services/integrations/whatsapp-ai-suggestion";
import { recordWhatsAppAuditEvent } from "@/server/services/whatsapp-audit";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";

interface RouteParams { params: Promise<{ conversationId: string }> }

export async function POST(_request: Request, { params }: RouteParams) {
  const { conversationId } = await params;
  if (!conversationId) return NextResponse.json({ error: "invalid_input", message: "Conversation ID is required." }, { status: 400 });
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) return NextResponse.json({ error: "unauthorized", message: "Authentication required." }, { status: 401 });
  if (ctx.mode === "demo" || ctx.role === "viewer") return NextResponse.json({ error: "unauthorized", message: "AI reply suggestions are unavailable in read-only mode." }, { status: 403 });

  const result = await generateWhatsAppReplySuggestion({ organizationId: ctx.organization.id, userId: ctx.userId, userRole: ctx.role, conversationId });
  if (!result.success) {
    const status = result.errorCode === "not_found" ? 404 : result.errorCode === "unauthorized" ? 403 : 503;
    return NextResponse.json({ error: result.errorCode, message: result.message }, { status });
  }

  const metadata = { requiresHumanSend: true, suggestionLength: result.suggestion.length, provider: result.provider };
  const admin = createSupabaseAdminClient();
  await admin.from("omnichannel_audit_events").insert({ organization_id: ctx.organization.id, conversation_id: conversationId, actor_user_id: ctx.userId, provider: result.provider, event_type: "ai_suggestion_generated", metadata });
  if (result.provider === "whatsapp") {
    await recordWhatsAppAuditEvent({ organizationId: ctx.organization.id, conversationId, actorUserId: ctx.userId, eventType: "ai_suggestion_generated", metadata });
  }
  return NextResponse.json({ suggestion: result.suggestion, requiresHumanSend: true, provider: result.provider }, { status: 200 });
}
