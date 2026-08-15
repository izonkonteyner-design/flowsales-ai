"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { saveCallForwardingProfile } from "@/server/services/voice-provider-settings";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function voiceSettingsRedirect(toast: string, tone: "success" | "danger") {
  const params = new URLSearchParams({ toast, tone });
  redirect(`/settings/integrations/voice?${params.toString()}`);
}

export async function saveVoiceConnectionAction(formData: FormData) {
  try {
    await saveCallForwardingProfile({
      publicNumber: text(formData, "publicNumber"),
      carrier: text(formData, "carrier") === "turkcell" ? "turkcell" : "other",
      destinationNumber: text(formData, "destinationNumber"),
      destinationProvider: (["netgsm", "telnyx", "sip"] as const).find((provider) => provider === text(formData, "destinationProvider")) || "other",
      transferDestination: text(formData, "transferDestination") || null,
      status: formData.get("connected") === "on" ? "connected" : "disconnected",
    });
  } catch (error) {
    // Preserve Next.js control-flow exceptions if a nested service/action ever redirects.
    unstable_rethrow(error);
    voiceSettingsRedirect(
      error instanceof Error ? error.message : "Telefon yönlendirme kaydı kaydedilemedi",
      "danger",
    );
  }
  revalidatePath("/settings/integrations/voice");
  voiceSettingsRedirect("Telefon yönlendirme kaydı kaydedildi", "success");
}
