"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadWorkspaceContext } from "@/server/services/workspace-context";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { getTrustedShowroom } from "@/server/services/business-locations";
import { getProductForAfterCall, prepareWhatsAppAfterCallAction } from "@/server/services/voice-sales-v1";
import { approveAndSendVoiceAfterCallAction } from "@/server/services/voice-sales/whatsapp-after-call";

function text(formData: FormData, key: string) { const value = formData.get(key); return typeof value === "string" ? value.trim() : ""; }

export async function prepareAfterCallWhatsAppAction(formData: FormData) {
  const callId = text(formData, "callId");
  try {
    const ctx = await loadWorkspaceContext();
    if (!ctx || !ctx.userId || ctx.mode !== "live") throw new Error("Canlı oturum gerekli.");
    if (formData.get("customerConsented") !== "on") throw new Error("Müşterinin WhatsApp gönderimini istediğini onaylayın.");
    const admin = createSupabaseAdminClient();
    const { data: call } = await admin.from("voice_calls").select("id,lead_id,sales_session_id").eq("id", callId).eq("organization_id", ctx.organization.id).maybeSingle();
    if (!call) throw new Error("Telefon görüşmesi bulunamadı.");
    const actionType = text(formData, "actionType") as "whatsapp_showroom" | "whatsapp_product";
    let message = "";
    if (actionType === "whatsapp_showroom") {
      const showroom = await getTrustedShowroom(ctx.organization.id);
      if (!showroom) throw new Error("Doğrulanmış aktif showroom kaydı bulunmuyor.");
      message = `${showroom.name}\n${showroom.address}${showroom.mapsUrl ? `\nKonum: ${showroom.mapsUrl}` : ""}${showroom.visitingHours ? `\nZiyaret saatleri: ${showroom.visitingHours}` : ""}`;
    } else if (actionType === "whatsapp_product") {
      const { data: session } = await admin.from("sales_sessions").select("referenced_product_ids").eq("id", call.sales_session_id).eq("organization_id", ctx.organization.id).maybeSingle();
      const productId = Array.isArray(session?.referenced_product_ids) ? session.referenced_product_ids[0] : null;
      if (!productId) throw new Error("Görüşmede doğrulanmış ürün kaydı bulunmuyor.");
      const { product, price } = await getProductForAfterCall(ctx.organization.id, productId);
      message = `${product.name}${product.areaM2 !== null ? ` · ${product.areaM2} m²` : ""}${price ? `\nGüncel katalog fiyatı: ${new Intl.NumberFormat("tr-TR", { style: "currency", currency: price.currency, maximumFractionDigits: 0 }).format(price.amount)}` : ""}`;
    } else throw new Error("Geçersiz WhatsApp aksiyonu.");
    await prepareWhatsAppAfterCallAction({ organizationId: ctx.organization.id, callId, leadId: call.lead_id, actionType, payload: { text: message }, customerConsented: true });
  } catch (error) {
    redirect(`/voice/calls/${callId}?toast=${encodeURIComponent(error instanceof Error ? error.message : "Aksiyon hazırlanamadı")}&tone=danger`);
  }
  revalidatePath(`/voice/calls/${callId}`);
  redirect(`/voice/calls/${callId}?toast=WhatsApp%20aksiyonu%20onaya%20hazırlandı&tone=success`);
}

export async function sendAfterCallWhatsAppAction(formData: FormData) {
  const callId = text(formData, "callId");
  try { await approveAndSendVoiceAfterCallAction(text(formData, "actionId")); }
  catch (error) { redirect(`/voice/calls/${callId}?toast=${encodeURIComponent(error instanceof Error ? error.message : "WhatsApp gönderilemedi")}&tone=danger`); }
  revalidatePath(`/voice/calls/${callId}`);
  redirect(`/voice/calls/${callId}?toast=WhatsApp%20mesajı%20gönderildi&tone=success`);
}
