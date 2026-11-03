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
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operasyonel Takvim"
        title="Takvim & Randevular"
        description="Görüşme, demo, saha ziyareti, toplantı ve teslimat planlarını yönetin."
      />

      <SectionCard
        title="Yeni Etkinlik Planla"
        description="Planlanan randevu tüm ekip takvimine işlenir."
      >
        <form action={createCalendarEventAction} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-6 items-end">
          <label className="space-y-1 block sm:col-span-2">
            <span className="text-xs font-medium text-muted-foreground">Etkinlik Başlığı</span>
            <Input
              name="title"
              required
              minLength={2}
              disabled={!canWrite}
              placeholder="Örn: Konteyner Teslimatı Ön Görüşmesi"
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-xs font-medium text-muted-foreground">Başlangıç</span>
            <Input name="starts_at" type="datetime-local" required disabled={!canWrite} />
          </label>
          <label className="space-y-1 block">
            <span className="text-xs font-medium text-muted-foreground">Bitiş</span>
            <Input name="ends_at" type="datetime-local" required disabled={!canWrite} />
          </label>
          <label className="space-y-1 block">
            <span className="text-xs font-medium text-muted-foreground">Etkinlik Türü</span>
            <Select name="event_type" defaultValue="meeting" disabled={!canWrite}>
              <option value="call">Arama</option>
              <option value="demo">Demo / Sunum</option>
              <option value="meeting">Toplantı</option>
              <option value="delivery">Teslimat</option>
              <option value="follow_up">Takip</option>
              <option value="other">Diğer</option>
            </Select>
          </label>
          <button
            type="submit"
            disabled={!canWrite}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100 px-3 text-xs font-semibold shadow-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CalendarDays className="h-3.5 w-3.5" /> Etkinliği Kaydet
          </button>
          <label className="space-y-1 block sm:col-span-2 lg:col-span-6">
            <span className="text-xs font-medium text-muted-foreground">Konum / Toplantı Bağlantısı (Opsiyonel)</span>
            <Input
              name="location"
              disabled={!canWrite}
              placeholder="Ofis, fabrika sahası veya video toplantı linki..."
            />
          </label>
        </form>
      </SectionCard>

      <SectionCard
        title="Yaklaşan Etkinlikler"
        description="Yaklaşan tüm randevu ve randevu programı başlangıç zamanına göre listelenir."
      >
        {events.length === 0 ? (
          <EmptyState
            title="Planlanmış etkinlik bulunmuyor"
            description="İlk toplantı veya arama planınızı yukarıdaki formdan kaydedebilirsiniz."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <article
                key={event.id}
                className="rounded-lg border border-border bg-card p-3.5 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-xs sm:text-sm text-foreground truncate">{event.title}</p>
                    <span className="mt-0.5 inline-block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {eventTypeLabel(event.event_type)}
                    </span>
                  </div>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-xs text-muted-foreground border-t border-border pt-2">
                  <p className="flex items-center gap-1.5">
                    <Clock3 className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {formatDateTime(event.starts_at)} — {formatDateTime(event.ends_at)}
                    </span>
                  </p>
                  {event.location ? (
                    <p className="flex items-center gap-1.5 truncate">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{event.location}</span>
                    </p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function eventTypeLabel(value: string) {
  return (
    ({
      call: "Arama",
      demo: "Demo",
      meeting: "Toplantı",
      delivery: "Teslimat",
      follow_up: "Takip",
      other: "Diğer",
    } as Record<string, string>)[value] ?? value
  );
}
