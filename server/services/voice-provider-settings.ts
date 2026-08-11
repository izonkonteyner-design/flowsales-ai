import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { loadWorkspaceContext } from "@/server/services/workspace-context";

export type VoiceCarrier = "turkcell" | "vodafone" | "turktelekom" | "other";
export type VoiceDestinationProvider = "netgsm" | "telnyx" | "sip" | "other";

function normalizeTurkishPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  const normalized = digits.startsWith("90") && digits.length === 12
    ? digits
    : digits.startsWith("0") && digits.length === 11
      ? `90${digits.slice(1)}`
      : digits.length === 10
        ? `90${digits}`
        : "";

  if (!normalized) throw new Error("Türkiye telefon numarasını 05XXXXXXXXX veya +90... formatında girin.");
  return `+${normalized}`;
}

function normalizeDestinationNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) throw new Error("AI yönlendirme hedef numarası geçerli E.164 telefon formatında olmalıdır.");
  if (digits.startsWith("0")) return `+90${digits.slice(1)}`;
  if (digits.length === 10) return `+90${digits}`;
  return `+${digits}`;
}

function assertVoiceAdmin(ctx: Awaited<ReturnType<typeof loadWorkspaceContext>>) {
  if (!ctx || ctx.mode !== "live" || !ctx.userId) throw new Error("Canlı kullanıcı oturumu gerekli.");
  if (ctx.role !== "owner" && ctx.role !== "admin") throw new Error("Voice bağlantısını yalnızca Owner/Admin yönetebilir.");
  return ctx;
}

export async function getVoiceProviderSettings(organizationId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("voice_provider_connections")
    .select("id,provider,phone_number,external_connection_id,transfer_destination,status,settings,updated_at")
    .eq("organization_id", organizationId)
    .order("provider");
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

export async function saveCallForwardingProfile(input: {
  publicNumber: string;
  carrier: VoiceCarrier;
  destinationNumber: string;
  destinationProvider: VoiceDestinationProvider;
  transferDestination?: string | null;
  status: "connected" | "disconnected";
}) {
  const ctx = assertVoiceAdmin(await loadWorkspaceContext());
  const publicNumber = normalizeTurkishPhoneNumber(input.publicNumber);
  const destinationNumber = normalizeDestinationNumber(input.destinationNumber);
  const transferDestination = input.transferDestination?.trim()
    ? normalizeDestinationNumber(input.transferDestination)
    : null;
  const admin = createSupabaseAdminClient();
  const { data: existing, error: readError } = await admin
    .from("voice_provider_connections")
    .select("id")
    .eq("organization_id", ctx.organization.id)
    .eq("provider", "call_forwarding")
    .limit(1)
    .maybeSingle();
  if (readError) throw new Error(`Telefon yönlendirme kaydı okunamadı: ${readError.message}`);

  const payload = {
    organization_id: ctx.organization.id,
    provider: "call_forwarding",
    phone_number: publicNumber,
    external_connection_id: null,
    transfer_destination: transferDestination,
    status: input.status,
    settings: {
      carrier: input.carrier,
      destinationProvider: input.destinationProvider,
      destinationNumber,
      forwardingMode: "all_calls",
      publicNumber,
    },
    updated_at: new Date().toISOString(),
  };

  const result = existing?.id
    ? await admin.from("voice_provider_connections").update(payload).eq("id", existing.id).eq("organization_id", ctx.organization.id)
    : await admin.from("voice_provider_connections").insert(payload);
  if (result.error) throw new Error(`Telefon yönlendirme kaydı kaydedilemedi: ${result.error.message}`);
  return { success: true, publicNumber, destinationNumber };
}

export async function saveTelnyxConnection(input: { phoneNumber: string; externalConnectionId?: string | null; transferDestination?: string | null; status: "connected" | "disconnected" }) {
  const ctx = assertVoiceAdmin(await loadWorkspaceContext());
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
