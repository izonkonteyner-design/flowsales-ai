import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAccountLifecycleRequestAction } from "./actions";

export const metadata = { title: "Data and account | FlowSales AI" };

export default async function AccountDataPage() {
  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: memberships } = await client.from("organization_members").select("organization_id,role").eq("user_id", auth.user.id).limit(1);
  const membership = memberships?.[0];
  if (!membership) redirect("/onboarding");
  const { data: requests, error } = await client.from("account_lifecycle_requests").select("id,request_type,status,reason,requested_at,completed_at").eq("organization_id", membership.organization_id).order("requested_at", { ascending: false }).limit(50);
  if (error) throw new Error(`Unable to load lifecycle requests: ${error.message}`);

  return <main className="mx-auto max-w-4xl space-y-8 px-4 py-10"><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Account controls</p><h1 className="mt-2 text-3xl font-bold">Data export and deletion</h1><p className="mt-2 text-slate-600">Create auditable requests instead of performing irreversible deletion directly from the browser.</p></div><section className="grid gap-5 md:grid-cols-3">{[
    ['export','Request data export','Prepare a workspace data export.'],
    ['delete_workspace','Delete workspace','Owner/admin review required.'],
    ['delete_account','Delete account','Request removal of your account.'],
  ].map(([type,title,body]) => <form key={type} action={createAccountLifecycleRequestAction} className="rounded-2xl border bg-white p-5"><input type="hidden" name="requestType" value={type}/><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm text-slate-600">{body}</p><textarea name="reason" maxLength={1000} rows={3} className="mt-4 w-full rounded-lg border p-2 text-sm" placeholder="Optional reason"/><button className={`mt-3 w-full rounded-lg px-3 py-2 text-sm font-semibold text-white ${type === 'export' ? 'bg-slate-950' : 'bg-red-700'}`}>Create request</button></form>)}</section><section className="rounded-2xl border bg-white"><div className="border-b p-5"><h2 className="font-semibold">Request history</h2></div><div className="divide-y">{(requests ?? []).length === 0 ? <p className="p-5 text-sm text-slate-600">No lifecycle requests.</p> : requests!.map(item => <div key={item.id} className="flex items-start justify-between gap-4 p-5"><div><p className="font-medium">{item.request_type.replaceAll('_',' ')}</p><p className="mt-1 text-sm text-slate-600">{item.reason || 'No reason provided'}</p></div><div className="text-right"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{item.status}</span><p className="mt-2 text-xs text-slate-500">{new Date(item.requested_at).toLocaleString()}</p></div></div>)}</div></section></main>;
}
