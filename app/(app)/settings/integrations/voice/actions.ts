"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { saveCallForwardingProfile, saveTelnyxConnection } from "@/server/services/voice-provider-settings";

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
    const destinationProvider = (["netgsm", "telnyx", "sip"] as const).find((provider) => provider === text(formData, "destinationProvider")) || "other";
    const destinationNumber = text(formData, "destinationNumber");
    const publicNumber = text(formData, "publicNumber");
    await saveCallForwardingProfile({
      publicNumber,
      carrier: text(formData, "carrier") === "turkcell" ? "turkcell" : "other",
      destinationNumber,
      destinationProvider,
      transferDestination: text(formData, "transferDestination") || null,
      status: formData.get("connected") === "on" ? "connected" : "disconnected",
    });
    // The Telnyx-side connection is an independent fact from whether the carrier-side
    // call forwarding has been confirmed above: telnyx-adapter.ts's resolveCallContext
    // looks up voice_provider_connections by provider="telnyx" + phone_number=destinationNumber,
    // so inbound calls can never resolve to this org without this row existing.
    if (destinationProvider === "telnyx" && destinationNumber) {
      await saveTelnyxConnection({
        phoneNumber: destinationNumber,
        transferDestination: text(formData, "transferDestination") || publicNumber || null,
        status: "connected",
      });
    }
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
