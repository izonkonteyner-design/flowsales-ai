import { NextRequest, NextResponse } from "next/server";
import { loadWorkspaceContext } from "@/server/services/workspace-context";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { generateConversationIntelligence, reviewConversationIntelligence } from "@/server/services/conversation-intelligence";

interface RouteParams { params: Promise<{ conversationId: string }> }

export async function GET(_: NextRequest, { params }: RouteParams) {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { conversationId } = await params;
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("conversation_intelligence").select("intent,qualification_score,confidence,urgency,next_best_action,rationale,signals,model,generated_at,review_status,reviewed_at")
    .eq("organization_id", ctx.organization.id).eq("conversation_id", conversationId).maybeSingle();
  return NextResponse.json({ intelligence: data ?? null });
}

export async function POST(_: NextRequest, { params }: RouteParams) {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.mode === "demo" || ctx.role === "viewer") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { conversationId } = await params;
  try {
    const intelligence = await generateConversationIntelligence({ organizationId: ctx.organization.id, userId: ctx.userId, conversationId });
    return NextResponse.json({ intelligence, autoExecuted: false });
  } catch (error) {
    return NextResponse.json({ error: "intelligence_failed", message: error instanceof Error ? error.message : "Failed to analyze conversation." }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.mode === "demo" || ctx.role === "viewer") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { conversationId } = await params;
  const body = await req.json().catch(() => null) as { status?: string; nextBestAction?: string } | null;
  if (!body || !["accepted","edited","dismissed"].includes(body.status ?? "")) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  await reviewConversationIntelligence({ organizationId: ctx.organization.id, userId: ctx.userId, conversationId, status: body.status as "accepted" | "edited" | "dismissed", nextBestAction: body.nextBestAction });
  return NextResponse.json({ success: true });
}
