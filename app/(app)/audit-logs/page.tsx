import { Clock3, ShieldAlert } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { formatDateTime } from "@/lib/utils";
import { getAuditLogs } from "@/server/services/workspace-data";

export default function AuditLogsPage() {
  const logs = getAuditLogs();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Security"
        title="Audit Logs"
        description="Trace the most important workspace actions for accountability and debugging."
        actions={<ShieldAlert className="h-5 w-5 text-slate-500" />}
      />

      <SectionCard title="Recent events" description="A compact audit trail for the demo workspace.">
        <div className="space-y-3">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:flex-row lg:items-center lg:justify-between dark:border-white/10 dark:bg-white/5"
            >
              <div>
                <p className="font-medium text-slate-950 dark:text-white">{log.action}</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {log.actor} · {log.entity} {log.entity_id}
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Clock3 className="h-4 w-4" />
                {formatDateTime(log.created_at)}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
