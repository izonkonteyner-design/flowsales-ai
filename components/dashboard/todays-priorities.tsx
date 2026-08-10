import Link from "next/link";
import { ArrowUpRight, Clock3, Flame, Target } from "lucide-react";

import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/utils";
import { listSalesExecutionPriorities } from "@/server/services/sales-execution-v2";
import { loadWorkspaceContext } from "@/server/services/workspace-context";

const stageLabels: Record<string, string> = {
  new_lead: "Yeni lead",
  discovery: "İhtiyaç analizi",
  qualified: "Nitelikli",
  quote_ready: "Teklife hazır",
  quote_sent: "Teklif gönderildi",
  negotiation: "Pazarlık",
};

const actionLabels: Record<string, string> = {
  ask_question: "Eksik bilgiyi sor",
  share_information: "Bilgi paylaş",
  create_quote: "Teklif hazırla",
  follow_up: "Takip et",
  call: "Ara",
  no_action: "İşlem yok",
};

export async function TodaysPriorities() {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) return null;
  let priorities;
  try { priorities = await listSalesExecutionPriorities(ctx.organization.id, 5); }
  catch { return null; }

  return (
    <SectionCard title="Bugünün öncelikleri" description="Lead Score, satış aşaması, gecikmiş takip ve AI önceliğine göre sıralanan en kritik müşteri aksiyonları.">
      {priorities.length ? <div className="space-y-3">
        {priorities.map((item, index) => <Link key={item.conversationId} href={item.href}
          className="group grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 transition hover:border-violet-300 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:border-violet-400/30 dark:hover:bg-white/[0.07] md:grid-cols-[44px_1fr_auto] md:items-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/20 to-cyan-400/15 text-sm font-bold text-violet-200 ring-1 ring-white/10">#{index + 1}</div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium text-slate-950 dark:text-white">{item.contactName}</p><StatusBadge tone={item.priority === "high" ? "danger" : item.priority === "medium" ? "warning" : "neutral"}>{item.priority === "high" ? "Yüksek" : item.priority === "medium" ? "Orta" : "Düşük"}</StatusBadge><StatusBadge tone="info">Score {item.score}</StatusBadge><StatusBadge tone="neutral">{stageLabels[item.salesStage] || item.salesStage}</StatusBadge></div>
            <div className="mt-2 flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300"><Target className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" /><span><strong>{actionLabels[item.nextBestActionType] || item.nextBestActionType}:</strong> {item.nextBestAction}</span></div>
            {item.dueAt ? <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" />{item.overdueHours > 0 ? `${item.overdueHours} saat gecikmiş` : formatDateTime(item.dueAt)}</div> : null}
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-violet-300"><Flame className="h-4 w-4" />{item.rankScore} öncelik puanı<ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></div>
        </Link>)}
      </div> : <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-white/10">Bugün için AI tarafından önceliklendirilmiş açık satış aksiyonu yok.</div>}
    </SectionCard>
  );
}
