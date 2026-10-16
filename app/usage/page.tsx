import { getWorkspacePlan } from "@/server/services/workspace-plan";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMonthlyAiUsage } from "@/server/repositories/supabase/commercial-ai-usage";
import { usagePercent } from "@/server/services/commercial-ai-usage";

export const metadata = { title: "AI Usage | FlowSales AI" };

export default async function UsagePage() {
  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");

  const planState = await getWorkspacePlan();
  const workspaceId = planState.workspace.organization.id;
  const month = new Date().toISOString().slice(0, 7) + "-01";
  const usage = await getMonthlyAiUsage(client, workspaceId, month);
  const entitlement = { plan_key: planState.planKey, monthly_ai_run_limit: planState.monthlyAiRunLimit };

  const totals = usage.reduce((acc, row) => ({
    runs: acc.runs + row.runCount,
    input: acc.input + row.inputTokens,
    output: acc.output + row.outputTokens,
    cost: acc.cost + row.estimatedCostUsd,
  }), { runs: 0, input: 0, output: 0, cost: 0 });
  const limit = Number(entitlement?.monthly_ai_run_limit ?? 0);

  return <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
    <div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Commercial control</p><h1 className="mt-2 text-3xl font-bold">AI usage and estimated cost</h1><p className="mt-2 text-slate-600">Monthly workspace usage, token volume and provider-cost estimate.</p></div>
    <section className="grid gap-4 md:grid-cols-4">
      {[['Runs', totals.runs], ['Input tokens', totals.input.toLocaleString()], ['Output tokens', totals.output.toLocaleString()], ['Estimated cost', `$${totals.cost.toFixed(4)}`]].map(([label,value]) => <div key={String(label)} className="rounded-2xl border bg-white p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}
    </section>
    <section className="rounded-2xl border bg-white p-5"><div className="flex justify-between text-sm"><span>{entitlement?.plan_key ?? 'trial'} plan</span><span>{totals.runs}/{planState.monthlyAiRunLimit ?? 'Yapılandırılmadı'} runs</span></div><div className="mt-3 h-2 overflow-hidden rounded bg-slate-100"><div className="h-full bg-slate-900" style={{ width: `${usagePercent(totals.runs, limit)}%` }} /></div></section>
    <section className="overflow-hidden rounded-2xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-50 text-left"><tr><th className="p-4">Capability</th><th className="p-4">Runs</th><th className="p-4">Tokens</th><th className="p-4">Cost</th></tr></thead><tbody>{usage.map(row => <tr key={row.capability} className="border-t"><td className="p-4 font-medium">{row.capability.replaceAll('_',' ')}</td><td className="p-4">{row.runCount}</td><td className="p-4">{(row.inputTokens + row.outputTokens).toLocaleString()}</td><td className="p-4">${row.estimatedCostUsd.toFixed(4)}</td></tr>)}</tbody></table></section>
  </div>;
}
