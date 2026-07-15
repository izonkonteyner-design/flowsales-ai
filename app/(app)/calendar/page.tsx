import { CalendarDays, Clock3, MapPin, type LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/utils";
import { getCalendarEvents } from "@/server/services/workspace-data";

export default function CalendarPage() {
  const events = getCalendarEvents();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Calendar"
        description="See calls, demos, delivery planning, and review meetings in one place."
        actions={
          <button className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950">
            <CalendarDays className="h-4 w-4" />
            Schedule event
          </button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <SectionCard title="Upcoming events" description="A focused schedule for the next two days.">
          <div className="space-y-3">
            {events.map((event) => (
              <div
                key={event.id}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-slate-950 dark:text-white">{event.title}</p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Owner: {event.owner}</p>
                  </div>
                  <StatusBadge tone={event.type === "call" ? "info" : event.type === "demo" ? "warning" : "neutral"}>
                    {event.type}
                  </StatusBadge>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-slate-600 dark:text-slate-400 sm:grid-cols-2">
                  <Info icon={Clock3} text={`${formatDateTime(event.starts_at)} to ${formatDateTime(event.ends_at)}`} />
                  <Info icon={MapPin} text={event.type === "delivery" ? "Site planning" : "Workspace calendar"} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Scheduling rules" description="Simple operating guardrails for the team.">
          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
            <Rule title="Mornings for calls" detail="Keep discovery calls before noon when possible." />
            <Rule title="Afternoons for demos" detail="Reserve demos for the second half of the day." />
            <Rule title="Delivery reviews" detail="Add a buffer before on-site work and shipping." />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function Info({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-slate-950/40">
      <Icon className="h-4 w-4 text-slate-400" />
      <span>{text}</span>
    </div>
  );
}

function Rule({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
      <p className="font-medium text-slate-950 dark:text-white">{title}</p>
      <p className="mt-1">{detail}</p>
    </div>
  );
}
