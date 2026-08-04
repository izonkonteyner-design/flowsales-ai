import Link from "next/link";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  aiQualityDashboardSchema,
  formatQualityRate,
} from "@/server/services/ai-quality-dashboard";

export const metadata = { title: "AI Quality | FlowSales AI" };

const riskClass = {
  critical: "border-red-300 bg-red-50 text-red-950",
  high: "border-orange-300 bg-orange-50 text-orange-950",
  medium: "border-amber-200 bg-amber-50 text-amber-950",
  low: "border-slate-200 bg-slate-50 text-slate-900",
} as const;

export default async function AiQualityPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const params = await searchParams;
  const requestedDays = Number(params.days ?? "30");
  const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;

  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: membership } = await client
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", auth.user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/onboarding");
  if (!["owner", "admin"].includes(String(membership.role))) redirect("/dashboard");

  const { data, error } = await client.rpc("get_ai_quality_dashboard", {
    p_organization_id: membership.organization_id,
    p_days: days,
  });
  if (error) throw new Error(`Unable to load AI quality dashboard: ${error.message}`);
  const dashboard = aiQualityDashboardSchema.parse(data);
  const summary = dashboard.summary;

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-700">Owner and admin only</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">AI quality dashboard</h1>
          <p className="mt-2 max-w-3xl text-slate-600">
            Compare prompt and model quality using production feedback, execution outcomes and persisted regression evidence.
          </p>
        </div>
        <Link href="/operations" className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm">
          Back to operations
        </Link>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Quality window">
        {[7, 30, 90].map((window) => (
          <Link
            key={window}
            href={`/operations/ai-quality?days=${window}`}
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${days === window ? "border-violet-700 bg-violet-700 text-white" : "bg-white text-slate-700"}`}
          >
            Last {window} days
          </Link>
        ))}
      </nav>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {[
          ["Completed runs", summary.completedRuns],
          ["Failed runs", summary.failedRuns],
          ["Feedback", summary.feedbackCount],
          ["Helpful", summary.helpfulCount],
          ["Coverage", formatQualityRate(summary.feedbackCoverage)],
          ["Helpful rate", formatQualityRate(summary.helpfulRate)],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-slate-950">Release risks</h2>
          <p className="text-sm text-slate-600">Quality gates that require attention before promoting a prompt or model version.</p>
        </div>
        {dashboard.risks.length === 0 ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">No AI quality risks detected for this window.</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {dashboard.risks.map((risk) => (
              <article key={risk.key} className={`rounded-2xl border p-5 ${riskClass[risk.severity]}`}>
                <span className="text-xs font-bold uppercase tracking-wide">{risk.severity}</span>
                <h3 className="mt-2 font-bold">{risk.title}</h3>
                <p className="mt-1 text-sm">{risk.detail}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-slate-950">Prompt and model segments</h2>
          <p className="text-sm text-slate-600">Use feedback volume and helpful rate together; small samples are not release evidence.</p>
        </div>
        <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Capability</th><th className="px-4 py-3">Prompt</th><th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">Completed</th><th className="px-4 py-3">Failed</th><th className="px-4 py-3">Feedback</th><th className="px-4 py-3">Helpful</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {dashboard.segments.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No AI execution data in this window.</td></tr>
              ) : dashboard.segments.map((segment) => (
                <tr key={`${segment.capability}:${segment.prompt_version}:${segment.model}`}>
                  <td className="px-4 py-3 font-semibold text-slate-900">{segment.capability.replaceAll("_", " ")}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{segment.prompt_version}</td>
                  <td className="px-4 py-3 text-slate-700">{segment.model}</td>
                  <td className="px-4 py-3">{segment.completed_runs}</td><td className="px-4 py-3">{segment.failed_runs}</td>
                  <td className="px-4 py-3">{segment.feedback_count}</td><td className="px-4 py-3 font-semibold">{formatQualityRate(segment.helpful_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-slate-950">Regression evaluation history</h2>
          <p className="text-sm text-slate-600">Persisted CI evidence for prompt releases. A failed latest run blocks promotion.</p>
        </div>
        <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Created</th><th className="px-4 py-3">Suite</th><th className="px-4 py-3">Prompt</th><th className="px-4 py-3">Model</th><th className="px-4 py-3">Cases</th><th className="px-4 py-3">Score</th><th className="px-4 py-3">Status</th></tr>
            </thead>
            <tbody className="divide-y">
              {dashboard.evaluations.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No persisted evaluation evidence.</td></tr>
              ) : dashboard.evaluations.map((evaluation) => (
                <tr key={evaluation.id}>
                  <td className="px-4 py-3 text-slate-600">{new Date(evaluation.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 font-semibold">{evaluation.suite_key}</td>
                  <td className="px-4 py-3 font-mono text-xs">{evaluation.prompt_version}</td><td className="px-4 py-3">{evaluation.model}</td>
                  <td className="px-4 py-3">{evaluation.passed_cases}/{evaluation.total_cases}</td><td className="px-4 py-3">{formatQualityRate(evaluation.score)}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold uppercase ${evaluation.status === "passed" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>{evaluation.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-slate-500">Generated {new Date(dashboard.generatedAt).toLocaleString()}.</p>
    </main>
  );
}
