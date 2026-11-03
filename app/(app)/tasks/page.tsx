import { CheckCircle2, Circle, Plus } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDateTime } from "@/lib/utils";
import { canWriteSalesRecords } from "@/lib/workspace-roles";
import { listWorkspaceTasks } from "@/server/services/productivity";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { createTaskAction, setTaskStatusAction } from "./actions";

const DEMO_ORGANIZATION_ID = "d3e00000-0000-0000-0000-000000000000";

export default async function TasksPage() {
  const [workspace, tasks] = await Promise.all([getWorkspaceContext(), listWorkspaceTasks()]);
  const canWrite =
    workspace.mode === "live" &&
    workspace.organization.id !== DEMO_ORGANIZATION_ID &&
    canWriteSalesRecords(workspace.role);
  const openCount = tasks.filter((task) => task.status === "open").length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operasyonel Takip"
        title="Görevler & Hatırlatıcılar"
        description="Müşteri takipleri, teklif son tarihleri ve ekip sorumluluklarını yönetin."
      />

      <SectionCard
        title="Yeni Görev Oluştur"
        description="Görev oluşturun; kayıt çalışma alanınıza güvenli biçimde kaydedilir."
      >
        <form action={createTaskAction} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[1.8fr_1fr_0.8fr_auto] items-end">
          <label className="space-y-1 block">
            <span className="text-xs font-medium text-muted-foreground">Görev Tanımı</span>
            <Input
              name="title"
              required
              minLength={2}
              disabled={!canWrite}
              placeholder="Örn: Teklif sonrası müşteriyi ara ve geri bildirim al"
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-xs font-medium text-muted-foreground">Son Tarih / Saat</span>
            <Input name="due_at" type="datetime-local" required disabled={!canWrite} />
          </label>
          <label className="space-y-1 block">
            <span className="text-xs font-medium text-muted-foreground">Öncelik</span>
            <Select name="priority" defaultValue="medium" disabled={!canWrite}>
              <option value="low">Düşük</option>
              <option value="medium">Orta</option>
              <option value="high">Yüksek</option>
            </Select>
          </label>
          <button
            type="submit"
            disabled={!canWrite}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100 px-3 text-xs font-semibold shadow-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" /> Görev Ekle
          </button>
        </form>
      </SectionCard>

      <SectionCard
        title={`Görev Listesi (${openCount} Açık)`}
        description="Açık ve tamamlanan görevler son tarihe göre kronolojik olarak sıralanır."
      >
        {tasks.length === 0 ? (
          <EmptyState
            title="Henüz görev bulunmuyor"
            description="İlk operasyonel görevinizi yukarıdaki formdan oluşturabilirsiniz."
          />
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <article
                key={task.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 shadow-xs transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-2.5">
                  {task.status === "completed" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  )}
                  <div className="min-w-0">
                    <p
                      className={`text-xs sm:text-sm font-semibold ${
                        task.status === "completed"
                          ? "line-through text-muted-foreground"
                          : "text-foreground"
                      }`}
                    >
                      {task.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Son Tarih: {formatDateTime(task.due_at)} · Öncelik: {priorityLabel(task.priority)}
                    </p>
                  </div>
                </div>

                <form action={setTaskStatusAction} className="self-end sm:self-center shrink-0">
                  <input type="hidden" name="id" value={task.id} />
                  <input
                    type="hidden"
                    name="status"
                    value={task.status === "completed" ? "open" : "completed"}
                  />
                  <button
                    type="submit"
                    disabled={!canWrite}
                    className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {task.status === "completed" ? "Yeniden Aç" : "Tamamlandı Olarak İşaretle"}
                  </button>
                </form>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function priorityLabel(priority: string) {
  if (priority === "high") return "Yüksek";
  if (priority === "medium") return "Orta";
  return "Düşük";
}
