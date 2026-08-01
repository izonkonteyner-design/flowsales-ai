import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { markAllNotificationsReadAction, markNotificationReadAction } from "./actions";

export const metadata = { title: "Notifications | FlowSales AI" };

export default async function NotificationsPage() {
  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data, error } = await client.from("notifications").select("id,type,title,body,href,read_at,created_at").eq("user_id", auth.user.id).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(`Unable to load notifications: ${error.message}`);
  const notifications = data ?? [];

  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
    <div className="flex items-end justify-between"><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Workspace inbox</p><h1 className="mt-2 text-3xl font-bold">Notifications</h1></div><form action={markAllNotificationsReadAction}><button className="rounded-lg border px-3 py-2 text-sm font-semibold">Mark all read</button></form></div>
    {notifications.length === 0 ? <section className="rounded-2xl border border-dashed p-10 text-center text-slate-600">No notifications yet.</section> : <div className="space-y-3">{notifications.map(item => <article key={item.id} className={`rounded-2xl border p-5 ${item.read_at ? 'bg-white' : 'bg-violet-50'}`}><div className="flex gap-4 justify-between"><div><p className="text-xs font-semibold uppercase text-slate-500">{item.type}</p><h2 className="mt-1 font-semibold">{item.title}</h2><p className="mt-2 text-sm text-slate-600">{item.body}</p><div className="mt-3 flex gap-3">{item.href ? <Link className="text-sm font-semibold underline" href={item.href}>Open</Link> : null}{!item.read_at ? <form action={markNotificationReadAction}><input type="hidden" name="notificationId" value={item.id}/><button className="text-sm font-semibold underline">Mark read</button></form> : null}</div></div><time className="text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</time></div></article>)}</div>}
  </main>;
}
