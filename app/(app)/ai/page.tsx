import type { ComponentType } from "react";
import { Bot, ShieldAlert, Sparkles, Wand2 } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { getProducts, getLeads } from "@/server/services/crm-data";
import { hasSupabaseConfig } from "@/lib/supabase/env";

export default function AIPage() {
  const configured = hasSupabaseConfig();
  const products = getProducts();
  const leads = getLeads();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assistant"
        title="AI sales assistant"
        description="Draft follow-ups, summarize opportunities, and suggest next-best actions with workspace context."
        actions={<StatusBadge tone={configured ? "success" : "warning"}>{configured ? "Configured" : "Configuration required"}</StatusBadge>}
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
        <SectionCard title="Conversation" description="Streaming-ready layout with approval gates for sensitive actions.">
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

          <div className="mt-6 grid gap-4">
            <Input placeholder="Ask the AI assistant" />
            <Textarea placeholder="Workspace system prompt placeholder" defaultValue="Be concise, accurate, and never invent pricing." />
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Context" description="Use approved workspace information only.">
            <div className="space-y-3 text-sm">
              <Row label="Approved leads" value={String(leads.length)} />
              <Row label="Approved products" value={String(products.length)} />
              <Row label="Human approval" value="Enabled" />
              <Row label="Usage tracking" value="Planned" />
            </div>
          </SectionCard>

          <SectionCard title="Suggested tools" description="Integration boundary for future AI operations.">
            <div className="space-y-3">
              <Tool label="Search leads" icon={Sparkles} />
              <Tool label="Create lead draft" icon={Wand2} />
              <Tool label="Summarize activity" icon={ShieldAlert} />
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-950 dark:text-white">{value}</span>
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
