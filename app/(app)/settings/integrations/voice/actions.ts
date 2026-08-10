"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { saveTelnyxConnection } from "@/server/services/voice-provider-settings";

function text(formData: FormData, key: string) { const value = formData.get(key); return typeof value === "string" ? value.trim() : ""; }

export async function saveVoiceConnectionAction(formData: FormData) {
  try {
    await saveTelnyxConnection({
      phoneNumber: text(formData, "phoneNumber"),
      externalConnectionId: text(formData, "externalConnectionId") || null,
      transferDestination: text(formData, "transferDestination") || null,
      status: formData.get("connected") === "on" ? "connected" : "disconnected",
    });
  } catch (error) {
    redirect(`/settings/integrations/voice?toast=${encodeURIComponent(error instanceof Error ? error.message : "Voice bağlantısı kaydedilemedi")}&tone=danger`);
  }
  revalidatePath("/settings/integrations/voice");
  redirect("/settings/integrations/voice?toast=Voice%20bağlantısı%20kaydedildi&tone=success");
}
