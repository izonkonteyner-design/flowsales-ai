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
      <PageHeader
        eyebrow="Etkileşim"
        title="Bildirimler"
        description={`Hesabınıza ait çalışma alanı, onay, görev ve YZ bildirimleri. ${unread} okunmamış bildirim var.`}
        actions={
          <form action={markAllNotificationsReadAction}>
            <button className="inline-flex h-10 items-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100">
              Tümünü okundu işaretle
            </button>
          </form>
        }
      />
      <SectionCard title="Bildirim kutusu" description="Yeni bildirimler Supabase Realtime üzerinden ekrana otomatik yansır.">
        {notifications.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-white/[0.12] dark:text-slate-400">
            Henüz bildirim yok.
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <article
                key={notification.id}
                className={`rounded-2xl border p-4 transition ${
                  notification.read_at
                    ? "border-slate-200/80 bg-slate-50/50 dark:border-white/[0.08] dark:bg-white/[0.035]"
                    : "border-violet-300/50 bg-violet-50/60 dark:border-violet-300/20 dark:bg-violet-500/[0.08]"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{notification.type}</p>
                    <h2 className="mt-1 font-semibold text-slate-900 dark:text-white">{notification.title}</h2>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{notification.body}</p>
                    <div className="mt-3 flex gap-3">
                      {notification.href ? (
                        <Link href={notification.href} className="text-sm font-semibold text-violet-600 underline hover:text-violet-700 dark:text-violet-300 dark:hover:text-violet-200">
                          Aç
                        </Link>
                      ) : null}
                      {!notification.read_at ? (
                        <form action={markNotificationReadAction}>
                          <input type="hidden" name="notificationId" value={notification.id} />
                          <button className="text-sm font-semibold text-slate-700 underline hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
                            Okundu işaretle
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                  <time className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(notification.created_at)}</time>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
