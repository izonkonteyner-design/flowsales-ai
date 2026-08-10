import Link from "next/link";
import { ArrowUpRight, Clock3, Flame, Target } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/utils";
import { listSalesExecutionPriorities } from "@/server/services/sales-execution-v2";
import { loadWorkspaceContext } from "@/server/services/workspace-context";

const actionLabels: Record<string, string> = { ask_question: "Eksik bilgiyi sor", share_information: "Bilgi paylaş", create_quote: "Teklif hazırla", follow_up: "Takip et", call: "Ara", no_action: "İşlem yok" };
const stageLabels: Record<string, string> = { new_lead: "Yeni lead", discovery: "İhtiyaç analizi", qualified: "Nitelikli", quote_ready: "Teklife hazır", quote_sent: "Teklif gönderildi", negotiation: "Pazarlık" };

export default async function FollowUpsPage() {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) return <EmptyState title="Oturum gerekli" description="Takip kuyruğunu görmek için giriş yapın." actionHref="/login" actionLabel="Giriş yap" />;
  let items;
  try { items = await listSalesExecutionPriorities(ctx.organization.id, 25); }
  catch { return <EmptyState title="Takip kuyruğu yüklenemedi" description="Satış öncelikleri şu anda alınamıyor." actionHref="/dashboard" actionLabel="Kontrol paneline dön" />; }

  return <div className="space-y-6">
    <PageHeader eyebrow="Satış operasyonu" title="Akıllı takip kuyruğu" description="Lead Score, satış aşaması, AI önceliği ve gecikmiş aksiyon süresini birlikte değerlendirerek sıraya konmuş satış işleri." />
    <SectionCard title="Öncelik sırası" description="En yüksek ticari değer ve zaman hassasiyeti taşıyan görüşmeler üstte gösterilir. AI hiçbir mesajı otomatik göndermez.">
      {items.length ? <div className="space-y-3">{items.map((item,index) => <Link key={item.conversationId} href={item.href} className="group grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 transition hover:border-violet-300 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:border-violet-400/30 md:grid-cols-[54px_1fr_auto] md:items-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/25 to-cyan-400/15 text-base font-bold text-violet-200 ring-1 ring-white/10">#{index+1}</div>
        <div><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-slate-950 dark:text-white">{item.contactName}</p><StatusBadge tone="info">Score {item.score}</StatusBadge><StatusBadge tone={item.priority === "high" ? "danger" : item.priority === "medium" ? "warning" : "neutral"}>{item.priority === "high" ? "Yüksek" : item.priority === "medium" ? "Orta" : "Düşük"}</StatusBadge><StatusBadge tone="neutral">{stageLabels[item.salesStage] || item.salesStage}</StatusBadge><StatusBadge tone="neutral">{item.provider}</StatusBadge></div><div className="mt-2 flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300"><Target className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" /><span><strong>{actionLabels[item.nextBestActionType] || item.nextBestActionType}:</strong> {item.nextBestAction}</span></div>{item.nextBestActionRationale ? <p className="mt-1 text-xs text-slate-500">Neden: {item.nextBestActionRationale}</p> : null}{item.dueAt ? <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" />{item.overdueHours > 0 ? `${item.overdueHours} saat gecikmiş` : formatDateTime(item.dueAt)}</div> : null}</div>
        <div className="flex items-center gap-2 text-xs font-semibold text-violet-300"><Flame className="h-4 w-4" />{item.rankScore}<ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></div>
      </Link>)}</div> : <EmptyState title="Takip bekleyen öncelikli görüşme yok" description="Yeni Conversation Intelligence analizleri ve onaylı takip planları oluştukça kuyruk burada otomatik sıralanır." />}
    </SectionCard>
  </div>;
}
