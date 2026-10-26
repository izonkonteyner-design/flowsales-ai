import "server-only";

import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";

export const creativeFormatSchema = z.enum([
  "feed_image",
  "story_reel",
  "carousel",
  "video_storyboard",
  "landscape_ad",
]);
export type CreativeFormat = z.infer<typeof creativeFormatSchema>;

export type ShotListItem = {
  sceneNumber: number;
  durationSeconds: number;
  visualDescription: string;
  audioNarration: string;
  overlayText: string;
};

export type CreativeBriefModel = {
  id: string;
  organizationId: string;
  title: string;
  concept: string;
  format: CreativeFormat;
  dimensions: string;
  visualPrompt: string;
  shotList: ShotListItem[];
  voiceoverScript: string | null;
  overlayTexts: string[];
  thumbnailConcept: string | null;
  mappedCampaignId?: string | null;
  mappedSocialPostId?: string | null;
  createdAt: string;
};

const DIMENSION_BY_FORMAT: Record<CreativeFormat, string> = {
  feed_image: "1080x1080 (1:1 Kare)",
  story_reel: "1080x1920 (9:16 Dikey)",
  carousel: "1080x1080 (1:1 Çoklu Kaydırmalı)",
  video_storyboard: "1080x1920 (9:16 Video)",
  landscape_ad: "1200x628 (1.91:1 Yatay Reklam)",
};

/**
 * Generates an end-to-end creative brief including visual prompt, dimensions,
 * storyboard shot list, voiceover script, and overlay text.
 */
export async function generateCreativeProductionBrief(params: {
  topic: string;
  productOrService?: string;
  targetAudience?: string;
  format?: CreativeFormat;
  language?: "tr" | "en";
}): Promise<{
  title: string;
  concept: string;
  format: CreativeFormat;
  dimensions: string;
  visualPrompt: string;
  shotList: ShotListItem[];
  voiceoverScript: string;
  overlayTexts: string[];
  thumbnailConcept: string;
}> {
  const isEn = params.language === "en";
  const format = params.format || "story_reel";
  const dimensions = DIMENSION_BY_FORMAT[format];
  const topic = params.topic.trim();
  const product = params.productOrService?.trim() || topic;

  try {
    const { generateText } = await import("@/server/services/ai");
    const prompt = isEn
      ? `You are an award-winning creative director and video production lead.
Create a complete visual & video production brief for:
Product: ${product}
Topic: ${topic}
Format: ${format} (${dimensions})

Respond ONLY in valid JSON:
{
  "title": "Campaign Creative Title",
  "concept": "Core visual metaphor and hook concept",
  "visualPrompt": "Detailed AI image/video generation prompt describing lighting, composition, colors, mood, 8k render",
  "shotList": [
    { "sceneNumber": 1, "durationSeconds": 3, "visualDescription": "Hook shot...", "audioNarration": "Voiceover line...", "overlayText": "Text on screen..." },
    { "sceneNumber": 2, "durationSeconds": 5, "visualDescription": "Feature demonstration...", "audioNarration": "Value prop line...", "overlayText": "Feature pill..." },
    { "sceneNumber": 3, "durationSeconds": 4, "visualDescription": "Call to action...", "audioNarration": "Urgency line...", "overlayText": "Final CTA..." }
  ],
  "voiceoverScript": "Full 15-second voiceover narration script",
  "overlayTexts": ["Hook Text", "Value Metric", "Click Link"],
  "thumbnailConcept": "Thumbnail visual design with high-CTR typography"
}`
      : `Sen Türkiye'nin en iyi yaratıcı yönetmeni ve video prodüksiyon uzmanısın.
Şu brief için eksiksiz bir görsel ve video prodüksiyon briefi üret:
Ürün / Hizmet: ${product}
Konu: ${topic}
Format: ${format} (${dimensions})

SADECE geçerli JSON formatında yanıt ver:
{
  "title": "Kreatif Kampanya Başlığı",
  "concept": "Ana görsel konsept ve kanca fikri",
  "visualPrompt": "Yapay zekâ görsel üretimi için ışık, açı, doku ve renk paletini içeren detaylı prompt",
  "shotList": [
    { "sceneNumber": 1, "durationSeconds": 3, "visualDescription": "Dikkat çekici açılış sahnesi...", "audioNarration": "Seslendirme metni...", "overlayText": "Ekrana gelecek yazı..." },
    { "sceneNumber": 2, "durationSeconds": 5, "visualDescription": "Ürün/çözümün gösterimi...", "audioNarration": "Fayda anlatımı...", "overlayText": "Vurgulanan avantaj..." },
    { "sceneNumber": 3, "durationSeconds": 4, "visualDescription": "Harekete geçirici kapanış sahnesi...", "audioNarration": "Kapanış eylem çağrısı...", "overlayText": "CTA butonu/yazısı..." }
  ],
  "voiceoverScript": "Tam seslendirme metni (15-20 saniye)",
  "overlayTexts": ["Kanca Yazısı", "Temel Fayda", "Hemen İnceleyin"],
  "thumbnailConcept": "Yüksek tıklanma oranı (CTR) için kapak görseli tasarımı"
}`;

    const rawResponse = await generateText(prompt, { responseMimeType: "application/json" });
    const parsed = JSON.parse(rawResponse);

    return {
      title: parsed.title || `${product} — Kreatif Prodüksiyon`,
      concept: parsed.concept || `${topic} odağında yüksek etkili görsel konsept.`,
      format,
      dimensions,
      visualPrompt: parsed.visualPrompt || `Professional architectural render of ${product}, modern aesthetic, cinematic lighting, 8k, photorealistic`,
      shotList: Array.isArray(parsed.shotList) && parsed.shotList.length > 0 ? parsed.shotList : [
        { sceneNumber: 1, durationSeconds: 3, visualDescription: "Hızlı kanca sahnesi", audioNarration: "Zaman kaybetmeyi durdurun.", overlayText: "Farkı Görün" },
        { sceneNumber: 2, durationSeconds: 5, visualDescription: "Ürün ve kullanım gösterimi", audioNarration: "İşinizi büyüten akıllı çözümler.", overlayText: "%100 Verimlilik" },
        { sceneNumber: 3, durationSeconds: 4, visualDescription: "Teklif ve logo kapanışı", audioNarration: "Şimdi detayları keşfedin.", overlayText: "Profildeki Linke Tıklayın" },
      ],
      voiceoverScript: parsed.voiceoverScript || "İşinizi bir adım öteye taşıyacak yeni nesil çözümleri keşfedin. Hemen harekete geçin.",
      overlayTexts: Array.isArray(parsed.overlayTexts) && parsed.overlayTexts.length > 0 ? parsed.overlayTexts : ["Özel Fırsat", "Hemen Başvurun"],
      thumbnailConcept: parsed.thumbnailConcept || "Büyük kontrastlı başlık, canlı renk paleti, merkezde ürün odaklı temiz kompozisyon.",
    };
  } catch {
    // Safe deterministic fallback
    return {
      title: `${product} — Yaratıcı Prodüksiyon Briefi`,
      concept: `${topic} için yüksek dönüşüm sağlayan modern görsel dil.`,
      format,
      dimensions,
      visualPrompt: `Ultra-detailed commercial photo of ${product}, soft studio daylight, crisp materials, depth of field, high-end commercial quality.`,
      shotList: [
        { sceneNumber: 1, durationSeconds: 3, visualDescription: "Problem anını gösteren dikkat çekici açılış", audioNarration: "Daha iyi bir çözüme mi ihtiyacınız var?", overlayText: "İşinizi Büyütün" },
        { sceneNumber: 2, durationSeconds: 6, visualDescription: "Ürünün getirdiği kolaylık ve güven vurgusu", audioNarration: "FlowSales AI ile tüm süreçlerinizi kolaylaştırın.", overlayText: "Akıllı & Hızlı" },
        { sceneNumber: 3, durationSeconds: 4, visualDescription: "Kapanış ekranı, web sitesi ve CTA", audioNarration: "Detaylar için web sitemizi ziyaret edin.", overlayText: "Hemen Teklif Alın" },
      ],
      voiceoverScript: "Daha hızlı, daha verimli ve tamamen profesyonel. İşinizi büyütmek için şimdi ilk adımı atın.",
      overlayTexts: ["Kaçırılmayacak Fırsat", "Detaylı Bilgi"],
      thumbnailConcept: "Merkezde odaklanan ürün, sol üstte dikkat çekici etiket, yüksek kontrastlı tipografi.",
    };
  }
}

/**
 * Persists a creative brief into the database.
 */
export async function saveCreativeBrief(params: {
  organizationId: string;
  userId: string;
  brief: {
    title: string;
    concept: string;
    format: CreativeFormat;
    dimensions: string;
    visualPrompt: string;
    shotList: ShotListItem[];
    voiceoverScript?: string | null;
    overlayTexts?: string[];
    thumbnailConcept?: string | null;
    mappedCampaignId?: string | null;
    mappedSocialPostId?: string | null;
  };
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("creative_briefs")
    .insert({
      organization_id: params.organizationId,
      title: params.brief.title,
      concept: params.brief.concept,
      format: params.brief.format,
      dimensions: params.brief.dimensions,
      visual_prompt: params.brief.visualPrompt,
      shot_list: params.brief.shotList,
      voiceover_script: params.brief.voiceoverScript ?? null,
      overlay_texts: params.brief.overlayTexts ?? [],
      thumbnail_concept: params.brief.thumbnailConcept ?? null,
      mapped_campaign_id: params.brief.mappedCampaignId ?? null,
      mapped_social_post_id: params.brief.mappedSocialPostId ?? null,
      created_by: params.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Kreatif brief kaydedilemedi." };
  }

  return { success: true, id: data.id };
}
