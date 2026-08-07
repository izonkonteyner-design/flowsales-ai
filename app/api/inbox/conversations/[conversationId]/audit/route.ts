import { z } from "zod";
import { loadWorkspaceContext } from "@/server/services/workspace-context";
import { listConversationAuditEvents } from "@/server/services/whatsapp-audit";

export async function GET(_request: Request, context: { params: Promise<{ conversationId: string }> }) {
  const workspace = await loadWorkspaceContext();
  if (!workspace?.userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { conversationId } = await context.params;
  if (!z.string().uuid().safeParse(conversationId).success) return Response.json({ error: "invalid_conversation" }, { status: 400 });
  try {
    const events = await listConversationAuditEvents({ organizationId: workspace.organization.id, conversationId, limit: 60 });
    return Response.json({ events });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "audit_load_failed" }, { status: 500 });
  }
}
