import Link from "next/link";
import { redirect } from "next/navigation";

import { markAllNotificationsReadAction, markNotificationReadAction } from "@/app/notifications/actions";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { RealtimeNotifications } from "@/components/notifications/realtime-notifications";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";

export default async function NotificationsPage() {
  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) redirect("/login");

  const { data, error } = await client.from("notifications").select("id,type,title,body,href,read_at,created_at").eq("user_id", auth.user.id).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(`Bildirimler yüklenemedi: ${error.message}`);
  const notifications = data ?? [];
  const unread = notifications.filter((item) => !item.read_at).length;

  return (
    <div className="space-y-6">
      <RealtimeNotifications userId={auth.user.id} />
      <PageHeader eyebrow="Etkileşim" title="Bildirimler" description={`Hesabınıza ait çalışma alanı, onay, görev ve YZ bildirimleri. ${unread} okunmamış bildirim var.`} actions={<form action={markAllNotificationsReadAction}><button className="inline-flex h-10 items-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-950">Tümünü okundu işaretle</button></form>} />
      <SectionCard title="Bildirim kutusu" description="Yeni bildirimler Supabase Realtime üzerinden ekrana otomatik yansır.">
        {notifications.length === 0 ? <div className="rounded-2xl border border-dashed border-white/[0.12] p-10 text-center text-sm text-slate-500">Henüz bildirim yok.</div> : <div className="space-y-3">{notifications.map((notification) => <article key={notification.id} className={`rounded-2xl border p-4 ${notification.read_at ? "border-white/[0.08] bg-white/[0.035]" : "border-violet-300/20 bg-violet-500/[0.08]"}`}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{notification.type}</p><h2 className="mt-1 font-semibold text-white">{notification.title}</h2><p className="mt-2 text-sm text-slate-400">{notification.body}</p><div className="mt-3 flex gap-3">{notification.href ? <Link href={notification.href} className="text-sm font-semibold text-violet-200 underline">Aç</Link> : null}{!notification.read_at ? <form action={markNotificationReadAction}><input type="hidden" name="notificationId" value={notification.id} /><button className="text-sm font-semibold text-slate-300 underline">Okundu işaretle</button></form> : null}</div></div><time className="text-xs text-slate-500">{formatDateTime(notification.created_at)}</time></div></article>)}</div>}
      </SectionCard>
    </div>
  );
}
