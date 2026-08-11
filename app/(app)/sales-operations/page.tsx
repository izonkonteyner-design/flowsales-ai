import Link from "next/link";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { getSalesOperationsOverview } from "@/server/services/sales-operations-v5";

function money(value: number) { return `${Math.round(value).toLocaleString("tr-TR")} TL`; }

export default async function SalesOperationsPage() {
  const context = await getWorkspaceContext();
  const overview = context.mode === "live" && context.userId
    ? await getSalesOperationsOverview(context.organization.id, context.userId, context.role)
    : { callbacks: [], quotes: { rows: [], buckets: { "0-2": 0, "3-7": 0, "8-14": 0, "15+": 0 } }, leakage: { totalAtRisk: 0, opportunities: [] }, funnel: { total: 0, stages: [] } };

  return <div className="space-y-6">
    <div>
      <h1 className="text-3xl font-bold text-slate-900">Satış Operasyon Merkezi</h1>
      <p className="mt-2 text-slate-500">Callback, teklif takibi, risk, gelir kaçağı ve satış hunisini tek ekranda yönetin.</p>
    </div>
    <div className="grid gap-4 md:grid-cols-4">
      <Metric title="Bekleyen callback" value={String(overview.callbacks.length)} />
      <Metric title="Takipte teklif" value={String(overview.quotes.rows.length)} />
      <Metric title="15+ günlük teklif" value={String(overview.quotes.buckets["15+"] || 0)} />
      <Metric title="Risk altındaki gelir" value={money(overview.leakage.totalAtRisk)} />
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between"><h2 className="font-semibold text-slate-900">Öncelikli callback</h2><Link className="text-sm font-medium text-blue-600" href="/sales-operations/callbacks">Tümünü aç</Link></div>
        <div className="mt-4 space-y-3">{overview.callbacks.slice(0,6).map((row) => <div key={row.id} className="rounded-xl border border-slate-100 p-3"><div className="font-medium text-slate-900">{Array.isArray(row.leads) ? row.leads[0]?.full_name || "Lead" : row.leads?.full_name || "Lead"}</div><div className="text-sm text-slate-500">{new Date(row.scheduled_for).toLocaleString("tr-TR")} · {row.reason || "Geri arama"}</div></div>)}{!overview.callbacks.length && <p className="text-sm text-slate-500">Bekleyen callback yok.</p>}</div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between"><h2 className="font-semibold text-slate-900">Gelir kaçağı</h2><Link className="text-sm font-medium text-blue-600" href="/reports/funnel">Huni raporu</Link></div>
        <div className="mt-4 space-y-3">{overview.leakage.opportunities.slice(0,6).map((row) => <Link key={row.leadId} href={`/leads/${row.leadId}`} className="block rounded-xl border border-slate-100 p-3"><div className="flex justify-between gap-3"><span className="font-medium text-slate-900">{row.name}</span><span className="text-sm font-semibold text-rose-600">Risk %{row.risk}</span></div><div className="text-sm text-slate-500">Riskte {money(row.atRiskValue)}</div></Link>)}{!overview.leakage.opportunities.length && <p className="text-sm text-slate-500">Kritik gelir kaçağı tespit edilmedi.</p>}</div>
      </section>
    </div>
    <div className="flex flex-wrap gap-3">
      <Link href="/sales-operations/sequences" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium">Takip dizileri</Link>
      <Link href="/sales-operations/automation" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium">Otomasyon onayları</Link>
      <Link href="/sales-analyst" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium">AI Satış Analisti</Link>
      <Link href="/command-center" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium">Komuta Merkezi</Link>
    </div>
  </div>;
}

function Metric({ title, value }: { title: string; value: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">{title}</div><div className="mt-2 text-2xl font-bold text-slate-900">{value}</div></div>; }