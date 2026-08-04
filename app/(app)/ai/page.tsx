import Link from "next/link";
import { Bot, ChevronRight, ShieldCheck, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const capabilities = [
  "Lead scoring",
  "Next best action",
  "Opportunity summary",
  "Follow-up draft",
  "Product recommendation",
  "Quote recommendation",
] as const;

export default async function AIPage() {
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

  const [{ data: leads, error: leadsError }, { data: demoFlag }] = await Promise.all([
    client
      .from("leads")
      .select("id, full_name, company, status, source, updated_at")
      .eq("organization_id", membership.organization_id)
      .order("updated_at", { ascending: false })
      .limit(25),
    client.rpc("is_demo_organization", { p_organization_id: membership.organization_id }),
  ]);

  if (leadsError) {
    throw new Error(`Unable to load AI lead context: ${leadsError.message}`);
  }

  const isDemo = demoFlag === true;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assistant"
        title="AI sales workspace"
        description="Choose a lead and run the production AI workflow with workspace context, audit history and approval gates."
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="success">AI configured</StatusBadge>
            <StatusBadge tone={isDemo ? "warning" : "info"}>
              {isDemo ? "Demo safe mode" : "Live workspace"}
            </StatusBadge>
          </div>
        }
      />

      <section className="relative overflow-hidden rounded-[2rem] border border-violet-400/15 bg-[linear-gradient(135deg,rgba(124,58,237,.16),rgba(37,99,235,.08)_48%,rgba(14,165,233,.06))] p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-violet-500/15 blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/15 bg-violet-300/10 px-3 py-1.5 text-xs font-medium text-violet-200">
              <Sparkles className="h-3.5 w-3.5" /> Production AI workflow
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white">
              AI actions now run from verified lead context.
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Select a lead below to score the opportunity, generate a follow-up, recommend products or prepare an approval-gated quote recommendation. AI outputs are recorded in history and protected mutations require human approval.
            </p>
          </div>
          <Link
            href="/ai-history"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/[0.1] bg-white/[0.06] px-4 text-sm font-medium text-white transition hover:bg-white/[0.1]"
          >
            View AI history <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {isDemo ? (
        <SectionCard className="border-amber-400/20 bg-amber-400/[0.06]">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <p className="font-medium text-amber-100">Demo Safe Mode is active</p>
              <p className="mt-1 text-sm leading-6 text-amber-100/70">
                Informational AI analysis is available. Mutating actions remain blocked or approval-gated and demo data cannot be permanently changed.
              </p>
            </div>
          </div>
        </SectionCard>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <SectionCard title="Select a lead" description="Open the live AI panel for a specific opportunity.">
          {leads?.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {leads.map((lead) => (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}/ai`}
                  className="group rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 transition hover:-translate-y-0.5 hover:border-violet-300/25 hover:bg-white/[0.06]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">{lead.full_name}</p>
                      <p className="mt-1 truncate text-sm text-slate-500">{lead.company || "No company"}</p>
                    </div>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-400/15 ring-1 ring-white/10">
                      <Bot className="h-4 w-4 text-violet-200" />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge tone="neutral">{humanize(lead.status)}</StatusBadge>
                      {lead.source ? <StatusBadge tone="info">{lead.source}</StatusBadge> : null}
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-cyan-300" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No leads available for AI"
              description="Create or import a lead first, then return here to run a context-grounded AI workflow."
              actionHref="/leads/new"
              actionLabel="Create lead"
            />
          )}
        </SectionCard>

        <SectionCard title="Available capabilities" description="Every capability uses trusted workspace records.">
          <div className="space-y-3">
            {capabilities.map((capability) => (
              <div key={capability} className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3">
                <Sparkles className="h-4 w-4 text-violet-300" />
                <span className="text-sm text-slate-300">{capability}</span>
              </div>
            ))}
          </div>
          <Link
            href="/approvals"
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-blue-500 px-4 text-sm font-medium text-white transition hover:brightness-110"
          >
            Open approval queue <ChevronRight className="h-4 w-4" />
          </Link>
        </SectionCard>
      </div>
    </div>
  );
}

function humanize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
