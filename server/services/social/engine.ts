import "server-only";

import { z } from "zod";
import { generateText } from "@/server/services/ai";
import type { MediaAnalysisResult } from "@/server/services/media/domain";

export const platformDraftPlacementSchema = z.enum([
  "feed",
  "story",
  "reel",
  "shorts",
  "video",
  "update",
  "offer",
]);
export type PlatformDraftPlacement = z.infer<typeof platformDraftPlacementSchema>;

export const socialPlatformDraftSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  platform: z.enum(["instagram", "facebook", "youtube", "google", "tiktok"]),
  placement: platformDraftPlacementSchema,
  headline: z.string(),
  caption: z.string(),
  hook: z.string(),
  cta: z.string(),
  hashtags: z.array(z.string()).default([]),
  targetUrl: z.string().url().or(z.literal("")).default(""),
  mediaUrl: z.string().url().or(z.literal("")).default(""),
  scheduledAt: z.string().nullable().default(null),
});
export type SocialPlatformDraft = z.infer<typeof socialPlatformDraftSchema>;

export const multiplatformSocialCampaignDraftSchema = z.object({
  campaignTitle: z.string(),
  sourceMediaAnalysis: z.custom<MediaAnalysisResult>().optional(),
  drafts: z.array(socialPlatformDraftSchema),
  generatedAt: z.string(),
});
export type MultiplatformSocialCampaignDraft = z.infer<typeof multiplatformSocialCampaignDraftSchema>;

function normalizePlacement(p: unknown): PlatformDraftPlacement {
  const str = String(p || "").toLowerCase();
  if (str.includes("story") || str.includes("stories")) return "story";
  if (str.includes("reel")) return "reel";
  if (str.includes("short")) return "shorts";
  if (str.includes("offer") || str.includes("teklif")) return "offer";
  if (str.includes("update") || str.includes("yenilik")) return "update";
  if (str.includes("video")) return "video";
  return "feed";
}

function buildFallbackDrafts(
  companyName: string,
  analysis: MediaAnalysisResult,
  targetUrl: string,
  mediaUrl: string,
): SocialPlatformDraft[] {
  return [
    {
      id: crypto.randomUUID(),
      platform: "instagram",
      placement: "feed",
      headline: `${companyName} — ${analysis.primarySubject}`,
      hook: "Dayanıklı, modern ve fonksiyonel konteyner çözümlerini keşfedin!",
      caption: `🏗️ ${analysis.primarySubject}\n\n${analysis.marketingAngle}.\n\n✨ Öne Çıkanlar:\n${analysis.keyFeatures.map((f) => `• ${f}`).join("\n")}\n\nFabrika satış avantajları ve hızlı sevkiyat ile projenize özel üretim yapıyoruz.`,
      cta: "Fiyat teklifi ve detaylı katalog için profildeki linke tıklayın veya mesaj atın!",
      hashtags: ["#IzonKonteyner", "#YasamKonteyneri", "#OfisKonteyneri", "#Prefabrik", "#Santiye"],
      targetUrl,
      mediaUrl,
      scheduledAt: null,
    },
    {
      id: crypto.randomUUID(),
      platform: "instagram",
      placement: "story",
      headline: "Özel Tasarım Konteyner Fırsatı",
      hook: "Hızlı teslimat, yüksek yalıtım garantisi!",
      caption: `${analysis.primarySubject} şimdi avantajlı fabrika fiyatlarıyla yayında!`,
      cta: "Yukarı kaydırın / Linke tıklayarak hemen teklif alın!",
      hashtags: ["#Konteyner", "#Fırsat"],
      targetUrl,
      mediaUrl,
      scheduledAt: null,
    },
    {
      id: crypto.randomUUID(),
      platform: "instagram",
      placement: "reel",
      headline: `${analysis.primarySubject} Üretim Detayları`,
      hook: "3 adımda şantiyenize hazır konteyner teslimatı!",
      caption: `Sağlam çelik konstrüksiyon, yüksek ısı yalıtımı ve modern iç mimari. ${analysis.marketingAngle}.`,
      cta: "Kendi ölçünüze özel fiyat almak için yoruma 'BİLGİ' yazın!",
      hashtags: ["#ReelsTurkey", "#KonteynerTasarim", "#IzonKonteyner"],
      targetUrl,
      mediaUrl,
      scheduledAt: null,
    },
    {
      id: crypto.randomUUID(),
      platform: "facebook",
      placement: "feed",
      headline: `${companyName} Kalitesiyle ${analysis.primarySubject}`,
      hook: "İşletmeniz veya araziniz için en dayanıklı modüler çözümler.",
      caption: `İzon Konteyner güvencesiyle üretilen ${analysis.primarySubject}, 4 mevsim yüksek yalıtım ve uzun ömürlü kullanım sunar.\n\nİster şantiye ofisi ister bağ/bahçe evi olarak kullanabileceğiniz projelerimizi inceleyin.`,
      cta: "Web sitemizi ziyaret edin veya uzman ekibimizle hemen görüşün.",
      hashtags: ["#IzonKonteyner", "#PrefabrikYapi", "#OfisCozumleri"],
      targetUrl,
      mediaUrl,
      scheduledAt: null,
    },
    {
      id: crypto.randomUUID(),
      platform: "facebook",
      placement: "video",
      headline: `${analysis.primarySubject} Tanıtım Videosu`,
      hook: "Sağlamlık testlerinden tam not alan konteyner teknolojisi.",
      caption: `Üretim tesisimizden teslimat anına kadar tüm süreçlerde kalite standartlarımızdan ödün vermiyoruz.`,
      cta: "Kataloğumuzu incelemek için hemen mesaj gönderin.",
      hashtags: ["#KonteynerUretim", "#Sanayi", "#Turkiye"],
      targetUrl,
      mediaUrl,
      scheduledAt: null,
    },
    {
      id: crypto.randomUUID(),
      platform: "youtube",
      placement: "shorts",
      headline: `${analysis.primarySubject} İncelemesi | 60 Saniyede Konteyner #Shorts`,
      hook: "Bu konteynerin içini görünce şaşıracaksınız!",
      caption: `${companyName} özel üretim modüler konteyner. Dayanıklı, şık ve taşınabilir. #Shorts #Konteyner #Prefabrik`,
      cta: "Abone olun ve modellerimizi kaçırmayın!",
      hashtags: ["#Shorts", "#KonteynerEv", "#PrefabrikEv"],
      targetUrl,
      mediaUrl,
      scheduledAt: null,
    },
    {
      id: crypto.randomUUID(),
      platform: "youtube",
      placement: "video",
      headline: `${companyName} — ${analysis.primarySubject} Detaylı Tanıtım ve Fiyat Rehberi`,
      hook: "Konteyner alırken nelere dikkat edilmeli? İşte tüm detaylar.",
      caption: `Bu videomuzda ${analysis.primarySubject} teknik özelliklerini, yalıtım detaylarını ve montaj sürecini inceliyoruz.\n\nZaman Çizelgesi:\n00:00 Giriş\n01:15 İzolasyon ve Malzeme Kalitesi\n02:30 İç Tasarım\n04:00 Fiyat ve Sipariş Süreci`,
      cta: "Kanalımıza abone olmayı ve bildirimleri açmayı unutmayın!",
      hashtags: ["#IzonKonteyner", "#KonteynerInceleme", "#PrefabrikModelleri"],
      targetUrl,
      mediaUrl,
      scheduledAt: null,
    },
    {
      id: crypto.randomUUID(),
      platform: "google",
      placement: "update",
      headline: `Yeni Üretim: ${analysis.primarySubject}`,
      hook: "İzon Konteyner'den şantiyelere ve işletmelere özel yeni teslimatlar.",
      caption: `${analysis.primarySubject} modellerimiz yüksek yalıtım ve dayanıklı şase yapısıyla stoklarımızda. Showroom alanımızı ziyaret edebilir veya hemen arayabilirsiniz.`,
      cta: "Hemen Ara / Yol Tarifi Al",
      hashtags: [],
      targetUrl,
      mediaUrl,
      scheduledAt: null,
    },
    {
      id: crypto.randomUUID(),
      platform: "google",
      placement: "offer",
      headline: `${analysis.primarySubject} İçin Özel Sezon İndirimi`,
      hook: "Bu ay geçerli özel nakit ve toplu alım avantajı!",
      caption: `Seçili konteyner modellerinde fabrikadan doğrudan teslimat ve indirim fırsatı. Sınırlı kontenjan!`,
      cta: "Teklifi Gör",
      hashtags: [],
      targetUrl,
      mediaUrl,
      scheduledAt: null,
    },
  ];
}

/**
 * Generates tailored drafts for Instagram, Facebook, YouTube, and Google Business Profile
 * based on verified media analysis and company profile.
 */
export async function generateMultiplatformSocialDrafts(params: {
  analysis: MediaAnalysisResult;
  mediaUrl?: string;
  companyName?: string;
  websiteUrl?: string;
  language?: "tr" | "en";
}): Promise<MultiplatformSocialCampaignDraft> {
  const isEn = params.language === "en";
  const { analysis, mediaUrl = "", companyName = "İzon Konteyner", websiteUrl = "https://flowsales-ai-six.vercel.app" } = params;

  const targetUrl = websiteUrl;
  const fallbackDrafts = buildFallbackDrafts(companyName, analysis, targetUrl, mediaUrl);

  try {
    const prompt = isEn
      ? `You are an expert omnichannel marketing copywriter.
Based on the following product/media analysis, generate customized social media drafts for:
1. Instagram Feed
2. Instagram Stories
3. Instagram Reels
4. Facebook Feed
5. Facebook Video
6. YouTube Shorts
7. YouTube Video
8. Google Business Profile Update
9. Google Business Profile Offer

Media Analysis:
- Product/Service: ${analysis.productOrService}
- Primary Subject: ${analysis.primarySubject}
- Theme: ${analysis.detectedTheme}
- Target Audience: ${analysis.suggestedAudience}
- Key Features: ${analysis.keyFeatures.join(", ")}
- Marketing Angle: ${analysis.marketingAngle}
- Visual Tone: ${analysis.visualTone}
- Company: ${companyName}

Respond strictly with valid JSON:
{
  "campaignTitle": "Short Campaign Name",
  "drafts": [
    {
      "platform": "instagram",
      "placement": "feed",
      "headline": "...",
      "hook": "...",
      "caption": "...",
      "cta": "...",
      "hashtags": ["#tag1", "#tag2"]
    }
  ]
}`
      : `Sen Türkiye'nin en iyi çok kanallı (omnichannel) sosyal medya ve içerik pazarlama uzmanısın.
Aşağıdaki medya analizini kullanarak İzon Konteyner için şu platformlara özel yayın taslakları üret:
1. Instagram Feed (Kare/Dikey gönderi, detaylı açıklama, kurumsal etiketler)
2. Instagram Story (9:16, dikkat çekici kısa metin, link çıkartması CTA)
3. Instagram Reels (9:16, dinamik ilk 3 saniye kancası, samimi ton)
4. Facebook Feed (Hikaye anlatan zengin metin, doğrudan web sitesi yönlendirmesi)
5. Facebook Video (Özellik vurgulayan video açıklaması)
6. YouTube Shorts (60 sn kısa video açıklaması, #Shorts etiketi, sabitleme yorumu CTA)
7. YouTube Video (SEO uyumlu başlık ve detaylı açıklama)
8. Google Business Profile Update (Yerel SEO, doğrudan arama ve yol tarifi CTA)
9. Google Business Profile Özel Teklif (Kampanya fırsatı, koşullar ve teklif butonu)

Medya Analizi:
- Ürün / Hizmet: ${analysis.productOrService}
- Ana Konu: ${analysis.primarySubject}
- Tema: ${analysis.detectedTheme}
- Hedef Kitle: ${analysis.suggestedAudience}
- Öne Çıkan Özellikler: ${analysis.keyFeatures.join(", ")}
- Satış Açısı: ${analysis.marketingAngle}
- Görsel Ton: ${analysis.visualTone}
- Firma: ${companyName}

SADECE geçerli JSON çıktısı üret:
{
  "campaignTitle": "Kampanya Başlığı",
  "drafts": [
    {
      "platform": "instagram",
      "placement": "feed",
      "headline": "Başlık",
      "hook": "Kanca",
      "caption": "Gönderi metni",
      "cta": "Eyleme çağrı",
      "hashtags": ["#etiket1", "#etiket2"]
    }
  ]
}`;

    const rawResponse = await generateText(prompt, { responseMimeType: "application/json" });
    const parsed = JSON.parse(rawResponse);

    if (Array.isArray(parsed.drafts) && parsed.drafts.length > 0) {
      const generatedDrafts: SocialPlatformDraft[] = parsed.drafts.map((d: Record<string, unknown>) => ({
        id: crypto.randomUUID(),
        platform: (d.platform as SocialPlatformDraft["platform"]) || "instagram",
        placement: normalizePlacement(d.placement),
        headline: String(d.headline || `${companyName} — ${analysis.primarySubject}`),
        hook: String(d.hook || "Hayalinizdeki modüler yaşam alanına bugün kavuşun!"),
        caption: String(d.caption || `${analysis.productOrService} ile mekanlarınızı dönüştürün.`),
        cta: String(d.cta || "Detaylı bilgi ve sipariş için bize ulaşın!"),
        hashtags: Array.isArray(d.hashtags) ? (d.hashtags as string[]) : ["#IzonKonteyner", "#ModulerYasam"],
        targetUrl,
        mediaUrl,
        scheduledAt: null,
      }));

      // Merge with fallback to ensure all required platform placements exist
      const existingKeys = new Set(generatedDrafts.map((d) => `${d.platform}:${d.placement}`));
      const completeDrafts = [...generatedDrafts];
      for (const fallback of fallbackDrafts) {
        const key = `${fallback.platform}:${fallback.placement}`;
        if (!existingKeys.has(key)) {
          completeDrafts.push(fallback);
          existingKeys.add(key);
        }
      }

      return {
        campaignTitle: parsed.campaignTitle || `${companyName} ${analysis.primarySubject} Lansmanı`,
        sourceMediaAnalysis: analysis,
        drafts: completeDrafts,
        generatedAt: new Date().toISOString(),
      };
    }
  } catch {
    // Graceful deterministic fallback
  }

  return {
    campaignTitle: `${companyName} ${analysis.primarySubject} Kampanyası`,
    sourceMediaAnalysis: analysis,
    drafts: fallbackDrafts,
    generatedAt: new Date().toISOString(),
  };
}
