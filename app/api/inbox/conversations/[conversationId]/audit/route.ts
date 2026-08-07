import { z } from "zod";
import { loadWorkspaceContext } from "@/server/services/workspace-context";
import { listOmnichannelConversationAuditEvents, recordOmnichannelReviewEvent } from "@/server/services/omnichannel-audit";

async function contextForConversation(context: { params: Promise<{ conversationId: string }> }) {
  const workspace = await loadWorkspaceContext();
  if (!workspace?.userId) return { error: Response.json({ error: "unauthorized" }, { status: 401 }) } as const;
  const { conversationId } = await context.params;
  if (!z.string().uuid().safeParse(conversationId).success) return { error: Response.json({ error: "invalid_conversation" }, { status: 400 }) } as const;
  return { workspace, conversationId } as const;
}

export async function GET(_request: Request, context: { params: Promise<{ conversationId: string }> }) {
  const resolved = await contextForConversation(context);
  if ("error" in resolved) return resolved.error;
  try {
    const events = await listOmnichannelConversationAuditEvents({ organizationId: resolved.workspace.organization.id, conversationId: resolved.conversationId, limit: 60 });
    return Response.json({ events });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "audit_load_failed" }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  const resolved = await contextForConversation(context);
  if ("error" in resolved) return resolved.error;
  if (resolved.workspace.mode === "demo" || resolved.workspace.role === "viewer") return Response.json({ error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || body.action !== "ai_suggestion_reviewed") return Response.json({ error: "invalid_action" }, { status: 400 });
  await recordOmnichannelReviewEvent({
    organizationId: resolved.workspace.organization.id,
    conversationId: resolved.conversationId,
    userId: resolved.workspace.userId,
  });
  return Response.json({ success: true });
}
