import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const replySchema = z.object({ reply: z.string().trim().min(1).max(600) });

export type PhoneGroundingFacts = {
  companyName: string;
  customerUtterance: string;
  history: Array<{ speaker: "customer" | "assistant"; text: string }>;
  matchedProducts: Array<{ name: string; areaM2: number | null; price: number | null; currency: string }>;
  showroom: { name: string; address: string; workingHours?: string | null } | null;
  intent: "showroom" | "pricing" | "general";
  noVerifiedPrice: boolean;
};

const SYSTEM_PROMPT = `Sen İZON Konteyner firmasında çalışan, sıcak ve doğal konuşan bir Türkçe telefon satış temsilcisisin.
KESİN KURALLAR:
1. Sana "DOGRULANMIS_BILGILER" alanında verilmeyen hiçbir fiyatı, ürün özelliğini veya adresi ASLA söyleme veya tahmin etme.
2. "noVerifiedPrice" true ise: bu, müşterinin istediği şeyin standart katalog dışı / özel bir proje olduğu anlamına gelir. Kesinlikle tahmini bir fiyat söyleme. Bunun yerine doğal bir dille bunun özel bir proje olabileceğini belirt ve satış danışmanının kendisine özel teklif hazırlayacağını söyle.
3. "matchedProducts" içinde fiyatı olan bir ürün varsa, sadece o ürünün adını ve verilen tam fiyatını kullan, başka sayı uydurma.
4. Bir ürün fiyatı söylediğinde bunun KDV hariç taban/katalog fiyatı olduğunu ve müşterinin bulunduğu bölgeye/teslimat lokasyonuna göre değişen bir NAKLİYE BEDELİNİN ayrıca ekleneceğini mutlaka belirt; net toplam tutarı satış danışmanının netleştireceğini söyle. Nakliye bedelinin kendisi için ASLA bir rakam uydurma, sadece bölgeye göre değiştiğini söyle.
5. Konuşma geçmişini dikkate alarak doğal, akıcı, kısa (telefonda söylenecek 1-3 cümlelik) bir yanıt üret. Robotik, şablon hissi veren cümlelerden kaçın; gerçek bir insan satış temsilcisi gibi konuş, samimi ama profesyonel ol.
6. Sadece şu JSON formatında cevap ver: {"reply": "..."}`;

export class NaturalReplyUnavailableError extends Error {}

export async function generateNaturalPhoneReply(facts: PhoneGroundingFacts): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new NaturalReplyUnavailableError("GEMINI_API_KEY is not configured.");

  const client = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_VOICE_MODEL?.trim() || process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

  const userPrompt = JSON.stringify({
    companyName: facts.companyName,
    intent: facts.intent,
    customerUtterance: facts.customerUtterance,
    conversationHistory: facts.history.slice(-8),
    DOGRULANMIS_BILGILER: {
      matchedProducts: facts.matchedProducts,
      showroom: facts.showroom,
    },
    noVerifiedPrice: facts.noVerifiedPrice,
  });

  let response;
  try {
    response = await client.models.generateContent({
      model,
      contents: userPrompt,
      config: { systemInstruction: SYSTEM_PROMPT, temperature: 0.4, responseMimeType: "application/json" },
    });
  } catch (error) {
    throw new NaturalReplyUnavailableError(error instanceof Error ? error.message : "Gemini request failed.");
  }

  const text = response.text?.trim();
  if (!text) throw new NaturalReplyUnavailableError("Gemini returned an empty response.");

  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    throw new NaturalReplyUnavailableError("Gemini returned invalid JSON.");
  }

  const parsed = replySchema.safeParse(decoded);
  if (!parsed.success) throw new NaturalReplyUnavailableError("Gemini reply failed schema validation.");

  if (facts.noVerifiedPrice && /\d[\d.,]*\s*(tl|try|₺)/i.test(parsed.data.reply)) {
    throw new NaturalReplyUnavailableError("Gemini attempted to speak a price without a verified source.");
  }

  return parsed.data.reply;
}
