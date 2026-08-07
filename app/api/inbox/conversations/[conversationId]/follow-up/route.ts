import { NextRequest, NextResponse } from "next/server";
import { loadWorkspaceContext } from "@/server/services/workspace-context";
import { createFollowUpPlanFromQualification, getFollowUpPlan, updateFollowUpAction } from "@/server/services/sales-follow-up-engine";

interface RouteParams { params: Promise<{ conversationId: string }> }

export async function GET(_: NextRequest, { params }: RouteParams) {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { conversationId } = await params;
  return NextResponse.json({ plan: await getFollowUpPlan(ctx.organization.id, conversationId) });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.mode === "demo" || ctx.role === "viewer") return NextResponse.json({ error: "read_only" }, { status: 403 });
  const { conversationId } = await params;
  const body = await request.json().catch(() => null) as { qualificationId?: string } | null;
  if (!body?.qualificationId) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  try {
    const result = await createFollowUpPlanFromQualification({ organizationId: ctx.organization.id, userId: ctx.userId, userRole: ctx.role, conversationId, qualificationId: body.qualificationId });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: "plan_failed", message: error instanceof Error ? error.message : "Plan failed." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.mode === "demo" || ctx.role === "viewer") return NextResponse.json({ error: "read_only" }, { status: 403 });
  const { conversationId } = await params;
  const body = await request.json().catch(() => null) as { actionId?: string; decision?: string } | null;
  if (!body?.actionId || !["approved", "completed", "cancelled"].includes(body.decision || "")) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  try {
    const action = await updateFollowUpAction({ organizationId: ctx.organization.id, userId: ctx.userId, userRole: ctx.role, conversationId, actionId: body.actionId, decision: body.decision as "approved" | "completed" | "cancelled" });
    return NextResponse.json({ success: true, action });
  } catch (error) {
    return NextResponse.json({ error: "action_failed", message: error instanceof Error ? error.message : "Action failed." }, { status: 400 });
  }
}
