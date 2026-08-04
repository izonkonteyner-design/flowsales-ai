import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { runLeadAiAction } from "./actions";

export const metadata: Metadata = {
  title: "Lead AI Panel | FlowSales AI",
};

type PageProps = {
  params: Promise<{ leadId: string }>;
  searchParams: Promise<{ toast?: string; tone?: string }>;
};

const capabilities = [
  { key: "lead_scoring", title: "Lead Scoring", description: "Evaluate lead quality, evidence and sales readiness." },
  { key: "next_best_action", title: "Next Best Action", description: "Recommend the safest and most useful next sales step." },
  { key: "follow_up_draft", title: "Follow-up Draft", description: "Create a contextual draft without sending it automatically." },
  { key: "product_recommendation", title: "Product Recommendation", description: "Match the lead only with active catalog products." },
  { key: "quote_recommendation", title: "Quote Recommendation", description: "Recommend a trusted-source quote structure for approval." },
] as const;

function label(value: string) {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export default async function LeadAiPage({ params, searchParams }: PageProps) {
  const [{ leadId }, query] = await Promise.all([params, searchParams]);
  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");
  const { data: authData } = await client.auth.getUser();
  if (!authData.user) redirect("/login");

  const { data: membership } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", authData.user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/onboarding");

  const [{ data: lead }, { data: runs, error: runsError }, { data: demoFlag }] = await Promise.all([
    client
      .from("leads")
      .select("id, full_name, company, status, source, estimated_value, currency")
      .eq("organization_id", membership.organization_id)
      .eq("id", leadId)
      .maybeSingle(),
    client
      .from("ai_runs")
      .select("id, capability, status, decision, output, provider, model, created_at, completed_at, error_code")
      .eq("organization_id", membership.organization_id)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(20),
    client.rpc("is_demo_organization", { p_organization_id: membership.organization_id }),
  ]);

  if (!lead) notFound();
  if (runsError) throw new Error(`Unable to load lead AI history: ${runsError.message}`);
  const isDemo = demoFlag === true;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-600">Lead intelligence</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{lead.full_name}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {lead.company || "No company"} · {label(lead.status)} · {lead.source || "Unknown source"}
          </p>
        </div>
        <div className="flex gap-4 text-sm font-semibold">
          <Link href="/leads" className="text-slate-600 hover:text-slate-950">All leads</Link>
          <Link href="/ai-history" className="text-violet-700 hover:text-violet-900">AI history</Link>
        </div>
      </div>

      {query.toast ? (
        <div className={`rounded-xl border px-4 py-3 text-sm ${query.tone === "danger" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {query.toast}
        </div>
      ) : null}

      {isDemo ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Demo Safe Mode is active. AI may analyze data, but protected mutations and quote actions remain blocked or approval-gated.
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {capabilities.map((capability) => (
          <form key={capability.key} action={runLeadAiAction} className="flex min-h-56 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <input type="hidden" name="leadId" value={leadId} />
            <input type="hidden" name="capability" value={capability.key} />
            <h2 className="text-base font-semibold text-slate-950">{capability.title}</h2>
            <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{capability.description}</p>
            <button type="submit" className="mt-5 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
              Run analysis
            </button>
          </form>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Recent AI results</h2>
            <p className="mt-1 text-sm text-slate-600">Structured outputs remain advisory until policy and approval checks pass.</p>
          </div>
          {lead.estimated_value !== null ? (
            <p className="text-sm font-semibold text-slate-700">{lead.currency} {Number(lead.estimated_value).toLocaleString()}</p>
          ) : null}
        </div>

        <div className="mt-5 space-y-4">
          {(runs ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">No AI analysis has been run for this lead.</div>
          ) : (runs ?? []).map((run) => {
            const output = run.output && typeof run.output === "object" ? run.output as { summary?: string; confidence?: number; actions?: Array<{ title?: string; rationale?: string }>; warnings?: string[] } : null;
            return (
              <article key={run.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">{label(run.capability)}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{run.status}</span>
                  {run.decision ? <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">{label(run.decision)}</span> : null}
                  <span className="text-xs text-slate-500">{new Date(run.created_at).toLocaleString()}</span>
                </div>
                {output?.summary ? <p className="mt-3 text-sm leading-6 text-slate-800">{output.summary}</p> : null}
                {typeof output?.confidence === "number" ? <p className="mt-2 text-xs text-slate-500">Confidence: {Math.round(output.confidence * 100)}%</p> : null}
                {output?.actions?.length ? (
                  <ul className="mt-3 space-y-2">
                    {output.actions.map((action, index) => (
                      <li key={`${run.id}-${index}`} className="rounded-lg bg-slate-50 p-3 text-sm">
                        <p className="font-semibold text-slate-900">{action.title}</p>
                        <p className="mt-1 text-slate-600">{action.rationale}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {run.error_code ? <p className="mt-3 text-sm font-medium text-red-700">{run.error_code}</p> : null}
                {run.provider ? <p className="mt-3 text-xs text-slate-500">{run.provider} · {run.model}</p> : null}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
