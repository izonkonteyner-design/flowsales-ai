import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { recommendProductsV2, verifyPriceBeforeSpeech } from "@/server/services/voice-sales-v1";
import { getTrustedShowroom } from "@/server/services/business-locations";
import { generateNaturalTextReply, NaturalReplyUnavailableError } from "@/server/services/voice-channel/natural-reply";

export type SafeAutoReplyResult = { safe: true; reply: string } | { safe: false };

async function getOrganizationName(organizationId: string): Promise<string> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("organizations").select("name").eq("id", organizationId).maybeSingle();
  return (data?.name as string | undefined) ?? "firmamız";
}

/**
 * Decides whether an inbound text message (WhatsApp/Instagram/Facebook/email) can be answered
 * fully autonomously, and if so, drafts the reply. Scope is intentionally narrow: only showroom
 * address, a standard priced catalog product, or a short greeting. Anything else (custom/special
 * projects, complaints, negotiation, multi-turn qualification) returns {safe:false} so the existing
 * human-reviewed draft flow handles it — mirrors the same safety split built for the phone channel.
 */
export async function determineSafeAutoReply(input: {
  organizationId: string;
  customerMessage: string;
  history?: Array<{ speaker: "customer" | "assistant"; text: string }>;
}): Promise<SafeAutoReplyResult> {
  const message = input.customerMessage.trim();
  if (!message) return { safe: false };
  const lower = message.toLocaleLowerCase("tr-TR");
  const history = input.history ?? [];
  const companyName = await getOrganizationName(input.organizationId);

  try {
    if (/showroom|mağaza|adres|nerede/.test(lower)) {
      const showroom = await getTrustedShowroom(input.organizationId, "İzmir").catch(() => null) ?? await getTrustedShowroom(input.organizationId).catch(() => null);
      if (!showroom) return { safe: false };
      const reply = await generateNaturalTextReply({
        companyName, customerUtterance: message, history, matchedProducts: [],
        showroom: { name: showroom.name, address: showroom.address, workingHours: showroom.visitingHours ?? null },
        intent: "showroom", noVerifiedPrice: false,
      });
      return { safe: true, reply };
    }

    if (/fiyat|ne kadar|kaç para/.test(lower)) {
      const matches = await recommendProductsV2({ organizationId: input.organizationId, query: message, limit: 3 });
      if (!matches.length || matches[0].price === null) return { safe: false };
      const best = matches[0];
      const verified = await verifyPriceBeforeSpeech({ organizationId: input.organizationId, productId: best.product.id, amount: best.price!, currency: best.product.currency });
      const reply = await generateNaturalTextReply({
        companyName, customerUtterance: message, history,
        matchedProducts: [{ name: best.product.name, areaM2: best.product.areaM2, price: verified.amount, currency: verified.currency }],
        showroom: null, intent: "pricing", noVerifiedPrice: false,
      });
      return { safe: true, reply };
    }

    if (/^(merhaba|selam|günaydın|iyi günler|iyi akşamlar|teşekkür|tşk)/.test(lower) && message.length < 80) {
      const reply = await generateNaturalTextReply({
        companyName, customerUtterance: message, history, matchedProducts: [], showroom: null,
        intent: "general", noVerifiedPrice: false,
      });
      return { safe: true, reply };
    }
  } catch (error) {
    if (!(error instanceof NaturalReplyUnavailableError)) console.error("omnichannel_auto_reply_failed", error);
    return { safe: false };
  }

  return { safe: false };
}
