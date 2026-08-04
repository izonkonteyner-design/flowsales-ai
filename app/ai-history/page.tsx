import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SupabaseAiHistoryRepository } from "@/server/repositories/supabase/ai-history";
import { submitAiFeedbackAction } from "./actions";

export const metadata: Metadata = {
  title: "AI History | FlowSales AI",
};

type SearchParams = Promise<{
  capability?: string;
  status?: string;
  leadId?: string;
}>;

const CAPABILITIES = [
  "lead_scoring",
  "next_best_action",
  "opportunity_summary",
  "follow_up_draft",
  "product_recommendation",
  "quote_recommendation",
] as const;

const STATUSES = ["started", "completed", "failed"] as const;

function label(value: string) {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function AiHistoryPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");

  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) redirect("/login");

  const { data: memberships, error: membershipError } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", authData.user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (membershipError) throw new Error(`Unable to resolve workspace: ${membershipError.message}`);
  const membership = memberships?.[0];
  if (!membership) redirect("/onboarding");

  const capability = CAPABILITIES.includes(params.capability as (typeof CAPABILITIES)[number])
    ? params.capability
    : undefined;
  const status = STATUSES.includes(params.status as (typeof STATUSES)[number]) ? params.status : undefined;
  const leadId = params.leadId?.trim() || undefined;

  const repository = new SupabaseAiHistoryRepository(client);
  const [runs, timeline] = await Promise.all([
    repository.listRuns({ workspaceId: membership.organization_id, capability, status, leadId, limit: 50 }),
    repository.listTimeline({ workspaceId: membership.organization_id, capability, status, leadId, limit: 75 }),
  ]);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Traceability</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">AI History & Timeline</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Review workspace-scoped AI runs, prompt and model versions, decisions, failures, feedback and approval events.
          </p>
        </div>
        <div className="flex gap-4 text-sm font-semibold">
          <Link href="/approvals" className="text-violet-700 hover:text-violet-900">Approval queue</Link>
          <Link href="/dashboard" className="text-slate-700 hover:text-slate-950">Dashboard</Link>
        </div>
      </div>

      <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
        <select name="capability" defaultValue={capability ?? ""} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">All capabilities</option>
          {CAPABILITIES.map((item) => <option key={item} value={item}>{label(item)}</option>)}
        </select>
        <select name="status" defaultValue={status ?? ""} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">All statuses</option>
          {STATUSES.map((item) => <option key={item} value={item}>{label(item)}</option>)}
        </select>
        <input name="leadId" defaultValue={leadId ?? ""} placeholder="Filter by lead ID" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <button type="submit" className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Apply filters</button>
      </form>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-950">AI runs</h2>
            <span className="text-sm text-slate-500">{runs.length} records</span>
          </div>
          {runs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">No AI runs match these filters.</div>
          ) : runs.map((run) => (
            <article key={run.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">{label(run.capability)}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${run.status === "failed" ? "bg-red-50 text-red-700" : run.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>{label(run.status)}</span>
                {run.decision ? <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">{label(run.decision)}</span> : null}
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-slate-500">Started</dt><dd className="font-medium text-slate-900">{formatDate(run.createdAt)}</dd></div>
                <div><dt className="text-slate-500">Provider</dt><dd className="font-medium text-slate-900">{run.provider ?? "Not recorded"} {run.model ? `· ${run.model}` : ""}</dd></div>
                <div><dt className="text-slate-500">Prompt version</dt><dd className="font-medium text-slate-900">{run.promptVersion ?? "Legacy run"}</dd></div>
                <div><dt className="text-slate-500">Output schema</dt><dd className="font-medium text-slate-900">{run.outputSchemaVersion ?? "Legacy run"}</dd></div>
                <div><dt className="text-slate-500">Tokens</dt><dd className="font-medium text-slate-900">{run.inputTokens + run.outputTokens}</dd></div>
                <div><dt className="text-slate-500">Estimated cost</dt><dd className="font-medium text-slate-900">${run.estimatedCostUsd.toFixed(6)}</dd></div>
              </dl>
              {run.errorCode ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Failure: {run.errorCode}</p> : null}
              {run.status === "completed" ? (
                <form action={submitAiFeedbackAction} className="mt-5 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <input type="hidden" name="runId" value={run.id} />
                  <p className="text-sm font-semibold text-slate-900">Was this AI result useful?</p>
                  <div className="flex flex-wrap gap-2">
                    <button name="rating" value="helpful" className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-800">Helpful</button>
                    <button name="rating" value="not_helpful" className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-800">Not helpful</button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
                    <select name="reasonCode" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" defaultValue="">
                      <option value="">Optional reason</option>
                      <option value="accurate">Accurate</option>
                      <option value="actionable">Actionable</option>
                      <option value="clear">Clear</option>
                      <option value="incorrect">Incorrect</option>
                      <option value="unsupported">Unsupported claim</option>
                      <option value="unsafe">Unsafe suggestion</option>
                      <option value="not_relevant">Not relevant</option>
                      <option value="other">Other</option>
                    </select>
                    <input name="comment" maxLength={1000} placeholder="Optional feedback note" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                  </div>
                </form>
              ) : null}
              <p className="mt-4 break-all text-xs text-slate-500">Run ID: {run.id}{run.leadId ? ` · Lead: ${run.leadId}` : ""}</p>
            </article>
          ))}
        </section>

        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-950">Timeline</h2>
            <span className="text-sm text-slate-500">{timeline.length} events</span>
          </div>
          <ol className="mt-4 space-y-3">
            {timeline.length === 0 ? (
              <li className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">No timeline events match these filters.</li>
            ) : timeline.map((event) => (
              <li key={event.id} className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{event.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{event.description}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">{formatDate(event.occurredAt)}</span>
                </div>
                <p className="mt-3 text-xs text-slate-500">{event.kind === "approval_event" ? "Approval event" : "AI run"}{event.capability ? ` · ${label(event.capability)}` : ""}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
