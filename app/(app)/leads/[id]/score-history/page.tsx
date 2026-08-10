import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock3, TrendingDown, TrendingUp } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/utils";
import { getLeadScoreHistory } from "@/server/services/sales-intelligence-v3";
import { loadWorkspaceContext } from "@/server/services/workspace-context";

const stageLabels: Record<string, string> = {
  new_lead: "Yeni lead",
  discovery: "İhtiyaç analizi",
  qualified: "Nitelikli",
  quote_ready: "Teklife hazır",
  quote_sent: "Teklif gönderildi",
  negotiation: "Pazarlık",
  won: "Kazanıldı",
  lost: "Kaybedildi",
  support: "Destek",
};

export default async function LeadScoreHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) return <EmptyState title="Oturum gerekli" description="Lead skor geçmişini görmek için giriş yapın." actionHref="/login" actionLabel="Giriş yap" />;

  let history;
  try { history = await getLeadScoreHistory(ctx.organization.id, id); }
  catch { return <EmptyState title="Skor geçmişi yüklenemedi" description="Conversation Intelligence geçmişi şu anda alınamıyor." actionHref={`/leads/${id}`} actionLabel="Lead kaydına dön" />; }

  const latest = history.at(-1);
  const first = history.at(0);
  const totalDelta = latest && first ? latest.score - first.score : 0;

  return <div className="space-y-6">
    <PageHeader eyebrow="Conversation Intelligence" title="Lead Score geçmişi" description="Bu lead için zaman içinde üretilen skorları, satış aşaması değişimini ve Next Best Action geçmişini izleyin." actions={<Link href={`/leads/${id}`} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"><ArrowLeft className="h-4 w-4" />Lead kaydına dön</Link>} />

    {history.length ? <>
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Güncel Lead Score" value={String(latest?.score ?? 0)} />
        <Metric label="Toplam skor değişimi" value={`${totalDelta > 0 ? "+" : ""}${totalDelta}`} trend={totalDelta} />
        <Metric label="Analiz sayısı" value={String(history.length)} />
      </div>

      <SectionCard title="Skor zaman çizelgesi" description="Her kayıt bağımsız bir Conversation Intelligence analizidir. Önceki skora göre değişim ayrıca gösterilir.">
        <div className="space-y-3">
          {[...history].reverse().map((item) => <div key={item.id} className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5 lg:grid-cols-[120px_1fr_auto] lg:items-center">
            <div><div className="text-3xl font-bold text-violet-300">{item.score}</div><div className="mt-1 text-xs text-slate-500">Lead Score</div>{item.delta !== null ? <div className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${item.delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{item.delta >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}{item.delta > 0 ? "+" : ""}{item.delta}</div> : null}</div>
            <div><div className="flex flex-wrap items-center gap-2"><StatusBadge tone={item.priority === "high" ? "danger" : item.priority === "medium" ? "warning" : "neutral"}>{item.priority === "high" ? "Yüksek" : item.priority === "medium" ? "Orta" : "Düşük"}</StatusBadge><StatusBadge tone="info">{stageLabels[item.salesStage] || item.salesStage}</StatusBadge><StatusBadge tone="neutral">{item.status === "accepted" ? "Kabul edildi" : item.status === "dismissed" ? "Reddedildi" : "Öneri"}</StatusBadge></div><p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">{item.summary}</p><div className="mt-2 flex items-start gap-2 text-sm text-slate-500"><ArrowRight className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>Sonraki aksiyon:</strong> {item.nextBestAction}</span></div></div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" />{formatDateTime(item.createdAt)}</div>
          </div>)}
        </div>
      </SectionCard>
    </> : <EmptyState title="Henüz skor geçmişi yok" description="Bu lead bir Inbox görüşmesine bağlanıp Conversation Intelligence analizi üretildiğinde geçmiş burada oluşur." actionHref={`/leads/${id}`} actionLabel="Lead kaydına dön" />}
  </div>;
}

function Metric({ label, value, trend }: { label: string; value: string; trend?: number }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold text-white">{value}</p>{typeof trend === "number" ? <p className={`mt-2 text-xs ${trend >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{trend >= 0 ? "Skor yükseliyor" : "Skor geriliyor"}</p> : null}</div>;
}
