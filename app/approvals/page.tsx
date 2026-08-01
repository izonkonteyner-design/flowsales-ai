import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  SupabaseAiApprovalAuditSink,
  SupabaseAiApprovalAuthorization,
  SupabaseAiApprovalRepository,
} from "@/server/repositories/supabase/ai-approvals";
import { AiApprovalError, type AiApprovalRequest } from "@/server/services/ai-approvals/domain";
import { listPendingAiApprovals } from "@/server/services/ai-approvals/service";

import { decideApprovalAction } from "./actions";

export const metadata: Metadata = { title: "AI Approval Queue | FlowSales AI" };
type SearchParams = Promise<{ toast?: string; tone?: string }>;

function formatCapability(value: string) {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
function formatDate(value?: string) {
  if (!value) return "No expiry";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function ApprovalsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) redirect("/login");
  const { data: memberships, error: membershipError } = await client.from("organization_members").select("organization_id, role").eq("user_id", authData.user.id).order("created_at", { ascending: true }).limit(1);
  if (membershipError) throw new Error(`Unable to resolve workspace: ${membershipError.message}`);
  const membership = memberships?.[0];
  if (!membership) redirect("/onboarding");

  const repository = new SupabaseAiApprovalRepository(client);
  const authorization = new SupabaseAiApprovalAuthorization(client);
  const auditSink = new SupabaseAiApprovalAuditSink(client);
  let approvals: AiApprovalRequest[] = [];
  let accessDenied = false;
  try {
    approvals = await listPendingAiApprovals({ repository, authorization, auditSink }, membership.organization_id, authData.user.id, 50);
  } catch (error) {
    if (error instanceof AiApprovalError && error.code === "unauthorized") accessDenied = true;
    else throw error;
  }
  const isDemo = await authorization.isDemoWorkspace(membership.organization_id);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Human control</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">AI Approval Queue</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Review AI recommendations before any protected sales action can continue. Approval records do not execute actions by themselves.</p></div><Link href="/dashboard" className="text-sm font-semibold text-slate-700 hover:text-slate-950">Back to dashboard</Link></div>
      {params.toast ? <div className={`rounded-xl border px-4 py-3 text-sm ${params.tone === "danger" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{params.toast}</div> : null}
      {isDemo ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Demo workspace is read-only. Recommendations can be inspected, but approvals that could mutate data are blocked.</div> : null}
      {accessDenied ? <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"><h2 className="text-lg font-semibold text-slate-950">Reviewer permission required</h2><p className="mt-2 text-sm text-slate-600">Only workspace owners, administrators and authorized sales managers can review AI approval requests.</p></section> : approvals.length === 0 ? <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><h2 className="text-lg font-semibold text-slate-950">No approvals waiting</h2><p className="mt-2 text-sm text-slate-600">New protected AI recommendations will appear here.</p></section> : <div className="space-y-4">{approvals.map((approval) => <article key={approval.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">{formatCapability(approval.capability)}</span><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Pending</span><span className="text-xs text-slate-500">Expires {formatDate(approval.expiresAt)}</span></div><h2 className="mt-4 text-lg font-semibold text-slate-950">{approval.summary}</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><div><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended actions</h3><ul className="mt-2 space-y-2">{approval.actions.map((action, index) => <li key={`${approval.id}-action-${index}`} className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-semibold text-slate-900">{action.title}</p><p className="mt-1 text-slate-600">{action.rationale}</p></li>)}</ul></div><div><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Safety reasons</h3><ul className="mt-2 space-y-2 text-sm text-slate-600">{approval.reasons.length > 0 ? approval.reasons.map((reason, index) => <li key={`${approval.id}-reason-${index}`} className="rounded-lg border border-slate-200 px-3 py-2">{reason}</li>) : <li>No additional warning was recorded.</li>}</ul></div></div><p className="mt-4 text-xs text-slate-500">Provider: {approval.provider} · Model: {approval.model} · Version: {approval.version}</p></div><form action={decideApprovalAction} className="w-full space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 lg:w-72"><input type="hidden" name="workspaceId" value={approval.workspaceId} /><input type="hidden" name="approvalId" value={approval.id} /><input type="hidden" name="expectedVersion" value={approval.version} /><label className="block text-xs font-semibold uppercase tracking-wide text-slate-600" htmlFor={`note-${approval.id}`}>Review note</label><textarea id={`note-${approval.id}`} name="note" maxLength={1000} rows={3} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500" placeholder="Optional reason or instruction" /><div className="grid grid-cols-2 gap-2"><button type="submit" name="decision" value="reject" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Reject</button><button type="submit" name="decision" value="approve" disabled={isDemo} className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400">Approve</button></div></form></div></article>)}</div>}
    </main>
  );
}
