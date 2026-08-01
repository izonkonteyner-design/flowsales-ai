import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { importLeadsAction } from "./actions";

type SearchParams = Promise<{ toast?: string; tone?: string }>;

export default async function ImportPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: memberships } = await client.from("organization_members").select("organization_id").eq("user_id", auth.user.id).limit(1);
  const organizationId = memberships?.[0]?.organization_id;
  if (!organizationId) redirect("/onboarding");

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Onboarding</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">Import leads from CSV</h1>
        <p className="mt-2 text-sm text-slate-600">Required column: full_name. Optional: email, phone, company, source, status. Maximum 5,000 rows.</p>
      </div>
      {params.toast ? <div className={`rounded-xl border px-4 py-3 text-sm ${params.tone === "danger" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{params.toast}</div> : null}
      <form action={importLeadsAction} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <input type="hidden" name="organizationId" value={organizationId} />
        <label className="block text-sm font-semibold text-slate-800" htmlFor="csv">CSV content</label>
        <textarea id="csv" name="csv" required rows={14} className="w-full rounded-xl border border-slate-300 p-3 font-mono text-sm" placeholder={'full_name,email,company\nJane Doe,jane@example.com,Acme'} />
        <button type="submit" className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Validate and import</button>
      </form>
    </main>
  );
}
