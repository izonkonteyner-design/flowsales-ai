import Link from "next/link";
import { AlertTriangle, ArrowUpRight, BarChart3, Flame, Gauge, Target } from "lucide-react";

import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatCurrency } from "@/lib/utils";
import { getPipelineIntelligence } from "@/server/services/sales-intelligence-v3";
import { loadWorkspaceContext } from "@/server/services/workspace-context";

const stageLabels: Record<string, string> = {
  new_lead: "Yeni lead",
  discovery: "İhtiyaç analizi",
  qualified: "Nitelikli",
  quote_ready: "Teklife hazır",
  quote_sent: "Teklif gönderildi",
  negotiation: "Pazarlık",
};

export async function PipelineIntelligence() {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) return null;

  let data;
  try { data = await getPipelineIntelligence({ organizationId: ctx.organization.id, userId: ctx.userId, userRole: ctx.role }); }
  catch { return null; }

  return <SectionCard title="Pipeline Intelligence" description="Açık fırsatların kalite, risk, öncelik ve tahmini değer dağılımını Conversation Intelligence verileriyle özetler.">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Metric icon={BarChart3} label="Açık fırsat" value={String(data.totalOpen)} />
      <Metric icon={Gauge} label="Ortalama Lead Score" value={String(data.weightedScore)} />
      <Metric icon={Flame} label="Yüksek öncelik" value={String(data.highPriorityCount)} />
      <Metric icon={AlertTriangle} label="Riskli fırsat" value={String(data.staleCount)} tone="risk" />
      <Metric icon={Target} label="Tahmini pipeline" value={formatCurrency(data.estimatedValue, "TRY")} />
    </div>

    {data.stages.length ? <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10">
      <div className="grid grid-cols-[1.2fr_.55fr_.65fr_.65fr_.8fr] gap-3 bg-slate-100 px-4 py-3 text-xs font-semibold text-slate-500 dark:bg-white/[0.04]">
        <span>Aşama</span><span>Fırsat</span><span>Ort. Score</span><span>Riskli</span><span className="text-right">Tahmini değer</span>
      </div>
      {data.stages.map((stage) => <div key={stage.stage} className="grid grid-cols-[1.2fr_.55fr_.65fr_.65fr_.8fr] gap-3 border-t border-slate-200 px-4 py-3 text-sm dark:border-white/10">
        <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-slate-950 dark:text-white">{stageLabels[stage.stage] || stage.stage}</span>{stage.highPriorityCount ? <StatusBadge tone="danger">{stage.highPriorityCount} yüksek</StatusBadge> : null}</div>
        <span className="text-slate-600 dark:text-slate-300">{stage.count}</span>
        <span className="font-semibold text-cyan-400">{stage.averageScore}</span>
        <span className={stage.staleCount ? "font-semibold text-rose-400" : "text-slate-500"}>{stage.staleCount}</span>
        <span className="text-right text-slate-600 dark:text-slate-300">{formatCurrency(stage.estimatedValue, "TRY")}</span>
      </div>)}
    </div> : <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-5 text-sm text-slate-500">Pipeline Intelligence için henüz yeterli açık Conversation Intelligence verisi yok.</div>}

    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-slate-500">Pipeline Intelligence yalnızca karar desteği sağlar; satış aşaması veya müşteri iletişimi otomatik değiştirilmez.</p>
      <div className="flex gap-2"><Link href="/opportunities/risk" className="inline-flex h-9 items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 text-xs font-semibold text-rose-300">Risk kuyruğu<ArrowUpRight className="h-3.5 w-3.5" /></Link><Link href="/follow-ups" className="inline-flex h-9 items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 text-xs font-semibold text-violet-300">Takip kuyruğu<ArrowUpRight className="h-3.5 w-3.5" /></Link></div>
    </div>
  </SectionCard>;
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof BarChart3; label: string; value: string; tone?: "risk" }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><Icon className={`h-4 w-4 ${tone === "risk" ? "text-rose-400" : "text-violet-300"}`} />{label}</div><p className={`mt-2 text-2xl font-semibold ${tone === "risk" ? "text-rose-300" : "text-white"}`}>{value}</p></div>;
}
