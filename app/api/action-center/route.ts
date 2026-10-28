import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  aggregateProposalsFromAllModules,
  decideAiActionProposal,
  executeAiActionProposal,
  listAiActionProposals,
  proposeAiAction,
} from "@/server/services/action-center/service";
import {
  actionPrioritySchema,
  actionProposalStatusSchema,
  createActionProposalInputSchema,
} from "@/server/services/action-center/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Get active organization
  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: "no_active_organization" }, { status: 403 });
  }

  const url = new URL(request.url);
  const rawStatus = url.searchParams.get("status");
  const rawPriority = url.searchParams.get("priority");
  const parsedStatus = actionProposalStatusSchema.safeParse(rawStatus);
  const parsedPriority = actionPrioritySchema.safeParse(rawPriority);

  const shouldAggregate = url.searchParams.get("aggregate") === "true";

  if (shouldAggregate) {
    const aggResult = await aggregateProposalsFromAllModules(supabase, member.organization_id);
    return NextResponse.json({
      success: true,
      aggregated: aggResult.createdCount,
      proposals: aggResult.proposals,
    });
  }

  const proposals = await listAiActionProposals(supabase, member.organization_id, {
    status: parsedStatus.success ? parsedStatus.data : undefined,
    priority: parsedPriority.success ? parsedPriority.data : undefined,
  });

  return NextResponse.json({
    success: true,
    data: proposals,
  });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: "no_active_organization" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Action decision (approve / reject / dismiss)
  if (body.action === "decide") {
    const proposalId = typeof body.proposalId === "string" ? body.proposalId : "";
    const decision = typeof body.decision === "string" ? body.decision : "";
    const decisionNote = typeof body.decisionNote === "string" ? body.decisionNote : undefined;

    if (!proposalId || !["approved", "rejected", "dismissed"].includes(decision)) {
      return NextResponse.json({ error: "invalid_decision_payload" }, { status: 400 });
    }

    try {
      const updated = await decideAiActionProposal(supabase, {
        proposalId,
        organizationId: member.organization_id,
        decision: decision as "approved" | "rejected" | "dismissed",
        userId: user.id,
        userRole: member.role,
        decisionNote,
      });
      return NextResponse.json({ success: true, data: updated });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  // Action execution (only approved actions)
  if (body.action === "execute") {
    const proposalId = typeof body.proposalId === "string" ? body.proposalId : "";
    if (!proposalId) {
      return NextResponse.json({ error: "missing_proposal_id" }, { status: 400 });
    }

    try {
      const executed = await executeAiActionProposal(supabase, {
        proposalId,
        organizationId: member.organization_id,
        userId: user.id,
        userRole: member.role,
        executionResult: (body.executionResult && typeof body.executionResult === "object") ? (body.executionResult as Record<string, unknown>) : undefined,
      });
      return NextResponse.json({ success: true, data: executed });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  // Action creation
  if (body.action === "create") {
    try {
      const proposalPayload = (body.proposal && typeof body.proposal === "object") ? body.proposal : {};
      const parsed = createActionProposalInputSchema.parse({
        ...proposalPayload,
        organizationId: member.organization_id,
      });
      const proposal = await proposeAiAction(supabase, parsed);
      return NextResponse.json({ success: true, data: proposal });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
