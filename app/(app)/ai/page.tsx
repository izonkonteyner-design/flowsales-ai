import type { ComponentType } from "react";
import Link from "next/link";
import { Bot, Sparkles, Wand2 } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { listAiRuns } from "@/server/services/ai-runs";
import type { AiRunStatus, AiRunValidationStatus } from "@/types/ai";

export default async function AIPage() {
  const configured = hasSupabaseConfig();
  const context = await getWorkspaceContext();
  const isDemo = context.mode === "demo";

  // List recent AI sales agent / manager runs. Demo mode returns empty (no
  // persisted runs), so the demo UI shows the static, hand-written preview
  // rather than an artificial list.
  const recentRuns = isDemo ? { rows: [] } : await listAiRuns(
    { mode: context.mode, organizationId: context.organization.id, userId: context.userId },
    1,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assistant"
        title="AI sales assistant"
        description="Analyze leads with workspace context, draft follow-ups, and recommend next-best actions."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={configured ? "success" : "warning"}>
              {configured ? "Configured" : "Configuration required"}
            </StatusBadge>
            <StatusBadge tone={isDemo ? "info" : "neutral"}>
              {isDemo ? "Demo workspace" : `${context.organization.name}`}
            </StatusBadge>
          </div>
        }
      />

      {!configured ? (
        <EmptyState
          title="AI provider not configured"
          description="Set the Supabase and AI environment variables to enable live AI responses. The page still loads safely in configuration mode."
          actionHref="/settings"
          actionLabel="Open settings"
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-6">
          <SectionCard
            title="Recent AI runs"
            description="Sales agent and manager brief runs in this workspace."
          >
            {recentRuns.rows.length === 0 ? (
              <EmptyState
                title={isDemo ? "Demo workspace — runs aren't persisted" : "No runs yet"}
                description={
                  isDemo
                    ? "In the demo workspace the AI Sales Agent runs in preview mode. Create a live workspace to persist runs and see them here."
                    : "Run the AI Sales Agent on a lead to see its recommendation history here."
                }
                actionHref="/leads"
                actionLabel={isDemo ? "Explore leads (demo)" : "Open leads"}
              />
            ) : (
              <ul className="divide-y divide-slate-200 dark:divide-white/10">
                {recentRuns.rows.map((run) => (
                  <li key={run.id} className="py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium text-slate-950 dark:text-white">
                            {run.feature === "sales_agent" ? "Sales Agent" : run.feature === "manager_brief" ? "Manager Brief" : run.feature}
                          </span>
                          <StatusBadge tone={statusToneForStatus(run.status)}>
                            {run.status}
                          </StatusBadge>
                          {run.validation_status ? (
                            <StatusBadge tone={statusToneForValidation(run.validation_status)} title="Validation state of the model output">
                              {run.validation_status}
                            </StatusBadge>
                          ) : null}
                        </div>
                        <p className="text-xs text-slate-500">
                          {new Date(run.created_at).toLocaleString()} {run.model ? `· ${run.model}` : ""}
                        </p>
                        {run.error_message ? (
                          <p className="text-xs text-rose-600 dark:text-rose-400">
                            {run.error_category ? `${run.error_category}: ` : ""}
                            {run.error_message}
                          </p>
                        ) : null}
                      </div>
                      {run.target_lead_id ? (
                        <Link
                          href={`/leads/${run.target_lead_id}`}
                          className="shrink-0 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                        >
                          View lead
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title="Conversation"
            description="Streaming-ready layout with approval gates for sensitive actions."
          >
            <div className="space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                <p className="text-sm font-medium text-slate-950 dark:text-white">You</p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  Summarize Ahmet Yilmaz and draft a follow-up message.
                </p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-950/60">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-950 dark:text-white">
                  <Bot className="h-4 w-4" />
                  FlowSales AI
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                  Ahmet is in the qualified stage, has a strong budget, and is waiting for installation confirmation. I can draft a follow-up without inventing any product price because the approved catalog is available.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusBadge tone="info">Requires approval</StatusBadge>
                  <StatusBadge tone="neutral">No price invention</StatusBadge>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-4 dark:border-white/10 dark:bg-white/5">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Want to analyze a specific lead? Open a lead and use{' '}
                <span className="font-medium text-slate-950 dark:text-white">Analyze with AI</span>. The sales agent runs only on live workspaces — the demo workspace shows a static preview.
              </p>
              <div className="mt-3">
                <Link
                  href="/leads"
                  className="inline-flex h-9 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                >
                  Go to leads
                </Link>
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="How the agent works" description="What the AI can and cannot do.">
            <ol className="space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-400">
              <li>
                <span className="font-medium text-slate-950 dark:text-white">1. Load lead context.</span>{" "}
                Tasks, activities, related quotes, and the authorized product catalog are read from your workspace only.
              </li>
              <li>
                <span className="font-medium text-slate-950 dark:text-white">2. Generate recommendation.</span>{" "}
                Gemini returns a structured recommendation; it cannot invent product ids or prices outside the catalog.
              </li>
              <li>
                <span className="font-medium text-slate-950 dark:text-white">3. Approve.</span>{" "}
                Sensitive actions (create quote, change stage) require human approval before they touch your CRM.
              </li>
              <li>
                <span className="font-medium text-slate-950 dark:text-white">4. Persist.</span>{" "}
                Every run is logged to your workspace history with validation state, so you can audit the result.
              </li>
            </ol>
          </SectionCard>

          <SectionCard title="Suggested tools" description="Integration boundary for future AI operations.">
            <div className="space-y-3">
              <Tool label="Analyze a lead" icon={Sparkles} />
              <Tool label="Draft a follow-up" icon={Wand2} />
              <Tool label="Recommend a quote" icon={Bot} />
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function Tool({
  label,
  icon: Icon,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
      <Icon className="h-4 w-4 text-slate-500" />
      <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
    </div>
  );
}

function statusToneForStatus(status: AiRunStatus): "success" | "danger" | "neutral" {
  if (status === "succeeded") return "success";
  if (status === "failed") return "danger";
  return "neutral";
}

function statusToneForValidation(status: AiRunValidationStatus): "success" | "warning" | "danger" {
  if (status === "valid") return "success";
  if (status === "invalid") return "warning";
  return "danger";
}
