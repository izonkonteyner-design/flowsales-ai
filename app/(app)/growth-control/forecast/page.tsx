import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { calculateForecastConfidence } from "@/server/services/sales-growth-v6";
import { snapshotPipelineAction } from "../actions";

function money(value: number) { return `${Math.round(value).toLocaleString("tr-TR")} TL`; }

export default async function ForecastPage() {
  const context = await getWorkspaceContext();
  const admin = createSupabaseAdminClient();
  const forecast = context.mode === "live" ? await calculateForecastConfidence(context.organization.id) : { openPipelineValue: 0, weightedPipelineValue: 0, forecastConfidence: 0, stageCounts: {}, count: 0 };
  const snapshots = context.mode === "live" ? (await admin.from("pipeline_snapshots").select("id,snapshot_date,open_pipeline_value,weighted_pipeline_value,forecast_confidence,stage_counts").eq("organization_id", context.organization.id).order("snapshot_date", { ascending: false }).limit(26)).data || [] : [];
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-bold text-slate-900">Forecast Güveni</h1><p className="mt-2 text-slate-500">Pipeline değeri, aşama ağırlığı, veri tazeliği ve planlı takip üzerinden güven skoru.</p></div>{context.mode === "live" && context.role !== "viewer" ? <form action={snapshotPipelineAction}><button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Bugünün snapshot&apos;ını al</button></form> : null}</div>
    <div className="grid gap-4 md:grid-cols-3"><Metric label="Açık pipeline" value={money(forecast.openPipelineValue)}/><Metric label="Ağırlıklı pipeline" value={money(forecast.weightedPipelineValue)}/><Metric label="Forecast güveni" value={`%${forecast.forecastConfidence}`}/></div>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-900">Snapshot geçmişi</h2><div className="mt-4 space-y-2">{snapshots.map((row) => <div key={row.id} className="grid gap-2 rounded-xl border border-slate-100 p-3 text-sm md:grid-cols-4"><span className="font-medium text-slate-900">{row.snapshot_date}</span><span className="text-slate-600">{money(Number(row.open_pipeline_value || 0))}</span><span className="text-slate-600">Ağırlıklı {money(Number(row.weighted_pipeline_value || 0))}</span><span className="font-semibold text-blue-600">Güven %{row.forecast_confidence}</span></div>)}{!snapshots.length && <p className="text-sm text-slate-500">Henüz pipeline snapshot&apos;ı bulunmuyor.</p>}</div></section>
  </div>;
}
function Metric({label,value}:{label:string;value:string}) { return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">{label}</div><div className="mt-1 text-2xl font-bold text-slate-900">{value}</div></div>; }