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

  const { data: memberships } = await client.from("organization_members").select("organization_id").eq("user_id", auth.user.id).limit(1);
  const workspaceId = memberships?.[0]?.organization_id;
  if (!workspaceId) redirect("/onboarding");

  const month = new Date().toISOString().slice(0, 7) + "-01";
  const [{ data: entitlement }, usage] = await Promise.all([
    client.from("organization_entitlements").select("plan_key, monthly_ai_run_limit").eq("organization_id", workspaceId).maybeSingle(),
    getMonthlyAiUsage(client, workspaceId, month),
  ]);

  const totals = usage.reduce((acc, row) => ({
    runs: acc.runs + row.runCount,
    input: acc.input + row.inputTokens,
    output: acc.output + row.outputTokens,
    cost: acc.cost + row.estimatedCostUsd,
  }), { runs: 0, input: 0, output: 0, cost: 0 });
  const limit = Number(entitlement?.monthly_ai_run_limit ?? 0);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-600 dark:text-violet-400">Commercial control</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">AI usage and estimated cost</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Monthly workspace usage, token volume and provider-cost estimate.</p>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          ["Runs", totals.runs],
          ["Input tokens", totals.input.toLocaleString()],
          ["Output tokens", totals.output.toLocaleString()],
          ["Estimated cost", `$${totals.cost.toFixed(4)}`],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
            <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
        <div className="flex justify-between text-sm font-medium text-slate-700 dark:text-slate-300">
          <span>{entitlement?.plan_key ?? "trial"} plan</span>
          <span>{totals.runs}/{limit || "—"} runs</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
          <div className="h-full bg-violet-600 transition-all duration-300 dark:bg-violet-400" style={{ width: `${usagePercent(totals.runs, limit)}%` }} />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/80">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-800/80 dark:text-slate-400">
            <tr>
              <th className="p-4 font-semibold">Capability</th>
              <th className="p-4 font-semibold">Runs</th>
              <th className="p-4 font-semibold">Tokens</th>
              <th className="p-4 font-semibold">Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-900 dark:divide-white/10 dark:text-slate-200">
            {usage.map((row) => (
              <tr key={row.capability} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                <td className="p-4 font-medium capitalize">{row.capability.replaceAll("_", " ")}</td>
                <td className="p-4">{row.runCount}</td>
                <td className="p-4">{(row.inputTokens + row.outputTokens).toLocaleString()}</td>
                <td className="p-4">${row.estimatedCostUsd.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
