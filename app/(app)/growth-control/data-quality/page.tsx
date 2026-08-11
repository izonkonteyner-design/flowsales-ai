import Link from "next/link";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { getDataHygieneReport } from "@/server/services/sales-growth-v6";

export default async function DataQualityPage() {
  const context = await getWorkspaceContext();
  const report = context.mode === "live" ? await getDataHygieneReport(context.organization.id) : { total: 0, needsAttention: 0, rows: [] };
  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold text-slate-900">Lead Veri Kalitesi</h1><p className="mt-2 text-slate-500">Eksik alanları ve uzun süredir güncellenmeyen kayıtları önceliklendirin.</p></div>
    <div className="grid gap-4 md:grid-cols-2"><Metric label="Toplam lead" value={String(report.total)}/><Metric label="İlgi gerektiren" value={String(report.needsAttention)}/></div>
    <div className="space-y-3">{report.rows.map((row) => <Link key={row.leadId} href={`/leads/${row.leadId}`} className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-slate-900">{row.name}</span><span className="text-sm font-semibold text-slate-700">Tamlık %{row.score}</span></div><div className="mt-1 text-sm text-slate-500">Eksik: {(row.missing as string[]).join(", ") || "yok"} · Son güncelleme {row.staleDays} gün önce</div></Link>)}{!report.rows.length && <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Veri kalite problemi görünmüyor.</div>}</div>
  </div>;
}
function Metric({label,value}:{label:string;value:string}) { return <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-sm text-slate-500">{label}</div><div className="mt-1 text-2xl font-bold text-slate-900">{value}</div></div>; }
