import Link from "next/link";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { operationalAlertsSchema, summarizeOperationalAlerts } from "@/server/services/operational-alerts";
import { resolveOperationalAlertAction } from "./actions";

export const metadata = { title: "Operations | FlowSales AI" };

const severityClass = {
  critical: "border-red-300 bg-red-50 text-red-900",
  high: "border-orange-300 bg-orange-50 text-orange-900",
  medium: "border-amber-200 bg-amber-50 text-amber-900",
  low: "border-slate-200 bg-slate-50 text-slate-800",
} as const;

export default async function OperationsPage() {
  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: membership } = await client.from("organization_members").select("organization_id,role").eq("user_id", auth.user.id).limit(1).maybeSingle();
  if (!membership) redirect("/onboarding");
  if (!["owner", "admin"].includes(String(membership.role))) redirect("/dashboard");

  const { data, error } = await client.rpc("get_operational_alerts", { p_organization_id: membership.organization_id });
  if (error) throw new Error(`Unable to load operational alerts: ${error.message}`);
  const alerts = operationalAlertsSchema.parse(data ?? []);
  const summary = summarizeOperationalAlerts(alerts);

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-700">Owner and admin only</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">Operations center</h1>
        <p className="mt-2 text-slate-600">Prioritized failures, pending requests, entitlement mismatches and stale approvals for this workspace.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-4">
        {[['Open alerts', summary.total], ['Critical', summary.critical], ['High', summary.high], ['Medium', summary.medium]].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-slate-950">{value}</p></div>
        ))}
      </section>

      <section className="space-y-4">
        {alerts.length === 0 ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-emerald-900">No unresolved operational alerts.</div> : alerts.map((alert) => (
          <article key={alert.key} className={`rounded-2xl border p-5 ${severityClass[alert.severity]}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border px-2 py-1 text-xs font-bold uppercase">{alert.severity}</span><span className="text-xs uppercase tracking-wide opacity-70">{alert.category.replaceAll('_', ' ')}</span></div>
                <h2 className="mt-3 text-lg font-bold">{alert.title}</h2>
                <p className="mt-1 text-sm">{alert.detail}</p>
                <p className="mt-2 text-xs opacity-70">{new Date(alert.occurredAt).toLocaleString()}</p>
              </div>
              <div className="flex min-w-56 flex-col gap-2">
                <Link href={alert.href} className="rounded-lg border bg-white/70 px-3 py-2 text-center text-sm font-semibold">Open source</Link>
                <form action={resolveOperationalAlertAction} className="space-y-2">
                  <input type="hidden" name="organizationId" value={membership.organization_id} />
                  <input type="hidden" name="alertKey" value={alert.key} />
                  <input name="note" maxLength={1000} placeholder="Resolution note (optional)" className="w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900" />
                  <button type="submit" className="w-full rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white">Mark resolved</button>
                </form>
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
