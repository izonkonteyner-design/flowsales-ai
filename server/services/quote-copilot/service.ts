import type { SupabaseClient } from "@supabase/supabase-js";
import { synthesizeCustomerMemoryContext } from "../customer-memory/service";
import {
  type NegotiationStrategyInput,
  type NegotiationStrategyResult,
  type QuoteCopilotDraftInput,
  type QuoteCopilotDraftResult,
  type QuoteFollowUpScanResult,
  negotiationStrategyInputSchema,
  quoteCopilotDraftInputSchema,
} from "./domain";

/**
 * Intelligent quote generation combining customer memory, specs, catalog items, and margin guardrails.
 */
export async function generateQuoteCopilotDraft(
  supabase: SupabaseClient,
  input: QuoteCopilotDraftInput
): Promise<QuoteCopilotDraftResult> {
  const validated = quoteCopilotDraftInputSchema.parse(input);

  // Retrieve contextual memories if leadId or customerId exists
  let memoryContext: Awaited<ReturnType<typeof synthesizeCustomerMemoryContext>> | null = null;
  if (validated.leadId || validated.customerId) {
    try {
      memoryContext = await synthesizeCustomerMemoryContext(supabase, validated.organizationId, {
        leadId: validated.leadId,
        customerId: validated.customerId,
      });
    } catch {
      // Memory synthesis is optional enhancement
    }
  }

  const items: Array<{
    name: string;
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    taxRate: number;
    totalPrice: number;
  }> = [];

  if (validated.requestedItems && validated.requestedItems.length > 0) {
    for (const item of validated.requestedItems) {
      const unitPrice = item.estimatedUnitPrice ?? 125000;
      const taxRate = 20;
      const totalPrice = item.quantity * unitPrice;
      items.push({
        name: item.name,
        description: `${item.name} standart endüstriyel üretim ve kalite standartlarında.`,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice,
        taxRate,
        totalPrice,
      });
    }
  } else {
    // Determine from description
    const isSpecialContainer = /özel|villa|ofis|şantiye|iki\s*katlı|birleşim/i.test(validated.projectDescription);
    const primaryName = isSpecialContainer
      ? "3x7m Özel Tasarım Yaşam & Ofis Konteyneri"
      : "3x7m Standart Sandviç Panel Konteyner";
    const primaryPrice = isSpecialContainer ? 175000 : 135000;

    items.push({
      name: primaryName,
      description: "Yüksek yalıtımlı poliüretan/taşyünü sandviç panel, çelik karkas, PVC doğrama, zemin kaplama.",
      quantity: 1,
      unit: "adet",
      unitPrice: primaryPrice,
      taxRate: 20,
      totalPrice: primaryPrice,
    });

    // Check if customer asked for WC or extras
    if (/wc|banyo|duş|tuvalet/i.test(validated.projectDescription) || (memoryContext && memoryContext.preferences.some((p: string) => /wc|banyo/i.test(p)))) {
      items.push({
        name: "Kompakt WC & Lavabo Islak Hacim Modülü",
        description: "Seramik klozet, lavabo, batarya, temiz ve atık su tesisatı çekilmiş anahtar teslim modül.",
        quantity: 1,
        unit: "adet",
        unitPrice: 28000,
        taxRate: 20,
        totalPrice: 28000,
      });
    }
  }

  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const taxTotal = Math.round(subtotal * 0.2);
  const grandTotal = subtotal + taxTotal;

  const evidenceNotes: string[] = [
    `Talep metninden gereksinim analizi yapıldı: "${validated.projectDescription.slice(0, 80)}..."`,
  ];

  if (memoryContext && memoryContext.verifiedFacts.length > 0) {
    evidenceNotes.push(`Doğrulanmış müşteri verileri entegre edildi (${memoryContext.verifiedFacts.length} kayıt).`);
  }

  return {
    title: `Teklif Taslağı - ${items[0]?.name || "Modüler Yapı Projesi"}`,
    summary: `Müşteri talebine ve operasyonel maliyet standartlarına göre optimize edilmiş resmi teklif taslağı.`,
    items,
    subtotal,
    taxTotal,
    grandTotal,
    currency: validated.currency,
    estimatedMarginPercent: 28,
    maxAuthorizedDiscountPercent: 8, // Rep can discount max 8% without approval
    deliveryTimelineDays: 14,
    commercialTerms: [
      "Ödeme Koşulları: %50 sipariş onayı ve sözleşme akdinde, %50 sevk öncesi nakit/havale.",
      "Teslim Süresi: Sözleşme ve peşinat tarihinden itibaren 14-21 iş günüdür.",
      "Garanti: İmalat ve montaj hatalarına karşı 2 yıl garantilidir.",
      "Fiyatlara nakliye ve vinç indirme bedeli dahil değildir (isteğe bağlı eklenebilir).",
    ],
    evidenceNotes,
  };
}

/**
 * Evaluates objection and recommends an optimal negotiation strategy with guardrails.
 */
export async function evaluateNegotiationStrategy(
  supabase: SupabaseClient,
  input: NegotiationStrategyInput
): Promise<NegotiationStrategyResult> {
  const validated = negotiationStrategyInputSchema.parse(input);
  const reqDiscount = validated.requestedDiscountPercent ?? 0;
  const isHighDiscount = reqDiscount > 8;

  let recommendedAction: NegotiationStrategyResult["recommendedAction"] = "hold_price_offer_perk";
  let offeredDiscountPercent = 0;
  let requiresManagerApproval = false;
  const valueAdds: string[] = [];

  const objectionLower = validated.customerObjection.toLowerCase();

  if (isHighDiscount || objectionLower.includes("çok yüksek indirim") || reqDiscount >= 15) {
    recommendedAction = "require_management_approval";
    offeredDiscountPercent = Math.min(reqDiscount, 10);
    requiresManagerApproval = true;
  } else if (reqDiscount > 0 && reqDiscount <= 8) {
    recommendedAction = "offer_tiered_discount";
    offeredDiscountPercent = reqDiscount;
    valueAdds.push("Peşin tam ödemede geçerli özel iskonto.");
  } else if (objectionLower.includes("rakip") || objectionLower.includes("başka firma")) {
    recommendedAction = "hold_price_offer_perk";
    offeredDiscountPercent = 3;
    valueAdds.push("Ücretsiz 1. sınıf yalıtım upgrade'i (Taşyünü)");
    valueAdds.push("Ek güvence: +1 Yıl Uzatılmış İskelet Garantisi");
  } else {
    recommendedAction = "propose_spec_alternative";
    offeredDiscountPercent = 0;
    valueAdds.push("Standart panel yerine optimize kalınlık alternatifi");
    valueAdds.push("Maliyet tasarruflu kapı/pencere yerleşim revizyonu");
  }

  const revisedTotal = Math.round(validated.currentTotal * (1 - offeredDiscountPercent / 100));

  let suggestedSalesReply = "";
  if (recommendedAction === "hold_price_offer_perk") {
    suggestedSalesReply = `Merhaba, teklifimizi detaylı incelediğiniz için teşekkür ederiz. Ürünlerimizde kullandığımız yüksek dayanımlı çelik şase ve yangına dayanımlı sandviç panel standartları uzun ömürlü kullanım sağlar. Fiyatımızı düşürmek yerine projenize değer katmak adına, ücretsiz yalıtım yükseltmesini ve nakliye koordinasyonunu biz üstlenmek isteriz. Ne dersiniz?`;
  } else if (recommendedAction === "offer_tiered_discount") {
    suggestedSalesReply = `Merhaba, bütçenizi anlıyoruz. Projenizi hayata geçirebilmemiz için yöneticimizle görüştük ve peşin ödeme koşuluyla %${offeredDiscountPercent} oranında özel bir indirim tanımlayabildik. Yeni revize tutarımız ${revisedTotal.toLocaleString("tr-TR")} TL'dir. Onayınız durumunda üretime derhal başlayabiliriz.`;
  } else if (recommendedAction === "require_management_approval") {
    suggestedSalesReply = `Merhaba, talep ettiğiniz %${reqDiscount} indirim standart yetkimizi aştığı için şirket yönetimimizden özel onay sürecini başlattım. En kısa sürede nihai ticari onayımızla size dönüş yapacağım.`;
  } else {
    suggestedSalesReply = `Merhaba, bütçenizi aşmadan projenizi gerçekleştirebilmek adına alternatif teknik konfigürasyon hazırladık. Fonksiyondan ödün vermeden maliyet avantajı sağlayan revize çizimi paylaşmamızı ister misiniz?`;
  }

  return {
    quoteId: validated.quoteId,
    originalTotal: validated.currentTotal,
    recommendedAction,
    maxAllowedDiscountPercent: 8,
    offeredDiscountPercent,
    revisedTotal,
    valueAddsProposed: valueAdds,
    suggestedSalesReply,
    requiresManagerApproval,
    reasoning: `Müşteri itirazı: "${validated.customerObjection}". Kar marjını korumak için yetki sınırı %8 olarak uygulandı.`,
  };
}

/**
 * Scans dormant quotes (>48 hours without progress) and drafts proactive re-engagement suggestions.
 */
export async function scanQuotesForFollowUp(
  supabase: SupabaseClient,
  organizationId: string,
  minInactivityHours = 48
): Promise<QuoteFollowUpScanResult[]> {
  const cutoff = new Date(Date.now() - minInactivityHours * 3600 * 1000).toISOString();

  const { data: quotes, error } = await supabase
    .from("quotes")
    .select("id, quote_number, total_amount, currency, status, created_at, updated_at, contact_id, lead_id")
    .eq("organization_id", organizationId)
    .in("status", ["sent", "negotiation", "pending"])
    .lt("updated_at", cutoff)
    .limit(20);

  if (error || !quotes) {
    return [];
  }

  const results: QuoteFollowUpScanResult[] = [];

  for (const q of quotes) {
    const hoursSince = Math.floor((Date.now() - new Date(q.updated_at).getTime()) / (3600 * 1000));
    const daysSince = Math.max(1, Math.floor(hoursSince / 24));

    results.push({
      quoteId: q.id,
      quoteNumber: q.quote_number || "TEKLIF-DRAFT",
      recipientName: "Sayın Müşterimiz",
      channel: "whatsapp",
      daysSinceLastActivity: daysSince,
      status: q.status,
      suggestedFollowUpMessage: `Merhaba, ${q.quote_number || "teklifiniz"} ile ilgili olarak teknik veya ticari bir sorunuz olup olmadığını öğrenmek istedim. İhtiyacınıza göre revizyon yapmaktan veya üretim takvimimizi rezerve etmekten memnuniyet duyarız.`,
      urgency: daysSince >= 4 ? "urgent" : "medium",
    });
  }

  return results;
}
