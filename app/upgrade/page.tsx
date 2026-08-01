import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const allowedPlans = new Set(["starter", "growth", "pro"]);

type SearchParams = Promise<{ plan?: string }>;

export const metadata = { title: "Upgrade | FlowSales AI" };

export default async function UpgradePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const plan = allowedPlans.has(params.plan ?? "") ? params.plan! : "growth";
  const client = await createSupabaseServerClient();
  if (!client) redirect(`/login?next=/upgrade?plan=${plan}`);
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect(`/login?next=/upgrade?plan=${plan}`);
  const { data: membership } = await client.from("organization_members").select("organization_id,role").eq("user_id", auth.user.id).limit(1).maybeSingle();
  if (!membership) redirect("/onboarding");
  const canManageBilling = ["owner", "admin"].includes(String(membership.role));

  return <main className="mx-auto max-w-2xl px-4 py-16"><section className="rounded-3xl border bg-white p-8 shadow-sm"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-700">Upgrade workspace</p><h1 className="mt-3 text-3xl font-bold">Selected plan: {plan}</h1>{canManageBilling ? <><p className="mt-4 text-slate-600">Your workspace is eligible to start checkout. Live checkout remains disabled until production billing price IDs are configured.</p><div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Billing provider configuration required: customer creation, price ID mapping and hosted checkout URL.</div></> : <p className="mt-4 text-red-700">Only workspace owners and administrators can manage billing.</p>}<div className="mt-8 flex gap-3"><Link href="/pricing" className="rounded-xl border px-4 py-3 font-semibold">Compare plans</Link><Link href="/usage" className="rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white">Review usage</Link></div></section></main>;
}
