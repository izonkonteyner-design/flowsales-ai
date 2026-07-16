import { Code2, PlugZap, ServerCog, type LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { getApiEndpoints } from "@/server/services/workspace-data";

export default function ApiLayerPage() {
  const endpoints = getApiEndpoints();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        title="API Layer"
        description="A product-ready surface for integrations, automation, and AI-powered operations."
        actions={
          <div className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
            <ServerCog className="h-4 w-4" />
            Integration ready
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <SectionCard title="Endpoints" description="Representative endpoints for the CRM and AI workflow.">
          <div className="space-y-3">
            {endpoints.map((endpoint) => (
              <div
                key={endpoint.id}
                className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:flex-row lg:items-center lg:justify-between dark:border-white/10 dark:bg-white/5"
              >
                <div>
                  <p className="font-mono text-sm font-medium text-slate-950 dark:text-white">
                    {endpoint.method} {endpoint.path}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{endpoint.purpose}</p>
                </div>
                <div className="text-sm text-slate-500">{endpoint.auth}</div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Integration notes" description="Safe defaults before external systems are connected.">
          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
            <Note icon={Code2} title="Typed contracts" detail="Keep request and response shapes validated." />
            <Note icon={PlugZap} title="Automation hooks" detail="Use the API for workflows, webhooks, and partner systems." />
            <Note icon={ServerCog} title="Server boundary" detail="Sensitive operations should stay server-side." />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function Note({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-400" />
        <p className="font-medium text-slate-950 dark:text-white">{title}</p>
      </div>
      <p className="mt-1">{detail}</p>
    </div>
  );
}
