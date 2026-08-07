import { z } from "zod";
import { loadWorkspaceContext } from "@/server/services/workspace-context";
import { WhatsAppWebhookReprocessService } from "@/server/services/integrations/whatsapp-webhook-reprocess";

export async function POST(_request: Request, context: { params: Promise<{ eventId: string }> }) {
  const workspace = await loadWorkspaceContext();
  if (!workspace?.userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (workspace.mode === "demo" || !["owner", "admin"].includes(workspace.role)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const { eventId } = await context.params;
  if (!z.string().uuid().safeParse(eventId).success) return Response.json({ error: "invalid_event" }, { status: 400 });
  try {
    const service = new WhatsAppWebhookReprocessService();
    return Response.json(await service.reprocess({ organizationId: workspace.organization.id, eventId, userId: workspace.userId }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "reprocess_failed" }, { status: 409 });
  }
}
