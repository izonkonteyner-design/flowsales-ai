import { NextRequest, NextResponse } from "next/server";
import { loadWorkspaceContext } from "@/server/services/workspace-context";
import { WhatsAppCrmIdentityService } from "@/server/services/whatsapp-crm-identity";

interface RouteParams {
  params: Promise<{ conversationId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { conversationId } = await params;
  const ctx = await loadWorkspaceContext();
  if (!ctx || !ctx.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.mode === "demo") return NextResponse.json({ error: "not_found" }, { status: 404 });

  const service = new WhatsAppCrmIdentityService();
  const identity = await service.getIdentity(ctx.organization.id, conversationId);
  if (!identity) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(identity);
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { conversationId } = await params;
  const ctx = await loadWorkspaceContext();
  if (!ctx || !ctx.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.mode === "demo" || ctx.role === "viewer") {
    return NextResponse.json({ error: "read_only" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const service = new WhatsAppCrmIdentityService();
  if (body.action === "create_lead") {
    const result = await service.createLeadFromConversation({
      organizationId: ctx.organization.id,
      conversationId,
      userId: ctx.userId,
    });
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  }

  if (body.action === "unlink") {
    const result = await service.resolveManual({
      organizationId: ctx.organization.id,
      conversationId,
      userId: ctx.userId,
      customerId: null,
      leadId: null,
    });
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  }

  if (body.action === "link_customer" && typeof body.customerId === "string") {
    const result = await service.resolveManual({
      organizationId: ctx.organization.id,
      conversationId,
      userId: ctx.userId,
      customerId: body.customerId,
    });
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  }

  if (body.action === "link_lead" && typeof body.leadId === "string") {
    const result = await service.resolveManual({
      organizationId: ctx.organization.id,
      conversationId,
      userId: ctx.userId,
      leadId: body.leadId,
    });
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  }

  return NextResponse.json({ error: "invalid_action" }, { status: 400 });
}
