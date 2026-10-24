import { getWorkspaceContext } from "@/server/services/workspace-context";
import { getSalesFunnel } from "@/server/services/sales-operations-v5";

const LABELS: Record<string,string> = { new: "Yeni", contacted: "İletişim kuruldu", qualified: "Nitelikli", quote_sent: "Teklif gönderildi", negotiation: "Müzakere", won: "Kazanıldı" };

export default async function FunnelReportPage() {
  const context = await getWorkspaceContext();
  const funnel = context.mode === "live" ? await getSalesFunnel(context.organization.id) : { total: 0, stages: [] };
  const lowest = funnel.stages.slice(1).sort((a,b) => a.conversionFromPrevious - b.conversionFromPrevious)[0];
  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold text-slate-900 dark:text-white">Satış Hunisi</h1><p className="mt-2 text-slate-500 dark:text-slate-400">Lead → temas → nitelik → teklif → müzakere → kazanım dönüşüm oranları.</p></div>
    <div className="rounded-2xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-slate-900/80 p-5"><div className="text-sm text-slate-500 dark:text-slate-400">Toplam lead</div><div className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">{funnel.total}</div>{lowest && <p className="mt-2 text-sm text-amber-700">En zayıf geçiş: {LABELS[lowest.stage] || lowest.stage} · %{lowest.conversionFromPrevious}</p>}</div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{funnel.stages.map((stage) => <div key={stage.stage} className="rounded-2xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-slate-900/80 p-5 shadow-sm"><div className="text-sm text-slate-500 dark:text-slate-400">{LABELS[stage.stage] || stage.stage}</div><div className="mt-2 flex items-end justify-between"><span className="text-2xl font-bold text-slate-900 dark:text-white">{stage.count}</span><span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Geçiş %{stage.conversionFromPrevious}</span></div></div>)}</div>
  </div>;
}
