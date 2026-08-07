import { NextRequest } from "next/server";
import { z } from "zod";
import { loadWorkspaceContext } from "@/server/services/workspace-context";
import { WhatsAppCrmActionsService } from "@/server/services/whatsapp-crm-actions";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add_note"), note: z.string().trim().min(1).max(2000) }),
  z.object({
    action: z.literal("create_task"), title: z.string().trim().min(1).max(200), dueAt: z.string().min(1),
    priority: z.enum(["low", "medium", "high"]), assignedTo: z.string().uuid().nullable().optional(),
  }),
  z.object({ action: z.literal("convert_lead") }),
  z.object({ action: z.literal("open_quote") }),
]);

export async function POST(request: NextRequest, context: { params: Promise<{ conversationId: string }> }) {
  const workspace = await loadWorkspaceContext();
  if (!workspace?.userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (workspace.mode === "demo") return Response.json({ error: "demo_read_only" }, { status: 403 });
  if (!['owner','admin','sales'].includes(workspace.role)) return Response.json({ error: "forbidden" }, { status: 403 });

  const { conversationId } = await context.params;
  if (!z.string().uuid().safeParse(conversationId).success) return Response.json({ error: "invalid_conversation" }, { status: 400 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const service = new WhatsAppCrmActionsService();
  try {
    const base = { organizationId: workspace.organization.id, conversationId, userId: workspace.userId };
    if (parsed.data.action === "add_note") return Response.json(await service.addNote({ ...base, note: parsed.data.note }));
    if (parsed.data.action === "create_task") return Response.json(await service.createTask({
      ...base, title: parsed.data.title, dueAt: parsed.data.dueAt, priority: parsed.data.priority, assignedTo: parsed.data.assignedTo,
    }));
    if (parsed.data.action === "convert_lead") return Response.json(await service.convertLeadToCustomer(base));
    return Response.json(await service.recordQuoteOpened(base));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "crm_action_failed" }, { status: 400 });
  }
}
