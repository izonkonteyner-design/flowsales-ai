import Link from "next/link";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ImportMapper } from "./import-mapper";

type SearchParams = Promise<{ toast?: string; tone?: string; jobId?: string }>;

export default async function ImportPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: memberships } = await client.from("organization_members").select("organization_id").eq("user_id", auth.user.id).limit(1);
  const organizationId = memberships?.[0]?.organization_id;
  if (!organizationId) redirect("/onboarding");

  const { count: leadCount } = await client.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
  const { count: memberCount } = await client.from("organization_members").select("user_id", { count: "exact", head: true }).eq("organization_id", organizationId);
  const checklist = [
    { label: "Workspace created", complete: true, href: "/account" },
    { label: "Invite a teammate", complete: (memberCount ?? 0) > 1, href: "/account" },
    { label: "Import your first leads", complete: (leadCount ?? 0) > 0, href: "/onboarding/import" },
    { label: "Review the sales dashboard", complete: false, href: "/dashboard" },
  ];

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Guided onboarding</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">Bring your sales data into FlowSales AI</h1>
        <p className="mt-2 text-sm text-slate-600">Paste a CSV, confirm the suggested column matches, then import valid rows. Your original file is never stored by this flow.</p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <h2 className="font-semibold text-slate-950">Setup checklist</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {checklist.map((item) => (
            <Link key={item.label} href={item.href} className="flex items-center gap-3 rounded-xl border bg-white p-3 text-sm">
              <span aria-hidden className={`flex h-6 w-6 items-center justify-center rounded-full ${item.complete ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{item.complete ? "✓" : "○"}</span>
              <span className={item.complete ? "text-slate-500 line-through" : "font-medium text-slate-800"}>{item.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {params.toast ? (
        <div className={`rounded-xl border px-4 py-3 text-sm ${params.tone === "danger" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          <p>{params.toast}</p>
          {params.jobId ? <Link className="mt-2 inline-block font-semibold underline" href={`/onboarding/import/${params.jobId}/errors`}>Download rejected rows report</Link> : null}
        </div>
      ) : null}

      <ImportMapper organizationId={organizationId} />
    </main>
  );
}
