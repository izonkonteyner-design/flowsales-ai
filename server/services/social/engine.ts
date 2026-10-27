import "server-only";

import { z } from "zod";
import { generateText } from "@/server/services/ai";
import type { MediaAnalysisResult } from "@/server/services/media/domain";
import { evaluateDraftQuality, verifyCrossPlatformDistinctness } from "./quality-gate";

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
  hashtags: z.array(z.string()).max(5).default([]),
  targetUrl: z.string().url().or(z.literal("")).default(""),
  mediaUrl: z.string().url().or(z.literal("")).default(""),
  scheduledAt: z.string().nullable().default(null),

  // Section 4 & 5: SEO, GEO and Quality Gate Attributes
  primaryKeyword: z.string().default(""),
  secondaryKeywords: z.array(z.string()).default([]),
  searchIntent: z.enum(["informational", "commercial", "transactional"]).default("commercial"),
  alternativeHooks: z.array(z.string()).default([]),
  targetRegions: z.array(z.string()).default([]),
  unverifiedClaimsWarning: z.string().nullable().default(null),
  qualityPassed: z.boolean().default(true),
  qualityNotes: z.array(z.string()).default([]),
});
export type SocialPlatformDraft = z.infer<typeof socialPlatformDraftSchema>;

export const multiplatformSocialCampaignDraftSchema = z.object({
  campaignTitle: z.string(),
  sourceMediaAnalysis: z.custom<MediaAnalysisResult>().optional(),
  seoStrategy: z.object({
    coreTheme: z.string(),
    primaryKeywords: z.array(z.string()),
    geoTargets: z.array(z.string()),
    searchIntents: z.array(z.string()),
    disclaimer: z.string().default("Arama motoru sıralaması veya GEO görünürlüğü garanti edilmez; doğal kullanıcı aramaları hedeflenmiştir."),
  }).optional(),
  drafts: z.array(socialPlatformDraftSchema),
  generatedAt: z.string(),
});
export type MultiplatformSocialCampaignDraft = z.infer<typeof multiplatformSocialCampaignDraftSchema>;

function normalizePlatform(p: unknown): "instagram" | "facebook" | "youtube" | "google" | "tiktok" {
  const str = String(p || "").toLowerCase();
  if (str.includes("insta")) return "instagram";
  if (str.includes("face") || str.includes("meta")) return "facebook";
  if (str.includes("you") || str.includes("yt")) return "youtube";
  if (str.includes("tik")) return "tiktok";
  if (str.includes("goog") || str.includes("gbp") || str.includes("gmb") || str.includes("business")) return "google";
  return "instagram";
}

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

function sanitizeHashtags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const cleaned = tags
    .map((t) => String(t || "").trim())
    .map((t) => (t.startsWith("#") ? t : `#${t}`))
    .filter((t) => t.length > 1 && !t.includes(" "));
  // Strictly enforce max 5 hashtags per Section 4 requirement
  return Array.from(new Set(cleaned)).slice(0, 5);
}

function buildFallbackDrafts(
  companyName: string,
  analysis: MediaAnalysisResult,
  targetUrl: string,
  mediaUrl: string,
  targetCity = "Marmara Bölgesi"
): SocialPlatformDraft[] {
  const subject = analysis.primarySubject || analysis.productOrService || "Modüler Konteyner";
  const visualNotes = analysis.visual_description || analysis.marketingAngle || "Yüksek yalıtımlı modüler yapı çözümleri";
  const defaultRegions = [targetCity, "İstanbul", "Kocaeli", "Bursa"].filter(Boolean);

  return [
    {
      id: crypto.randomUUID(),
      platform: "instagram",
      placement: "feed",
      headline: `${companyName} — ${subject}`,
      hook: "Dayanıklı, modern ve fonksiyonel konteyner çözümlerini keşfedin!",
      caption: `🏗️ ${subject}\n\n${visualNotes}.\n\nFabrika teslim avantajı ve güvenilir şase yapısıyla projenize özel üretim sunuyoruz.`,
      cta: "Detaylı teknik bilgi ve teklif için profildeki linke tıklayın veya DM gönderin!",
      hashtags: ["#IzonKonteyner", "#Konteyner", "#YasamKonteyneri", "#Prefabrik", "#ModulerYapi"],
      targetUrl,
      mediaUrl,
      scheduledAt: null,
      primaryKeyword: `${subject} fiyatları`.toLowerCase(),
      secondaryKeywords: ["modüler yaşam alanı", "hazır konteyner", "sandviç panel yapı"],
      searchIntent: "commercial",
      alternativeHooks: [
        `${subject} ile şantiyenize veya arazinize anında değer katın!`,
        "Hızlı kurulum, uzun ömürlü çelik konstrüksiyon güvencesi.",
        "Fabrikadan doğrudan teslim avantajlı modüler yapılar.",
      ],
      targetRegions: defaultRegions,
      unverifiedClaimsWarning: null,
      qualityPassed: true,
      qualityNotes: [],
    },
    {
      id: crypto.randomUUID(),
      platform: "instagram",
      placement: "story",
      headline: `Özel Üretim: ${subject}`,
      hook: "Hızlı teslimat, yüksek yalıtım garantisi!",
      caption: `${subject} şimdi avantajlı fabrika fiyatlarıyla yayında! Detaylar için linke tıklayın.`,
      cta: "Yukarı kaydırın / Hemen bilgi alın!",
      hashtags: ["#Konteyner", "#Fırsat", "#IzonKonteyner"],
      targetUrl,
      mediaUrl,
      scheduledAt: null,
      primaryKeyword: "konteyner modelleri",
      secondaryKeywords: ["hazır konteyner", "şantiye konteyneri"],
      searchIntent: "transactional",
      alternativeHooks: [
        "Arazinize veya şantiyenize hazır teslimat!",
        "Stoktan hemen teslim modüler konteyner fırsatı.",
        "İzon güvencesiyle 1 günde kurulum.",
      ],
      targetRegions: defaultRegions,
      unverifiedClaimsWarning: null,
      qualityPassed: true,
      qualityNotes: [],
    },
    {
      id: crypto.randomUUID(),
      platform: "instagram",
      placement: "reel",
      headline: `${subject} Üretim Detayları`,
      hook: "3 adımda projenize hazır konteyner teslimatı!",
      caption: `${subject} üretim ve montaj aşamaları. Dayanıklı gövde, sızdırmaz tavan ve yüksek ısı izolasyonu ile 4 mevsim konfor.`,
      cta: "Ölçülerinizi yorumlara yazın, projenize özel çizim ve teklif sunalım!",
      hashtags: ["#KonteynerEv", "#Reels", "#IzonKonteyner", "#PrefabrikEv", "#Santiye"],
      targetUrl,
      mediaUrl,
      scheduledAt: null,
      primaryKeyword: "özel yapım konteyner",
      secondaryKeywords: ["konteyner montajı", "yalıtımlı konteyner"],
      searchIntent: "informational",
      alternativeHooks: [
        "Bir konteyner nasıl 4 mevsim yaşam alanına dönüşür?",
        "Şantiyelerde en çok tercih edilen modüler model hangisi?",
        "Çelik karkas yapının sağladığı dayanıklılık farkı.",
      ],
      targetRegions: defaultRegions,
      unverifiedClaimsWarning: null,
      qualityPassed: true,
      qualityNotes: [],
    },
    {
      id: crypto.randomUUID(),
      platform: "facebook",
      placement: "feed",
      headline: `${companyName} Kalitesiyle ${subject}`,
      hook: "Şantiye ve işletmeler için zamanında teslim edilen dayanıklı modüler çözümler.",
      caption: `İşletmenizin veya arazinizin ihtiyacı olan ${subject} çözümlerini mühendislik güvencesiyle sunuyoruz.\n\n✔️ Yüksek ısı ve ses yalıtımlı sandviç panel\n✔️ Ağır hizmet tipi galvaniz çelik karkas\n✔️ Hızlı sevkiyat ve anahtar teslim kurulum\n\n${targetCity} ve tüm çevre illere doğrudan fabrika sevkiyatı yapmaktayız.`,
      cta: "Katalog indirmek ve projenize özel teklif almak için web sitemizi ziyaret edin.",
      hashtags: ["#IzonKonteyner", "#KonteynerUretimi", "#SantiyeCozumleri", "#PrefabrikOfis"],
      targetUrl,
      mediaUrl,
      scheduledAt: null,
      primaryKeyword: "şantiye konteyner üreticisi",
      secondaryKeywords: ["ofis konteyneri toptan", "konteyner imalatı marmara", "sandviç panel ofis"],
      searchIntent: "commercial",
      alternativeHooks: [
        "İnşaat projelerinizde gecikmeye son: Hazır ofis konteynerleri.",
        "Şantiyenizin ihtiyaç duyduğu konfor ve güven tek bir modülde.",
        "Fabrikadan doğrudan müteahhit ve işletmelere özel fiyat avantajı.",
      ],
      targetRegions: defaultRegions,
      unverifiedClaimsWarning: null,
      qualityPassed: true,
      qualityNotes: [],
    },
    {
      id: crypto.randomUUID(),
      platform: "facebook",
      placement: "video",
      headline: `${subject} İnceleme ve Dayanıklılık Testi`,
      hook: "Zorlu saha şartlarına dayanıklı modüler konteyner karkası nasıl olmalı?",
      caption: `${companyName} olarak ürettiğimiz her ${subject} için korozyon direnci yüksek galvaniz profiller ve sızdırmaz çatı detayları uyguluyoruz. Uzun yıllar bakım gerektirmeden güvenle kullanabilirsiniz.`,
      cta: "WhatsApp hattımızdan veya web sitemizden anında temsilcimizle görüşün.",
      hashtags: ["#Konteyner", "#Santiye", "#Izon", "#YapiSektor"],
      targetUrl,
      mediaUrl,
      scheduledAt: null,
      primaryKeyword: "dayanıklı konteyner özellikleri",
      secondaryKeywords: ["galvaniz şase konteyner", "şantiye konteyner kalitesi"],
      searchIntent: "commercial",
      alternativeHooks: [
        "Ağır şantiye şartlarında konteyner seçerken bunlara dikkat edin!",
        "Çelik şase mukavemeti neden en önemli kriterdir?",
        "İzolasyon kalitesini belirleyen kritik üretim detayları.",
      ],
      targetRegions: defaultRegions,
      unverifiedClaimsWarning: null,
      qualityPassed: true,
      qualityNotes: [],
    },
    {
      id: crypto.randomUUID(),
      platform: "youtube",
      placement: "shorts",
      headline: `${subject} 60 Saniyede Tanıtım`,
      hook: "Projenize en uygun konteyner modelini keşfedin!",
      caption: `${companyName} özel üretim modüler konteyner. Dayanıklı, şık ve taşınabilir. Detaylı katalog profildeki linkte.`,
      cta: "Kanalımıza abone olun, yeni modelleri ilk siz görün!",
      hashtags: ["#Shorts", "#Konteyner", "#Prefabrik", "#ModulerEv"],
      targetUrl,
      mediaUrl,
      scheduledAt: null,
      primaryKeyword: `${subject} inceleme`.toLowerCase(),
      secondaryKeywords: ["hızlı konteyner tanıtım", "konteyner turu"],
      searchIntent: "informational",
      alternativeHooks: [
        "İşte projenizin ihtiyacı olan modüler yaşam ünitesi!",
        "60 saniyede kaliteli bir konteynerin anatomisi.",
        "Fabrikadan taze çıkan özel tasarımımız.",
      ],
      targetRegions: defaultRegions,
      unverifiedClaimsWarning: null,
      qualityPassed: true,
      qualityNotes: [],
    },
    {
      id: crypto.randomUUID(),
      platform: "youtube",
      placement: "video",
      headline: `${companyName} — ${subject} Detaylı Tanıtım ve Teknik Özellikler`,
      hook: `${subject} alırken dikkat edilmesi gereken tüm teknik detaylar ve kullanım avantajları.`,
      caption: `Bu videomuzda ${companyName} güvencesiyle üretilen ${subject} modelimizin malzeme kalitesini, izolasyon standartlarını ve teslimat süreçlerini ele alıyoruz.\n\nBölümler:\n0:00 Giriş ve Genel Görünüm\n0:30 İzolasyon ve Karkas Özellikleri\n1:00 Kullanım Alanları ve Sevkiyat\n\n📌 Fiyat ve teknik şartname için web sitemizi ziyaret edin.`,
      cta: "Videoyu beğenmeyi, sorularınızı yorumlarda sormayı ve kanalımıza abone olmayı unutmayın!",
      hashtags: ["#KonteynerRehberi", "#KonteynerFiyatlari", "#PrefabrikYapi", "#IzonKonteyner"],
      targetUrl,
      mediaUrl,
      scheduledAt: null,
      primaryKeyword: `${subject} teknik özellikleri`.toLowerCase(),
      secondaryKeywords: ["konteyner alırken nelere dikkat edilmeli", "modüler ofis rehberi", "konteyner üretimi"],
      searchIntent: "informational",
      alternativeHooks: [
        `${subject} hakkında bilmeniz gereken her şey bu videoda!`,
        "Doğru konteyner nasıl seçilir? Uzman rehberi.",
        "Fabrikamızdan canlı üretim detayları ve kalite standartları.",
      ],
      targetRegions: defaultRegions,
      unverifiedClaimsWarning: null,
      qualityPassed: true,
      qualityNotes: [],
    },
    {
      id: crypto.randomUUID(),
      platform: "google",
      placement: "update",
      headline: `Yeni Teslimat: ${subject}`,
      hook: `${companyName} tesislerimizden yeni modüler teslimatlar devam ediyor.`,
      caption: `${subject} modellerimiz yüksek yalıtım ve dayanıklı şase yapısıyla ${targetCity} ve tüm bölgedeki müşterilerimize sevk ediliyor. Showroom alanımızı ziyaret edebilir veya hemen arayabilirsiniz.`,
      cta: "Hemen Ara / Yol Tarifi Al",
      hashtags: [],
      targetUrl,
      mediaUrl,
      scheduledAt: null,
      primaryKeyword: `${targetCity} konteyner satışı`.toLowerCase(),
      secondaryKeywords: ["yakınımdaki konteyner firması", "yerel konteyner üreticisi", "hazır ofis kabini"],
      searchIntent: "transactional",
      alternativeHooks: [
        `${targetCity} bölgesinde hızlı teslim modüler konteynerler.`,
        "Showroom alanımıza gelerek modellerimizi yerinde inceleyin.",
        "Fabrika çıkış avantajıyla doğrudan üreticiden tedarik edin.",
      ],
      targetRegions: defaultRegions,
      unverifiedClaimsWarning: null,
      qualityPassed: true,
      qualityNotes: [],
    },
    {
      id: crypto.randomUUID(),
      platform: "google",
      placement: "offer",
      headline: `${subject} İçin Özel Sezon Avantajı`,
      hook: "Bu ay geçerli özel fabrika doğrudan alım fırsatı!",
      caption: `Seçili ${subject} siparişlerinizde hızlı termin ve nakliye planlama desteği. Showroom ve üretim tesisimizde yerinde inceleme imkânı.`,
      cta: "Teklifi Gör ve İletişime Geç",
      hashtags: [],
      targetUrl,
      mediaUrl,
      scheduledAt: null,
      primaryKeyword: "konteyner kampanya teklif",
      secondaryKeywords: ["toptan konteyner indirimi", "şantiye konteyner teklifi"],
      searchIntent: "transactional",
      alternativeHooks: [
        "Bu ay teslim edilecek modellerde cazip üretim koşulları.",
        "Toplu şantiye alımlarında özel fiyat teklifi alın.",
        "Fabrikadan doğrudan satış garantisi ile tasarruf edin.",
      ],
      targetRegions: defaultRegions,
      unverifiedClaimsWarning: null,
      qualityPassed: true,
      qualityNotes: [],
    },
  ];
}

/**
 * Generates tailored drafts for Instagram, Facebook, YouTube, and Google Business Profile
 * combining real visual analysis, company profile, verified locations, and SEO/GEO keywords.
 */
export async function generateMultiplatformSocialDrafts(params: {
  analysis: MediaAnalysisResult;
  mediaUrl?: string;
  companyName?: string;
  websiteUrl?: string;
  language?: "tr" | "en";
  targetCity?: string;
  verifiedCatalog?: string[];
}): Promise<MultiplatformSocialCampaignDraft> {
  const isEn = params.language === "en";
  const {
    analysis,
    mediaUrl = "",
    companyName = "İzon Konteyner",
    websiteUrl = "https://flowsales-ai-six.vercel.app",
    targetCity = "Marmara Bölgesi",
    verifiedCatalog = [],
  } = params;

  const targetUrl = websiteUrl;
  const fallbackDrafts = buildFallbackDrafts(companyName, analysis, targetUrl, mediaUrl, targetCity);

  const detectedObjects = Array.isArray(analysis?.detected_objects) ? analysis.detected_objects : [];
  const visibleFeatures = Array.isArray(analysis?.visible_features)
    ? analysis.visible_features
    : Array.isArray(analysis?.keyFeatures)
    ? analysis.keyFeatures
    : [];
  const visibleText = Array.isArray(analysis?.visible_text) ? analysis.visible_text : [];
  const visualDesc = analysis?.visual_description || analysis?.summary || "";
  const productCat = analysis?.product_category || analysis?.primarySubject || "";
  const unverifiedNotice = Array.isArray(analysis?.unknown_or_unverified_details)
    ? analysis.unknown_or_unverified_details.join("; ")
    : "";

  const visualSummary = [
    visualDesc,
    detectedObjects.length > 0 ? `Tespit Edilen Nesneler: ${detectedObjects.join(", ")}` : null,
    visibleFeatures.length > 0 ? `Görsel Özellikler: ${visibleFeatures.join(", ")}` : null,
    visibleText.length > 0 ? `Görsel Üzerindeki Yazılar: ${visibleText.join(", ")}` : null,
    productCat ? `Kategori: ${productCat}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const prompt = isEn
      ? `You are an elite omnichannel content strategist, SEO expert, and Generative Engine Optimization (GEO) specialist.
Create tailored, high-converting social media drafts for ${companyName} based strictly on verified visual media analysis.

VISUAL FACTS (DO NOT hallucinate unverified dimensions, prices, or specs):
${visualSummary || "General container and modular architecture context."}
${unverifiedNotice ? `UNVERIFIED CLAIMS TO AVOID: ${unverifiedNotice}` : ""}
- Company: ${companyName}
- Target Region: ${targetCity}
- Verified Products: ${verifiedCatalog.join(", ") || "Office containers, living containers, modular homes"}

RULES:
1. Instagram: Hook first sentence, friendly visual lifestyle/business tone, max 5 relevant hashtags.
2. Facebook: Emphasize business utility, problem solving, durability, link to website/quote.
3. YouTube: High-search-intent title with primary keyword, structured description with chapters concept.
4. Google Business Profile: Local SEO emphasis, target regions, direct Call / Directions CTA.
5. Provide primaryKeyword, 3-5 secondaryKeywords, searchIntent ("commercial"|"transactional"|"informational"), 3 alternativeHooks, and targetRegions for EACH draft.
6. Strictly max 5 hashtags per draft.
7. No keyword stuffing. Do not claim rank guarantees.

Return STRICT JSON:
{
  "campaignTitle": "Campaign Title",
  "seoOverview": {
    "coreTheme": "Theme",
    "primaryKeywords": ["kw1", "kw2"],
    "geoTargets": ["${targetCity}"],
    "searchIntents": ["commercial", "transactional"]
  },
  "drafts": [
    {
      "platform": "instagram",
      "placement": "feed",
      "headline": "Headline",
      "hook": "Hook sentence",
      "caption": "Full caption",
      "cta": "Call to action",
      "hashtags": ["#tag1", "#tag2", "#tag3"],
      "primaryKeyword": "primary keyword",
      "secondaryKeywords": ["sec1", "sec2", "sec3"],
      "searchIntent": "commercial",
      "alternativeHooks": ["Hook 1", "Hook 2", "Hook 3"],
      "targetRegions": ["${targetCity}"]
    }
  ]
}`
      : `Sen Türkiye'nin en iyi çok kanallı (omnichannel) dijital pazarlama, SEO ve GEO (Generative Engine Optimization) uzmanısın.
${companyName} firması için, görselden elde edilen gerçek somut detayları ve yerel arama niyetini birleştiren profesyonel içerikler üret.

GÖRSELDE DOĞRULANAN SOMUT BİLGİLER (Görselde görünmeyen kesin ölçü, fiyat veya yangın sınıfı uydurma):
${visualSummary || "Modüler konteyner ve prefabrik yapı bağlamı."}
${unverifiedNotice ? `DOĞRULANAMAYAN / UYDURULMAMASI GEREKEN DETAYLAR: ${unverifiedNotice}` : ""}
- Firma Adı: ${companyName}
- Hizmet / Hedef Bölge: ${targetCity}
- Doğrulanmış Ürünler: ${verifiedCatalog.join(", ") || "Ofis Konteynerleri, Yaşam Konteynerleri, Şantiye Yapıları"}

PLATFORM KALİTE KURALLARI:
1. Instagram (Feed, Story, Reel): İlk satırda güçlü merak uyandıran kanca (hook), doğal görsel ton, en fazla 5 alakalı hashtag.
2. Facebook (Feed, Video): Şantiye ve işletmelerin ihtiyacına çözüm, dayanıklılık, teslimat hızı ve web sitesine net yönlendirme.
3. YouTube (Shorts, Video): Arama odaklı başlık (içinde ana anahtar kelime geçen), açıklamada video bölümleri/zaman damgası konsepti ve abone/teklif CTA.
4. Google Business Profile (Update, Offer): Yerel müşteri ihtiyacına uygun, ${targetCity} ve çevre illere odaklı yerel SEO, doğrudan 'Hemen Ara' veya 'Yol Tarifi Al' eyleme çağrısı.
5. Her taslak için: primaryKeyword, 3-5 adet secondaryKeywords, searchIntent ("commercial" | "transactional" | "informational"), 3 farklı alternativeHooks ve targetRegions üret.
6. KESİNLİKLE en fazla 5 hashtag kullan.
7. Anahtar kelime doldurma (keyword stuffing) yapma; metin akıcı ve doğal olsun. Sıralama garantisi verme.

SADECE geçerli JSON çıktısı üret:
{
  "campaignTitle": "Kampanya Başlığı",
  "seoOverview": {
    "coreTheme": "Ana Tema",
    "primaryKeywords": ["anahtar1", "anahtar2"],
    "geoTargets": ["${targetCity}", "Marmara"],
    "searchIntents": ["commercial", "transactional"]
  },
  "drafts": [
    {
      "platform": "instagram",
      "placement": "feed",
      "headline": "Başlık",
      "hook": "İlk cümle kancası",
      "caption": "Doğal ve profesyonel gönderi metni",
      "cta": "Eyleme çağrı",
      "hashtags": ["#Etiket1", "#Etiket2", "#Etiket3"],
      "primaryKeyword": "ana arama kelimesi",
      "secondaryKeywords": ["destek1", "destek2", "destek3"],
      "searchIntent": "commercial",
      "alternativeHooks": ["Kanca 1", "Kanca 2", "Kanca 3"],
      "targetRegions": ["${targetCity}"]
    }
  ]
}`;

    const rawResponse = await generateText(prompt, { responseMimeType: "application/json" });
    const cleanJson = rawResponse.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanJson);

    if (Array.isArray(parsed.drafts) && parsed.drafts.length > 0) {
      const generatedDrafts: SocialPlatformDraft[] = parsed.drafts.map((d: Record<string, unknown>) => {
        const platform = normalizePlatform(d.platform);
        const placement = normalizePlacement(d.placement);
        const targetUrlResolved = (typeof d.targetUrl === "string" && d.targetUrl.startsWith("http")) ? d.targetUrl : targetUrl;
        const mediaUrlResolved = (typeof d.mediaUrl === "string" && d.mediaUrl.startsWith("http")) ? d.mediaUrl : mediaUrl;

        const draftCandidate: SocialPlatformDraft = {
          id: crypto.randomUUID(),
          platform,
          placement,
          headline: String(d.headline || `${companyName} — ${analysis.primarySubject || "Modüler Çözüm"}`),
          hook: String(d.hook || "Projenize özel modüler yaşam ve çalışma alanları."),
          caption: String(d.caption || `${companyName} kalitesiyle üretilen konteyner çözümleri.`),
          cta: String(d.cta || "Detaylı bilgi ve teklif için bizimle iletişime geçin!"),
          hashtags: sanitizeHashtags(d.hashtags),
          targetUrl: targetUrlResolved,
          mediaUrl: mediaUrlResolved,
          scheduledAt: null,
          primaryKeyword: String(d.primaryKeyword || `${analysis.product_category || "konteyner"} modelleri`).toLowerCase(),
          secondaryKeywords: Array.isArray(d.secondaryKeywords) ? d.secondaryKeywords.map(String) : [],
          searchIntent: (d.searchIntent === "informational" || d.searchIntent === "transactional") ? d.searchIntent : "commercial",
          alternativeHooks: Array.isArray(d.alternativeHooks) ? d.alternativeHooks.map(String) : [],
          targetRegions: Array.isArray(d.targetRegions) ? d.targetRegions.map(String) : [targetCity],
          unverifiedClaimsWarning: null,
          qualityPassed: true,
          qualityNotes: [],
        };

        // Run Quality Gate Evaluation
        const qg = evaluateDraftQuality(draftCandidate, analysis, { companyName, allowedRegions: [targetCity] });
        draftCandidate.qualityPassed = qg.passed;
        draftCandidate.qualityNotes = [...qg.issues, ...qg.warnings];
        if (qg.warnings.some((w) => w.includes("fiyat") || w.includes("doğrulanamayan"))) {
          draftCandidate.unverifiedClaimsWarning = "Görselden doğrulanamayan iddialar içeriyor olabilir; yayınlamadan önce kontrol ediniz.";
        }

        return draftCandidate;
      });

      // Merge with fallback drafts to ensure all 8 standard placements exist
      const existingKeys = new Set(generatedDrafts.map((d) => `${d.platform}:${d.placement}`));
      const completeDrafts = [...generatedDrafts];
      for (const fallback of fallbackDrafts) {
        const key = `${fallback.platform}:${fallback.placement}`;
        if (!existingKeys.has(key)) {
          completeDrafts.push(fallback);
          existingKeys.add(key);
        }
      }

      // Check cross-platform distinctness
      const distinctness = verifyCrossPlatformDistinctness(completeDrafts);
      if (!distinctness.distinct) {
        // Tag distinctness notes
        completeDrafts.forEach((d) => {
          d.qualityNotes.push(...distinctness.warnings);
        });
      }

      return {
        campaignTitle: parsed.campaignTitle || `${companyName} ${analysis.primarySubject || "Modüler Yapı"} Kampanyası`,
        sourceMediaAnalysis: analysis,
        seoStrategy: {
          coreTheme: parsed.seoOverview?.coreTheme || analysis.detectedTheme || "Modüler Yapı ve Konteyner Çözümleri",
          primaryKeywords: Array.isArray(parsed.seoOverview?.primaryKeywords) ? parsed.seoOverview.primaryKeywords : ["konteyner ev", "şantiye ofis konteyneri"],
          geoTargets: Array.isArray(parsed.seoOverview?.geoTargets) ? parsed.seoOverview.geoTargets : [targetCity],
          searchIntents: Array.isArray(parsed.seoOverview?.searchIntents) ? parsed.seoOverview.searchIntents : ["commercial", "transactional"],
          disclaimer: "Arama motoru sıralaması veya GEO görünürlüğü garanti edilmez; doğal kullanıcı aramaları hedeflenmiştir.",
        },
        drafts: completeDrafts,
        generatedAt: new Date().toISOString(),
      };
    }
  } catch {
    // Graceful deterministic fallback
  }

  return {
    campaignTitle: `${companyName} ${analysis.primarySubject || "Modüler Yapı"} Kampanyası`,
    sourceMediaAnalysis: analysis,
    seoStrategy: {
      coreTheme: analysis.detectedTheme || "Modüler Yapı ve Yaşam Çözümleri",
      primaryKeywords: ["konteyner ev", "şantiye konteyneri", "ofis konteyneri"],
      geoTargets: [targetCity],
      searchIntents: ["commercial", "transactional"],
      disclaimer: "Arama motoru sıralaması veya GEO görünürlüğü garanti edilmez; doğal kullanıcı aramaları hedeflenmiştir.",
    },
    drafts: fallbackDrafts,
    generatedAt: new Date().toISOString(),
  };
}
