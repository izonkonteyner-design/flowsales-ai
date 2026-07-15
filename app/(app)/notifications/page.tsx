import { BellRing, CheckCheck, MailWarning, Sparkles, type LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/utils";
import { getNotifications } from "@/server/services/workspace-data";

export default function NotificationsPage() {
  const notifications = getNotifications();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Engagement"
        title="Notifications"
        description="Surface the most important customer and workspace events without noise."
        actions={
          <button className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950">
            <BellRing className="h-4 w-4" />
            Mark all read
          </button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <SectionCard title="Inbox" description="Unread alerts and helpful updates.">
          <div className="space-y-3">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-slate-950 dark:text-white">{notification.title}</p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{notification.detail}</p>
                  </div>
                  <StatusBadge tone={notification.level}>
                    {notification.read ? "Read" : "New"}
                  </StatusBadge>
                </div>
                <p className="mt-4 text-xs text-slate-500">{formatDateTime(notification.created_at)}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Delivery policy" description="Only the signals that drive revenue or service quality.">
          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
            <Item icon={CheckCheck} title="Sales updates" detail="High priority events and quote changes are surfaced first." />
            <Item icon={MailWarning} title="Follow-up alerts" detail="Leads without response are escalated before they stall." />
            <Item icon={Sparkles} title="AI summaries" detail="Model outputs are grouped separately from customer alerts." />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function Item({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-400" />
        <p className="font-medium text-slate-950 dark:text-white">{title}</p>
      </div>
      <p className="mt-1">{detail}</p>
    </div>
  );
}
