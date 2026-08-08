"use server";

import { revalidatePath } from "next/cache";

import { taskFormSchema } from "@/lib/validations/task";
import { createWorkspaceTask, updateWorkspaceTaskStatus } from "@/server/services/productivity";

export async function createTaskAction(formData: FormData) {
  const parsed = taskFormSchema.safeParse({
    title: formData.get("title"),
    lead_id: formData.get("lead_id") || "",
    due_at: formData.get("due_at"),
    priority: formData.get("priority"),
    assigned_to: formData.get("assigned_to") || "",
  });
  if (!parsed.success) return { ok: false, message: "Görev bilgilerini kontrol edin." };
  try {
    await createWorkspaceTask({
      title: parsed.data.title,
      dueAt: new Date(parsed.data.due_at).toISOString(),
      priority: parsed.data.priority,
      leadId: parsed.data.lead_id || null,
      assignedTo: parsed.data.assigned_to || null,
    });
    revalidatePath("/tasks");
    return { ok: true, message: "Görev oluşturuldu." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Görev oluşturulamadı." };
  }
}

export async function setTaskStatusAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const status = formData.get("status") === "completed" ? "completed" : "open";
  if (!id) return;
  await updateWorkspaceTaskStatus(id, status);
  revalidatePath("/tasks");
}
