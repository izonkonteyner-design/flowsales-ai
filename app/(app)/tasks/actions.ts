"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { taskFormSchema } from "@/lib/validations/task";
import { createWorkspaceTask, updateWorkspaceTaskStatus } from "@/server/services/productivity";

export async function createTaskAction(formData: FormData): Promise<void> {
  const parsed = taskFormSchema.safeParse({
    title: formData.get("title"),
    lead_id: formData.get("lead_id") || "",
    due_at: formData.get("due_at"),
    priority: formData.get("priority"),
    assigned_to: formData.get("assigned_to") || "",
  });

  if (!parsed.success) {
    redirect("/tasks?toast=Görev%20bilgilerini%20kontrol%20edin.&tone=danger");
  }

  let failureMessage: string | null = null;
  try {
    await createWorkspaceTask({
      title: parsed.data.title,
      dueAt: new Date(parsed.data.due_at).toISOString(),
      priority: parsed.data.priority,
      leadId: parsed.data.lead_id || null,
      assignedTo: parsed.data.assigned_to || null,
    });
  } catch (error) {
    failureMessage = error instanceof Error ? error.message : "Görev oluşturulamadı.";
  }

  if (failureMessage) {
    redirect(`/tasks?toast=${encodeURIComponent(failureMessage)}&tone=danger`);
  }

  revalidatePath("/tasks");
  redirect("/tasks?toast=Görev%20oluşturuldu.&tone=success");
}

export async function setTaskStatusAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") || "");
  const status = formData.get("status") === "completed" ? "completed" : "open";
  if (!id) return;
  await updateWorkspaceTaskStatus(id, status);
  revalidatePath("/tasks");
}
