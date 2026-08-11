import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Clock3, History, Target } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/utils";
import { listStaleOpportunities } from "@/server/services/sales-intelligence-v3";
import { loadWorkspaceContext } from "@/server/services/workspace-context";

const stageLabels: Record<string, string> = { new_lead: "Yeni lead", discovery: "İhtiyaç analizi", qualified: "Nitelikli", quote_ready: "Teklife hazır", quote_sent: "Teklif gönderildi", negotiation: "Pazarlık" };

export default async function OpportunityRiskPage() {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) return <EmptyState title="Oturum gerekli" description="Fırsat risk kuyruğunu görmek için giriş yapın." actionHref="/login" actionLabel="Giriş yap" />;

  let items;
  try { items = await listStaleOpportunities({ organizationId: ctx.organization.id, userId: ctx.userId, userRole: ctx.role, limit: 50 }); }
  catch { return <EmptyState title="Risk kuyruğu yüklenemedi" description="Kaçan fırsat sinyalleri şu anda hesaplanamıyor." actionHref="/dashboard" actionLabel="Kontrol paneline dön" />; }

  return <div className="space-y-6">
    <PageHeader eyebrow="Satış riski" title="Kaçan ve bekleyen fırsatlar" description="Conversation Intelligence, takip zamanı, satış aşaması ve son müşteri aktivitesini birlikte değerlendirerek müdahale gerektiren fırsatları öne çıkarır." />
    <SectionCard title="Risk önceliği" description="Teklif ve pazarlık aşamasındaki sessizlik daha erken risk olarak kabul edilir. Bu ekran yalnızca önerir; müşteri iletişimi otomatik yapılmaz.">
      {items.length ? <div className="space-y-3">{items.map((item,index) => <div key={item.leadId} className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5 xl:grid-cols-[56px_1fr_auto] xl:items-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-sm font-bold text-rose-300 ring-1 ring-rose-400/20">#{index+1}</div>
        <div><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-slate-950 dark:text-white">{item.name}</p><StatusBadge tone="danger">Risk {item.riskScore}</StatusBadge><StatusBadge tone="info">Score {item.score}</StatusBadge><StatusBadge tone="neutral">{stageLabels[item.salesStage] || item.salesStage}</StatusBadge></div><div className="mt-2 flex items-start gap-2 text-sm text-rose-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{item.reason}</span></div><div className="mt-2 flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300"><Target className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" /><span><strong>Önerilen aksiyon:</strong> {item.nextBestAction}</span></div><div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />Son aktivite: {formatDateTime(item.lastActivityAt)} · {item.inactiveHours} saat önce</span>{item.followUpAt ? <span>Takip zamanı: {formatDateTime(item.followUpAt)}</span> : null}</div></div>
        <div className="flex flex-wrap gap-2"><Link href={`/inbox/${item.conversationId}`} className="inline-flex h-9 items-center gap-2 rounded-xl bg-violet-600 px-3 text-xs font-semibold text-white">Görüşmeyi aç<ArrowUpRight className="h-3.5 w-3.5" /></Link><Link href={`/leads/${item.leadId}/score-history`} className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-medium text-slate-300"><History className="h-3.5 w-3.5" />Skor geçmişi</Link></div>
      </div>)}</div> : <EmptyState title="Şu anda kritik fırsat riski yok" description="Gecikmiş takip veya satış aşamasına göre olağandışı sessizlik oluştuğunda fırsatlar burada görünür." />}
    </SectionCard>
  </div>;
}
