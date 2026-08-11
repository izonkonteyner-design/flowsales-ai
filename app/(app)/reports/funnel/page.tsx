import { getWorkspaceContext } from "@/server/services/workspace-context";
import { getSalesFunnel } from "@/server/services/sales-operations-v5";

const LABELS: Record<string,string> = { new: "Yeni", contacted: "İletişim kuruldu", qualified: "Nitelikli", quote_sent: "Teklif gönderildi", negotiation: "Müzakere", won: "Kazanıldı" };

export default async function FunnelReportPage() {
  const context = await getWorkspaceContext();
  const funnel = context.mode === "live" ? await getSalesFunnel(context.organization.id) : { total: 0, stages: [] };
  const lowest = funnel.stages.slice(1).sort((a,b) => a.conversionFromPrevious - b.conversionFromPrevious)[0];
  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold text-slate-900">Satış Hunisi</h1><p className="mt-2 text-slate-500">Lead → temas → nitelik → teklif → müzakere → kazanım dönüşüm oranları.</p></div>
    <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-sm text-slate-500">Toplam lead</div><div className="mt-1 text-3xl font-bold text-slate-900">{funnel.total}</div>{lowest && <p className="mt-2 text-sm text-amber-700">En zayıf geçiş: {LABELS[lowest.stage] || lowest.stage} · %{lowest.conversionFromPrevious}</p>}</div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{funnel.stages.map((stage) => <div key={stage.stage} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">{LABELS[stage.stage] || stage.stage}</div><div className="mt-2 flex items-end justify-between"><span className="text-2xl font-bold text-slate-900">{stage.count}</span><span className="text-sm font-semibold text-slate-600">Geçiş %{stage.conversionFromPrevious}</span></div></div>)}</div>
  </div>;
}
