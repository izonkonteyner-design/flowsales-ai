import Link from "next/link";
import { redirect } from "next/navigation";

import { markAllNotificationsReadAction, markNotificationReadAction } from "@/app/notifications/actions";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function NotificationsPage() {
  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");

  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) redirect("/login");

  const { data, error } = await client
    .from("notifications")
    .select("id,type,title,body,href,read_at,created_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(`Unable to load notifications: ${error.message}`);
  const notifications = data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Engagement"
        title="Notifications"
        description="Workspace alerts, approvals and AI updates scoped to your account."
        actions={
          <form action={markAllNotificationsReadAction}>
            <button className="inline-flex h-10 items-center rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950">
              Mark all read
            </button>
          </form>
        }
      />

      <SectionCard title="Inbox" description="The latest notifications for your signed-in user.">
        {notifications.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-600">
            No notifications yet.
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <article
                key={notification.id}
                className={`rounded-2xl border p-4 ${notification.read_at ? "border-slate-200 bg-white dark:border-white/10 dark:bg-white/5" : "border-violet-200 bg-violet-50 dark:border-violet-500/30 dark:bg-violet-500/10"}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{notification.type}</p>
                    <h2 className="mt-1 font-semibold text-slate-950 dark:text-white">{notification.title}</h2>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{notification.body}</p>
                    <div className="mt-3 flex gap-3">
                      {notification.href ? <Link href={notification.href} className="text-sm font-semibold underline">Open</Link> : null}
                      {!notification.read_at ? (
                        <form action={markNotificationReadAction}>
                          <input type="hidden" name="notificationId" value={notification.id} />
                          <button className="text-sm font-semibold underline">Mark read</button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                  <time className="text-xs text-slate-500">{new Date(notification.created_at).toLocaleString()}</time>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
