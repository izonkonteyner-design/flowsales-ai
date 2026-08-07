import { NextRequest, NextResponse } from "next/server";
import { loadWorkspaceContext } from "@/server/services/workspace-context";
import { generateConversationQualification, getLatestConversationQualification, reviewConversationQualification } from "@/server/services/conversation-qualification";

interface RouteParams { params: Promise<{ conversationId: string }> }

type AuthenticatedContext = NonNullable<Awaited<ReturnType<typeof loadWorkspaceContext>>> & { userId: string };

async function ctxOrResponse(): Promise<{ ctx: AuthenticatedContext } | { response: NextResponse }> {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  return { ctx: { ...ctx, userId: ctx.userId } as AuthenticatedContext };
}

export async function GET(_: NextRequest, { params }: RouteParams) {
  const auth = await ctxOrResponse(); if ("response" in auth) return auth.response;
  const { conversationId } = await params;
  const data = await getLatestConversationQualification(auth.ctx.organization.id, conversationId);
  return NextResponse.json({ qualification: data ?? null });
}

export async function POST(_: NextRequest, { params }: RouteParams) {
  const auth = await ctxOrResponse(); if ("response" in auth) return auth.response;
  if (auth.ctx.mode === "demo" || auth.ctx.role === "viewer") return NextResponse.json({ error: "read_only" }, { status: 403 });
  const { conversationId } = await params;
  try {
    const qualification = await generateConversationQualification({
      organizationId: auth.ctx.organization.id, userId: auth.ctx.userId, userRole: auth.ctx.role, conversationId,
    });
    return NextResponse.json({ qualification });
  } catch (error) {
    return NextResponse.json({ error: "qualification_failed", message: error instanceof Error ? error.message : "Qualification failed." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await ctxOrResponse(); if ("response" in auth) return auth.response;
  if (auth.ctx.mode === "demo" || auth.ctx.role === "viewer") return NextResponse.json({ error: "read_only" }, { status: 403 });
  const { conversationId } = await params;
  const body = await request.json().catch(() => null) as { qualificationId?: string; decision?: string } | null;
  if (!body?.qualificationId || (body.decision !== "accepted" && body.decision !== "dismissed")) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  try {
    const result = await reviewConversationQualification({ organizationId: auth.ctx.organization.id, userId: auth.ctx.userId, userRole: auth.ctx.role, conversationId, qualificationId: body.qualificationId, decision: body.decision });
    return NextResponse.json({ success: true, qualification: result });
  } catch (error) {
    return NextResponse.json({ error: "review_failed", message: error instanceof Error ? error.message : "Review failed." }, { status: 400 });
  }
}
