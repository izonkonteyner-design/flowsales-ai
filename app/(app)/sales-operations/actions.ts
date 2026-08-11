"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { completeCallback, createFollowUpSequence, enrollLeadInSequence, enqueueCallback } from "@/server/services/sales-operations-v5";

function requireWritable(context: Awaited<ReturnType<typeof getWorkspaceContext>>) {
  if (context.mode !== "live" || !context.userId) throw new Error("Bu işlem yalnızca canlı çalışma alanında kullanılabilir.");
  if (context.role === "viewer") throw new Error("Salt okunur erişim.");
  return context;
}

export async function createCallbackAction(formData: FormData) {
  const context = requireWritable(await getWorkspaceContext());
  const leadId = String(formData.get("leadId") || "");
  const scheduledFor = String(formData.get("scheduledFor") || "");
  if (!leadId || !scheduledFor) throw new Error("Lead ve tarih zorunludur.");
  await enqueueCallback({ organizationId: context.organization.id, leadId, scheduledFor: new Date(scheduledFor).toISOString(), userId: context.userId!, reason: String(formData.get("reason") || "Geri arama") });
  revalidatePath("/sales-operations"); revalidatePath("/sales-operations/callbacks");
}

export async function completeCallbackAction(formData: FormData) {
  const context = requireWritable(await getWorkspaceContext());
  await completeCallback({ organizationId: context.organization.id, callbackId: String(formData.get("callbackId") || ""), outcome: String(formData.get("outcome") || "Tamamlandı") });
  revalidatePath("/sales-operations"); revalidatePath("/sales-operations/callbacks");
}

export async function createSequenceAction(formData: FormData) {
  const context = requireWritable(await getWorkspaceContext());
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Dizi adı zorunludur.");
  await createFollowUpSequence({ organizationId: context.organization.id, userId: context.userId!, name, description: String(formData.get("description") || ""), steps: [
    { delayHours: 0, actionType: "task", instruction: "Lead durumunu kontrol et ve ilk kişisel takibi hazırla." },
    { delayHours: 24, actionType: "reply_draft", instruction: "Yanıt yoksa CRM gerçeklerine dayalı kısa takip mesajı taslağı hazırla." },
    { delayHours: 72, actionType: "call", instruction: "Yanıt yoksa satışçı araması için görev oluştur." },
  ] });
  revalidatePath("/sales-operations/sequences");
}

export async function enrollSequenceAction(formData: FormData) {
  const context = requireWritable(await getWorkspaceContext());
  await enrollLeadInSequence({ organizationId: context.organization.id, userId: context.userId!, templateId: String(formData.get("templateId") || ""), leadId: String(formData.get("leadId") || "") });
  revalidatePath("/sales-operations/sequences");
}
