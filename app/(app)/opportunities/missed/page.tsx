import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Clock3, Flame } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { listMissedOpportunities } from "@/server/services/missed-opportunities";
import { loadWorkspaceContext } from "@/server/services/workspace-context";

const signalLabels = {
  follow_up_missed: "Takip kaçırıldı",
  high_intent_idle: "Yüksek niyet bekliyor",
  quote_stage_idle: "Teklif aşaması bekliyor",
} as const;

export default async function MissedOpportunitiesPage() {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) return <EmptyState title="Oturum gerekli" description="Kaçan fırsatları görmek için giriş yapın." actionHref="/login" actionLabel="Giriş yap" />;
  const rows = await listMissedOpportunities({ organizationId: ctx.organization.id, userId: ctx.userId, userRole: ctx.role, limit: 40 });

  return <div className="space-y-6">
    <PageHeader eyebrow="Satış Zekâsı" title="Kaçan fırsatlar" description="Teklif isteyen, yüksek Lead Score taşıyan veya planlanan takibi kaçırılan açık fırsatları satış ekibine geri getirir." />
    {rows.length ? <div className="space-y-3">{rows.map((item) => <div key={item.leadId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><Link href={`/leads/${item.leadId}`} className="font-semibold text-slate-950 hover:underline dark:text-white">{item.name}</Link><StatusBadge tone={item.severity === "critical" ? "danger" : item.severity === "high" ? "warning" : "neutral"}>{signalLabels[item.signal]}</StatusBadge><StatusBadge tone="info"><Flame className="mr-1 inline h-3.5 w-3.5" />Score {item.score}</StatusBadge></div>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{item.reason}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" />{item.inactiveHours} saat aktivite yok · Risk {item.riskScore}/100</p>
          <p className="mt-2 text-sm text-blue-700 dark:text-blue-300"><strong>Sonraki aksiyon:</strong> {item.nextBestAction}</p>
        </div>
        <div className="flex flex-wrap gap-2"><Link href={`/inbox/${item.conversationId}`} className="inline-flex h-9 items-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-semibold text-white dark:bg-white dark:text-slate-950">Görüşmeyi aç<ArrowUpRight className="h-3.5 w-3.5" /></Link><Link href={`/leads/${item.leadId}/quote-intelligence`} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-medium dark:border-white/10">Teklif zekâsı</Link></div>
      </div>
    </div>)}</div> : <EmptyState title="Kaçan fırsat görünmüyor" description="Takip kaçırılan veya yüksek niyetle bekleyen fırsat oluştuğunda burada listelenecek." />}
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4" />Bu ekran yalnızca karar desteğidir; müşteriye otomatik mesaj göndermez ve CRM aşamasını kendiliğinden değiştirmez.</div>
  </div>;
}
