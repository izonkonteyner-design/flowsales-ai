"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { saveCallForwardingProfile } from "@/server/services/voice-provider-settings";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function saveVoiceConnectionAction(formData: FormData) {
  try {
    await saveCallForwardingProfile({
      publicNumber: text(formData, "publicNumber"),
      carrier: text(formData, "carrier") === "turkcell" ? "turkcell" : "other",
      destinationNumber: text(formData, "destinationNumber"),
      destinationProvider: text(formData, "destinationProvider") === "netgsm" ? "netgsm" : "other",
      transferDestination: text(formData, "transferDestination") || null,
      status: formData.get("connected") === "on" ? "connected" : "disconnected",
    });
  } catch (error) {
    redirect(`/settings/integrations/voice?toast=${encodeURIComponent(error instanceof Error ? error.message : "Telefon yönlendirme kaydı kaydedilemedi")}&tone=danger`);
  }
  revalidatePath("/settings/integrations/voice");
  redirect("/settings/integrations/voice?toast=Telefon%20yönlendirme%20kaydı%20kaydedildi&tone=success");
}
