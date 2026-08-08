import { CheckCircle2, Circle, Plus } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDateTime } from "@/lib/utils";
import { listWorkspaceTasks } from "@/server/services/productivity";
import { createTaskAction, setTaskStatusAction } from "./actions";

export default async function TasksPage() {
  const tasks = await listWorkspaceTasks();
  const openCount = tasks.filter((task) => task.status === "open").length;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Operasyonlar" title="Görevler" description="Takipleri, son tarihleri ve sorumlulukları gerçek çalışma alanı verisiyle yönetin." />

      <SectionCard title="Yeni görev" description="Görevi oluşturun; kayıt çalışma alanınıza güvenli biçimde yazılır.">
        <form action={createTaskAction} className="grid gap-3 lg:grid-cols-[1.5fr_1fr_0.8fr_auto]">
          <Input name="title" required minLength={2} placeholder="Örn. Teklif sonrası müşteriyi ara" />
          <Input name="due_at" type="datetime-local" required />
          <Select name="priority" defaultValue="medium">
            <option value="low">Düşük</option>
            <option value="medium">Orta</option>
            <option value="high">Yüksek</option>
          </Select>
          <button type="submit" className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-semibold text-slate-950"><Plus className="h-4 w-4" /> Görev oluştur</button>
        </form>
      </SectionCard>

      <SectionCard title={`Görev panosu · ${openCount} açık`} description="Açık ve tamamlanan görevler son tarihe göre sıralanır.">
        {tasks.length === 0 ? <EmptyState title="Henüz görev yok" description="İlk görevinizi yukarıdaki formdan oluşturabilirsiniz." /> : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <article key={task.id} className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  {task.status === "completed" ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />}
                  <div className="min-w-0"><p className={`font-medium ${task.status === "completed" ? "text-slate-500 line-through" : "text-white"}`}>{task.title}</p><p className="mt-1 text-sm text-slate-500">Son tarih: {formatDateTime(task.due_at)} · Öncelik: {priorityLabel(task.priority)}</p></div>
                </div>
                <form action={setTaskStatusAction}>
                  <input type="hidden" name="id" value={task.id} />
                  <input type="hidden" name="status" value={task.status === "completed" ? "open" : "completed"} />
                  <button type="submit" className="rounded-xl border border-white/[0.1] px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.06]">{task.status === "completed" ? "Yeniden aç" : "Tamamla"}</button>
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
  if (priority === "low") return "Düşük";
  return "Orta";
}
