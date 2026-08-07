import { NextRequest, NextResponse } from "next/server";
import { loadWorkspaceContext } from "@/server/services/workspace-context";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { createFollowUpPlan } from "@/server/services/sales-follow-up-engine";

interface RouteParams { params: Promise<{ conversationId: string }> }

export async function GET(_: NextRequest, { params }: RouteParams) {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { conversationId } = await params;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("sales_follow_up_plans")
    .select("id,name,status,created_at,sales_follow_up_steps(id,step_order,action_type,channel,due_at,status,draft_text,requires_human_approval)")
    .eq("organization_id", ctx.organization.id).eq("conversation_id", conversationId)
    .order("created_at", { ascending: false }).limit(10);
  if (error) return NextResponse.json({ error: "follow_up_load_failed" }, { status: 500 });
  return NextResponse.json({ plans: data ?? [] });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.mode === "demo" || ctx.role === "viewer") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { conversationId } = await params;
  const body = await req.json().catch(() => null) as { name?: string; steps?: Array<{ delayHours?: number; actionType?: string; channel?: string | null; draftText?: string | null }> } | null;
  if (!body?.name || !Array.isArray(body.steps)) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const allowedActions = new Set(["task","message_draft","call","quote_review"]);
  const allowedChannels = new Set(["whatsapp","instagram","facebook"]);
  if (body.steps.some((s) => !allowedActions.has(s.actionType ?? "") || (s.channel != null && !allowedChannels.has(s.channel)))) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  try {
    const result = await createFollowUpPlan({
      organizationId: ctx.organization.id,
      userId: ctx.userId,
      userRole: ctx.role,
      conversationId,
      name: body.name,
      steps: body.steps.map((s) => ({ delayHours: Math.max(0, Number(s.delayHours ?? 0)), actionType: s.actionType as "task" | "message_draft" | "call" | "quote_review", channel: s.channel as "whatsapp" | "instagram" | "facebook" | null | undefined, draftText: s.draftText })),
    });
    return NextResponse.json({ ...result, autoSend: false });
  } catch (error) {
    return NextResponse.json({ error: "follow_up_plan_failed", message: error instanceof Error ? error.message : "Failed to create plan." }, { status: 400 });
  }
}
