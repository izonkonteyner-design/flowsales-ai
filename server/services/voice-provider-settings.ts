import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { loadWorkspaceContext } from "@/server/services/workspace-context";

export async function getVoiceProviderSettings(organizationId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("voice_provider_connections").select("id,provider,phone_number,external_connection_id,transfer_destination,status,settings,updated_at").eq("organization_id", organizationId).order("provider");
  if (error) throw new Error(error.message);
  return {
    connections: data ?? [],
    runtime: {
      telnyxApiKeyConfigured: Boolean(process.env.TELNYX_API_KEY?.trim()),
      telnyxPublicKeyConfigured: Boolean(process.env.TELNYX_PUBLIC_KEY?.trim()),
      webhookUrl: `${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || ""}/api/webhooks/voice/telnyx`,
    },
  };
}

export async function saveTelnyxConnection(input: { phoneNumber: string; externalConnectionId?: string | null; transferDestination?: string | null; status: "connected" | "disconnected" }) {
  const ctx = await loadWorkspaceContext();
  if (!ctx || ctx.mode !== "live" || !ctx.userId) throw new Error("Canlı kullanıcı oturumu gerekli.");
  if (ctx.role !== "owner" && ctx.role !== "admin") throw new Error("Voice bağlantısını yalnızca Owner/Admin yönetebilir.");
  const phoneNumber = input.phoneNumber.trim();
  if (!phoneNumber) throw new Error("Telefon numarası zorunludur.");
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("voice_provider_connections").upsert({
    organization_id: ctx.organization.id,
    provider: "telnyx",
    phone_number: phoneNumber,
    external_connection_id: input.externalConnectionId?.trim() || null,
    transfer_destination: input.transferDestination?.trim() || null,
    status: input.status,
    updated_at: new Date().toISOString(),
  }, { onConflict: "provider,phone_number" });
  if (error) throw new Error(`Voice bağlantısı kaydedilemedi: ${error.message}`);
  return { success: true };
}
