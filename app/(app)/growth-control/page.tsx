import Link from "next/link";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { getGrowthControlCenter } from "@/server/services/sales-growth-v6";

function money(value: number) { return `${Math.round(value).toLocaleString("tr-TR")} TL`; }

type GrowthRow = {
  id: string;
  opportunity_type: string;
  score: number;
  reason: string;
};

export default async function GrowthControlPage() {
  const context = await getWorkspaceContext();
  const data = context.mode === "live" ? await getGrowthControlCenter(context.organization.id) : {
    sla: [],
    workload: [],
    duplicates: [],
    hygiene: { total: 0, needsAttention: 0, rows: [] },
    growth: [] as GrowthRow[],
    forecast: { openPipelineValue: 0, weightedPipelineValue: 0, forecastConfidence: 0, stageCounts: {}, count: 0 },
  };
  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold text-slate-900">Büyüme Kontrol Merkezi</h1><p className="mt-2 text-slate-500">SLA, ekip yükü, veri kalitesi, büyüme fırsatları ve tahmin güvenini tek yerde izleyin.</p></div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <Metric label="SLA ihlali" value={String(data.sla.length)} />
      <Metric label="Duplicate grup" value={String(data.duplicates.length)} />
      <Metric label="Veri kalitesi" value={`${data.hygiene.needsAttention}/${data.hygiene.total}`} />
      <Metric label="Büyüme fırsatı" value={String(data.growth.length)} />
      <Metric label="Tahmin güveni" value={`%${data.forecast.forecastConfidence}`} />
    </div>
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="SLA alarmı">{data.sla.slice(0,8).map((row) => <Link key={`${row.leadId}-${row.breachType}`} href={`/leads/${row.leadId}`} className="block rounded-xl border border-slate-100 p-3"><div className="flex justify-between"><span className="font-medium text-slate-900">{row.name}</span><span className="text-sm font-semibold text-rose-600">+{row.overdueMinutes} dk</span></div><div className="text-sm text-slate-500">{row.policy} · {row.breachType}</div></Link>)}{!data.sla.length && <Empty text="SLA ihlali yok."/>}</Panel>
      <Panel title="Ekip iş yükü">{data.workload.slice(0,8).map((row) => <div key={row.userId} className="rounded-xl border border-slate-100 p-3"><div className="flex justify-between"><span className="font-medium text-slate-900">{row.userId === "unassigned" ? "Atanmamış" : row.userId}</span><span className="text-sm font-semibold text-slate-700">Yük {row.score}</span></div><div className="text-sm text-slate-500">{row.open} açık · {row.advanced} ileri aşama · {row.overdue} gecikmiş · {money(row.value)}</div></div>)}{!data.workload.length && <Empty text="Aktif iş yükü yok."/>}</Panel>
      <Panel title="Büyüme fırsatları">{data.growth.slice(0,8).map((row) => <div key={row.id} className="rounded-xl border border-slate-100 p-3"><div className="flex justify-between"><span className="font-medium capitalize text-slate-900">{row.opportunity_type}</span><span className="text-sm font-semibold text-emerald-600">Skor {row.score}</span></div><div className="text-sm text-slate-500">{row.reason}</div></div>)}{!data.growth.length && <Empty text="Yeni büyüme fırsatı yok."/>}</Panel>
      <Panel title="Pipeline tahmini"><div className="grid gap-3 sm:grid-cols-3"><Metric label="Açık pipeline" value={money(data.forecast.openPipelineValue)} /><Metric label="Ağırlıklı" value={money(data.forecast.weightedPipelineValue)} /><Metric label="Güven" value={`%${data.forecast.forecastConfidence}`} /></div><div className="mt-4"><Link href="/growth-control/data-quality" className="text-sm font-medium text-blue-600">Veri kalite raporunu aç →</Link></div></Panel>
    </div>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-xl font-bold text-slate-900">{value}</div></div>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-4 font-semibold text-slate-900">{title}</h2><div className="space-y-3">{children}</div></section>; }
function Empty({ text }: { text: string }) { return <p className="text-sm text-slate-500">{text}</p>; }