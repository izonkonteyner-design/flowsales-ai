import Link from "next/link";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { detectGrowthOpportunities } from "@/server/services/sales-growth-v6";

export default async function GrowthOpportunitiesPage() {
  const context = await getWorkspaceContext();
  const rows = context.mode === "live" ? await detectGrowthOpportunities(context.organization.id) : [];
  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold text-slate-900 dark:text-white">Büyüme Fırsatları</h1><p className="mt-2 text-slate-500 dark:text-slate-400">Reaktivasyon, müşteri genişletme ve referans adaylarını skorla önceliklendirin.</p></div>
    <div className="space-y-3">{rows.map((row) => {
      const href = row.lead_id ? `/leads/${row.lead_id}` : row.customer_id ? `/customers/${row.customer_id}` : "/customers";
      return <Link href={href} key={row.id} className="block rounded-2xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-slate-900/80 p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-semibold uppercase tracking-wide text-blue-600">{row.opportunity_type}</div><div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{row.reason}</div></div><div className="text-right"><div className="text-lg font-bold text-slate-900 dark:text-white">{row.score}/100</div><div className="text-xs text-slate-500 dark:text-slate-400">{Number(row.estimated_value || 0).toLocaleString("tr-TR")} TL potansiyel</div></div></div></Link>;
    })}{!rows.length && <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:text-slate-400">Açık büyüme fırsatı bulunmuyor.</div>}</div>
  </div>;
}