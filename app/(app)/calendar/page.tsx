import { CalendarDays, Clock3, MapPin } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDateTime } from "@/lib/utils";
import { canWriteSalesRecords } from "@/lib/workspace-roles";
import { listCalendarEvents } from "@/server/services/productivity";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { createCalendarEventAction } from "./actions";

const DEMO_ORGANIZATION_ID = "d3e00000-0000-0000-0000-000000000000";

export default async function CalendarPage() {
  const [workspace, events] = await Promise.all([getWorkspaceContext(), listCalendarEvents()]);
  const canWrite =
    workspace.mode === "live" &&
    workspace.organization.id !== DEMO_ORGANIZATION_ID &&
    canWriteSalesRecords(workspace.role);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Operasyonlar" title="Takvim" description="Arama, demo, toplantı, teslimat ve takip planlarını çalışma alanı takviminde yönetin." />

      <SectionCard title="Etkinlik planla" description="Takvim kaydı ekip ve CRM çalışma alanına bağlı tutulur.">
        <form action={createCalendarEventAction} className="grid gap-3 xl:grid-cols-6">
          <Input name="title" required minLength={2} disabled={!canWrite} placeholder="Etkinlik başlığı" className="xl:col-span-2" />
          <Input name="starts_at" type="datetime-local" required disabled={!canWrite} />
          <Input name="ends_at" type="datetime-local" required disabled={!canWrite} />
          <Select name="event_type" defaultValue="meeting" disabled={!canWrite}>
            <option value="call">Arama</option><option value="demo">Demo</option><option value="meeting">Toplantı</option><option value="delivery">Teslimat</option><option value="follow_up">Takip</option><option value="other">Diğer</option>
          </Select>
          <button
            type="submit"
            disabled={!canWrite}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
          >
            <CalendarDays className="h-4 w-4" /> Kaydet
          </button>
          <Input name="location" disabled={!canWrite} placeholder="Konum / görüşme bağlantısı (opsiyonel)" className="xl:col-span-6" />
        </form>
      </SectionCard>

      <SectionCard title="Yaklaşan etkinlikler" description="Dün ve sonrasındaki planlar başlangıç zamanına göre sıralanır.">
        {events.length === 0 ? <EmptyState title="Planlanmış etkinlik yok" description="İlk etkinliği yukarıdaki formdan oluşturabilirsiniz." /> : (
          <div className="grid gap-4 lg:grid-cols-2">
            {events.map((event) => (
              <article key={event.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 transition dark:border-white/[0.08] dark:bg-white/[0.035]">
                <div className="flex items-start justify-between gap-4"><div><p className="font-medium text-slate-900 dark:text-white">{event.title}</p><p className="mt-1 text-xs uppercase tracking-wide text-violet-300">{eventTypeLabel(event.event_type)}</p></div><CalendarDays className="h-5 w-5 text-slate-500" /></div>
                <div className="mt-4 space-y-2 text-sm text-slate-400"><p className="flex items-center gap-2"><Clock3 className="h-4 w-4" />{formatDateTime(event.starts_at)} — {formatDateTime(event.ends_at)}</p>{event.location ? <p className="flex items-center gap-2"><MapPin className="h-4 w-4" />{event.location}</p> : null}</div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function eventTypeLabel(value: string) {
  return ({ call: "Arama", demo: "Demo", meeting: "Toplantı", delivery: "Teslimat", follow_up: "Takip", other: "Diğer" } as Record<string, string>)[value] ?? value;
}
