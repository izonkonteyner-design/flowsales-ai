import type { MediaAnalysisResult } from "@/server/services/media/domain";
import type { SocialPlatformDraft } from "./engine";

export interface QualityGateOptions {
  companyName?: string;
  allowedRegions?: string[];
  strict?: boolean;
}

export interface QualityGateResult {
  passed: boolean;
  score: number;
  issues: string[];
  warnings: string[];
}

const GENERIC_FLUFF_PHRASES = [
  "en iyi ve en kaliteli",
  "sektörün lideri olarak",
  "bizi tercih ettiğiniz için teşekkür ederiz",
  "kalitede bir numara",
  "harika ürünler sizleri bekliyor",
];

const RAW_FILE_NAME_REGEX = /\b(?:IMG_\d+|DSC_\d+|PXL_\d+|WhatsApp_Image|\w+\.(?:jpg|jpeg|png|webp|mov|mp4))\b/i;

/**
 * Evaluates a social platform draft against SEO, GEO, and truthful visual quality gates.
 */
export function evaluateDraftQuality(
  draft: SocialPlatformDraft,
  analysis: MediaAnalysisResult,
  _options: QualityGateOptions = {}
): QualityGateResult {
  const issues: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  const captionLower = (draft.caption || "").toLowerCase();
  const headlineLower = (draft.headline || "").toLowerCase();
  const combinedText = `${headlineLower} ${captionLower}`;

  // 1. Guard against raw file names leaking into customer-facing copy
  if (RAW_FILE_NAME_REGEX.test(draft.headline) || RAW_FILE_NAME_REGEX.test(draft.caption)) {
    issues.push("Metinde veya başlıkta ham dosya adı tespit edildi.");
    score -= 30;
  }

  // 2. Visual grounding check
  if (analysis.analysis_status === "ANALYZED" && !analysis.isFallback) {
    const visualAnchors = [
      ...analysis.detected_objects,
      ...analysis.visible_features,
      analysis.product_category,
      analysis.primarySubject,
    ]
      .filter(Boolean)
      .map((term) => term.toLowerCase());

    const hasVisualAnchor = visualAnchors.some((anchor) => {
      const words = anchor.split(/\s+/).filter((w) => w.length > 3);
      return words.some((w) => combinedText.includes(w));
    });

    if (!hasVisualAnchor && visualAnchors.length > 0) {
      warnings.push("Metin görsel analizinde tespit edilen nesneleri veya özellikleri doğrudan yansıtmıyor.");
      score -= 15;
    }
  }

  // 3. Fluff detection
  for (const fluff of GENERIC_FLUFF_PHRASES) {
    if (combinedText.includes(fluff)) {
      warnings.push(`Jenerik klişe ifade tespit edildi: "${fluff}". Somut ürün detaylarına odaklanılmalı.`);
      score -= 10;
    }
  }

  // 4. Strict hashtag limit (max 5)
  if (Array.isArray(draft.hashtags) && draft.hashtags.length > 5) {
    issues.push(`Hashtag sayısı 5 sınırını aşıyor (${draft.hashtags.length} adet).`);
    score -= 15;
  }

  // 5. Keyword stuffing check
  if (draft.primaryKeyword) {
    const kw = draft.primaryKeyword.toLowerCase();
    const matches = combinedText.split(kw).length - 1;
    if (matches > 3 && combinedText.length < 500) {
      warnings.push(`Anahtar kelime ("${draft.primaryKeyword}") kısa metinde gereğinden fazla tekrarlanmış (keyword stuffing riski).`);
      score -= 15;
    }
  }

  // 6. Verification of claims against unknown_or_unverified_details
  if (Array.isArray(analysis.unknown_or_unverified_details) && analysis.unknown_or_unverified_details.length > 0) {
    const priceClaimRegex = /\b\d{2,3}(?:\.\d{3})*\s*(?:tl|bin tl|₺|usd|\$|euro|€)\b/i;
    if (priceClaimRegex.test(combinedText)) {
      warnings.push("Görselde veya doğrulanmış katalogda bulunmayan kesin fiyat iddiası yer alıyor.");
      score -= 10;
    }
  }

  // 7. Platform-specific formatting rules
  if (draft.platform === "instagram") {
    if (!draft.hook || draft.hook.length < 10) {
      warnings.push("Instagram için dikkat çekici ilk cümle (hook) eksik veya çok kısa.");
      score -= 10;
    }
  } else if (draft.platform === "google") {
    if (!draft.cta || !/ara|yol tarifi|ziyaret|teklif|ulaş/i.test(draft.cta)) {
      warnings.push("Google Business Profile için yerel eyleme çağrı (Ara/Yol Tarifi) bulunamadı.");
      score -= 5;
    }
  } else if (draft.platform === "youtube") {
    if (!draft.headline || !draft.headline.toLowerCase().includes(draft.primaryKeyword?.toLowerCase() || "")) {
      // Small note, not a blocker
      warnings.push("YouTube başlığının aranma hacmi için ana anahtar kelimeyi içermesi önerilir.");
    }
  }

  const passed = issues.length === 0 && score >= 60;

  return {
    passed,
    score: Math.max(0, Math.min(100, score)),
    issues,
    warnings,
  };
}

/**
 * Checks text similarity across platforms to ensure no copy-paste repetition.
 */
export function verifyCrossPlatformDistinctness(drafts: SocialPlatformDraft[]): {
  distinct: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  for (let i = 0; i < drafts.length; i++) {
    for (let j = i + 1; j < drafts.length; j++) {
      const d1 = drafts[i];
      const d2 = drafts[j];
      if (d1.platform !== d2.platform) {
        const text1 = d1.caption.trim().toLowerCase();
        const text2 = d2.caption.trim().toLowerCase();
        if (text1.length > 50 && text1 === text2) {
          warnings.push(`${d1.platform} ve ${d2.platform} için birebir aynı metin üretilmiş. Platforma özel özgün metin gereklidir.`);
        }
      }
    }
  }

  return {
    distinct: warnings.length === 0,
    warnings,
  };
}
