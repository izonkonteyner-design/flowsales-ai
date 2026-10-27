import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { getGeminiClient, hasGeminiConfig, getGeminiModel } from "@/server/services/ai";
import {
  validateMediaFile,
  MediaAnalysisResult,
  MarketingMediaAsset,
  MediaKind,
  mediaAnalysisResultSchema,
  ManualMediaInput,
  MediaAnalysisStructuredStatus,
  MAX_IMAGE_SIZE_BYTES,
} from "./domain";

const ASSET_BUCKET = "workspace-assets";

/**
 * Classifies Gemini errors into truthful runtime statuses.
 */
function classifyVisionError(error: unknown): {
  status: MediaAnalysisStructuredStatus;
  message: string;
} {
  const rawMsg = error instanceof Error ? error.message : String(error);
  if (/429|quota|rate limit|resource exhausted/i.test(rawMsg)) {
    return {
      status: "RATE_LIMITED",
      message: "Gemini API kotası veya hız limiti aşıldı (429 / Rate Limit). Lütfen biraz bekleyin veya ürün bilgilerini manuel girin.",
    };
  }
  if (/401|403|api key|unauthenticated|permission denied/i.test(rawMsg)) {
    return {
      status: "PROVIDER_UNAVAILABLE",
      message: "Gemini API anahtarı geçersiz veya yetkisiz. Lütfen sunucu ortam değişkenlerini kontrol edin.",
    };
  }
  return {
    status: "FAILED",
    message: `Görsel ayrıştırma hatası: ${rawMsg.slice(0, 150)}`,
  };
}

/**
 * Analyzes uploaded image using Gemini multimodal vision API,
 * or truthfully reports why analysis is not available without inventing fake attributes.
 */
export async function analyzeMarketingMedia(params: {
  mediaType: MediaKind;
  mimeType: string;
  base64Data?: string;
  fileName: string;
  manualInput?: ManualMediaInput;
}): Promise<MediaAnalysisResult> {
  const { mediaType, mimeType, base64Data, fileName, manualInput } = params;

  // 1. Guard against non-analyzable media or missing configuration
  if (!hasGeminiConfig() || !base64Data || mediaType === "video") {
    let status: MediaAnalysisStructuredStatus = "NEEDS_INPUT";
    let reason = "Medya ikili verisi mevcut değil.";

    if (mediaType === "video") {
      status = "NEEDS_INPUT";
      reason = "Video formatı doğrudan görsel API çözümlemesi için uygun değil; meta veri ve dosya adı temel alındı.";
    } else if (!hasGeminiConfig()) {
      status = "PROVIDER_UNAVAILABLE";
      reason = "Gemini API anahtarı yapılandırılmamış.";
    }

    if (manualInput && (manualInput.productOrService || manualInput.productCategory)) {
      const subject = manualInput.productOrService || manualInput.productCategory || "Konteyner Çözümü";
      return mediaAnalysisResultSchema.parse({
        detected_objects: manualInput.features || [],
        visual_description: `Kullanıcı tarafından sağlanan ürün bilgisi: ${subject}. ${manualInput.notes || ""}`.trim(),
        product_category: manualInput.productCategory || "Modüler Konteyner Yapı",
        visible_features: manualInput.features || [],
        visible_text: [],
        possible_use_cases: ["Şantiye ofisi", "Yaşam alanı", "Ticari showroom"],
        confidence: 1.0,
        unknown_or_unverified_details: ["Görsel modeli devre dışı; doğrulanmış kullanıcı girdisi kullanıldı."],
        analysis_provider: "manual",
        analysis_model: "manual-input",
        analysis_status: "ANALYZED",
        analyzed_at: new Date().toISOString(),

        productOrService: subject,
        primarySubject: subject,
        detectedTheme: manualInput.marketingAngle || "Dayanıklı ve Fonksiyonel Modüler Yapı",
        suggestedAudience: manualInput.targetAudience || "Müteahhitler, işletmeler ve bireysel kullanıcılar",
        keyFeatures: manualInput.features || ["Yüksek izolasyon", "Hızlı sevkiyat", "Dayanıklı çelik konstrüksiyon"],
        visualTone: "Profesyonel, sağlam, kurumsal",
        marketingAngle: manualInput.marketingAngle || "Hızlı kurulum, uzun ömürlü kullanım ve fabrika çıkışı garantisi",
        suitablePlatforms: ["instagram", "facebook", "google", "youtube"],
        summary: `Doğrulanmış ürün girdisi: ${subject}.`,
        isFallback: false,
        fallbackReason: null,
      });
    }

    return mediaAnalysisResultSchema.parse({
      detected_objects: [],
      visual_description: "",
      product_category: "",
      visible_features: [],
      visible_text: [],
      possible_use_cases: [],
      confidence: 0,
      unknown_or_unverified_details: [
        "Görsel içeriği yapay zekâ tarafından otomatik olarak doğrulanamadı.",
        reason,
      ],
      analysis_provider: "none",
      analysis_model: getGeminiModel(),
      analysis_status: status,
      analyzed_at: new Date().toISOString(),

      // Backward compatibility fallback fields
      productOrService: "İzon Konteyner & Prefabrik Yapılar",
      primarySubject: "",
      detectedTheme: "Modüler Yapı ve Konteyner Çözümleri",
      suggestedAudience: "Şantiye yöneticileri, ticari işletmeler, villa ve bahçe sahipleri",
      keyFeatures: [],
      visualTone: "Profesyonel ve kurumsal",
      marketingAngle: "Hızlı kurulum, fabrika güvencesi ve uzun ömürlü modüler yapılar",
      suitablePlatforms: ["instagram", "facebook", "google", "youtube"],
      summary: `Dosya: ${fileName}. ${reason}`,
      isFallback: true,
      fallbackReason: reason,
    });
  }

  // 2. Execute Real Multimodal Vision Call
  try {
    const aiClient = getGeminiClient();
    const model = getGeminiModel();

    const prompt = `
Sen profesyonel bir endüstriyel ürün ve mimari görsel analiz uzmanısın.
Bu görsel İzon Konteyner pazarlama ve satış operasyonları için inceleniyor.

Görseli son derece dikkatli, nesnel ve gerçekçi biçimde analiz et.
SADECE görselde gerçekten görünen fiziksel nesneleri, renkleri, malzemeleri ve mimari detayları temel al.
Görselde açıkça görünmeyen hiçbir teknik özelliği (örneğin yangın sınıfı, izolasyon cinsi, milimetrik sac kalınlığı, garanti süresi, fiyat gibi) uydurma veya tahmin etme. Bilinmeyen veya görselden doğrulanamayan detayları unknown_or_unverified_details listesine ekle.
Dosya adını (${fileName}) kesinlikle bir ürün adı olarak kullanma veya baz alma; yalnızca piksellere odaklan.

Aşağıdaki JSON şemasına BİREBİR uygun, geçerli bir JSON çıktısı üret:
{
  "detected_objects": ["Görselde tespit edilen ana nesneler; örn: modüler yaşam konteyneri, antrasit kompozit cephe, sürgülü cam kapı, çelik konstrüksiyon..."],
  "visual_description": "Görselin 2-3 cümlelik objektif, detaylı ve canlı görsel tasviri.",
  "product_category": "Ürünün ana kategorisi (örn: Konteyner Ev / Şantiye Ofis Konteyneri / Yaşam Konteyneri / Güvenlik Kabini / Özel Tasarım Modüler Yapı / Sanitasyon WC-Duş)",
  "visible_features": ["Görselde bizzat seçilebilen 3-6 belirgin görsel/yapısal özellik"],
  "visible_text": ["Görsel üzerinde okunan herhangi bir yazı, marka, etiket veya plaka varsa listele; yoksa boş liste bırak"],
  "possible_use_cases": ["Görseldeki ürünün kullanılabileceği 3-5 gerçekçi kullanım senaryosu"],
  "confidence": 0.95,
  "unknown_or_unverified_details": ["Görselden doğrulanamayan özellikler; örn: net metrekare ölçüsü, iç mekan bölmeleri, fiyat, nakliye dahil olup olmadığı vb."],
  "productOrService": "Görselde görülen spesifik ürün veya yapı adı",
  "primarySubject": "Görselin ana konusu (örn: Lüks Konteyner Ev veya Standart Şantiye Ofis Konteyneri)",
  "detectedTheme": "Görselin yarattığı atmosfer (örn: Modern Doğal Yaşam, Ağır Şantiye Koşulları, Kurumsal Ofis)",
  "suggestedAudience": "Bu ürüne ihtiyaç duyacak birincil hedef kitle",
  "keyFeatures": ["Görselle uyumlu 3-4 kilit pazarlama özelliği"],
  "visualTone": "Görselin tonu ve hissi (örn: Prestijli, sağlam, ferah, dayanıklı)",
  "marketingAngle": "Bu görsel için en etkili satış ve ikna açısı",
  "suitablePlatforms": ["instagram", "facebook", "google", "youtube"],
  "summary": "Pazarlama ekibi için 1-2 cümlelik özet"
}
Sadece geçerli JSON çıktısı ver.
`;

    const response = await aiClient.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text || "";
    const cleanJson = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanJson);

    return mediaAnalysisResultSchema.parse({
      ...parsed,
      detected_objects: Array.isArray(parsed.detected_objects) ? parsed.detected_objects : [],
      visual_description: String(parsed.visual_description || ""),
      product_category: String(parsed.product_category || "Modüler Konteyner Yapı"),
      visible_features: Array.isArray(parsed.visible_features) ? parsed.visible_features : (parsed.keyFeatures || []),
      visible_text: Array.isArray(parsed.visible_text) ? parsed.visible_text : [],
      possible_use_cases: Array.isArray(parsed.possible_use_cases) ? parsed.possible_use_cases : [],
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.95,
      unknown_or_unverified_details: Array.isArray(parsed.unknown_or_unverified_details)
        ? parsed.unknown_or_unverified_details
        : ["Net metrekare, iç tesisat detayları ve fiyat bilgisi görselden doğrulanamadı."],
      analysis_provider: "gemini",
      analysis_model: model,
      analysis_status: "ANALYZED",
      analyzed_at: new Date().toISOString(),
      isFallback: false,
      fallbackReason: null,
    });
  } catch (error) {
    const { status, message } = classifyVisionError(error);

    // If manual input was provided, gracefully rescue with manual data
    if (manualInput && (manualInput.productOrService || manualInput.productCategory)) {
      const subject = manualInput.productOrService || manualInput.productCategory || "Konteyner Çözümü";
      return mediaAnalysisResultSchema.parse({
        detected_objects: manualInput.features || [],
        visual_description: `Kullanıcı tarafından sağlanan ürün bilgisi: ${subject}. ${manualInput.notes || ""}`.trim(),
        product_category: manualInput.productCategory || "Modüler Konteyner Yapı",
        visible_features: manualInput.features || [],
        visible_text: [],
        possible_use_cases: ["Şantiye ofisi", "Yaşam alanı", "Ticari showroom"],
        confidence: 1.0,
        unknown_or_unverified_details: [`Görsel modeli hata verdi (${message}); kullanıcı girdisi kullanıldı.`],
        analysis_provider: "manual",
        analysis_model: getGeminiModel(),
        analysis_status: "ANALYZED",
        analyzed_at: new Date().toISOString(),

        productOrService: subject,
        primarySubject: subject,
        detectedTheme: manualInput.marketingAngle || "Dayanıklı ve Fonksiyonel Modüler Yapı",
        suggestedAudience: manualInput.targetAudience || "Müşteriler ve işletmeler",
        keyFeatures: manualInput.features || ["Yüksek izolasyon", "Hızlı sevkiyat", "Dayanıklı çelik konstrüksiyon"],
        visualTone: "Profesyonel, sağlam, kurumsal",
        marketingAngle: manualInput.marketingAngle || "Hızlı kurulum ve fabrika çıkışı garantisi",
        suitablePlatforms: ["instagram", "facebook", "google", "youtube"],
        summary: `Manuel ürün girdisi: ${subject}.`,
        isFallback: false,
        fallbackReason: null,
      });
    }

    // Truthful fallback: never fake visual features or use file name
    return mediaAnalysisResultSchema.parse({
      detected_objects: [],
      visual_description: "",
      product_category: "",
      visible_features: [],
      visible_text: [],
      possible_use_cases: [],
      confidence: 0,
      unknown_or_unverified_details: [
        "Görsel analizi yapılamadı.",
        message,
        "Lütfen ürün bilgilerini manuel olarak girin.",
      ],
      analysis_provider: "none",
      analysis_model: getGeminiModel(),
      analysis_status: status,
      analyzed_at: new Date().toISOString(),

      productOrService: "İzon Konteyner Çözümleri",
      primarySubject: "",
      detectedTheme: "Modüler Yapı ve Yaşam Çözümleri",
      suggestedAudience: "Prefabrik ve konteyner ilgilileri",
      keyFeatures: [],
      visualTone: "Güvenilir, estetik, fonksiyonel",
      marketingAngle: "Hızlı üretim, kaliteli malzeme ve cazip fiyatlar",
      suitablePlatforms: ["instagram", "facebook", "google", "youtube"],
      summary: message,
      isFallback: true,
      fallbackReason: message,
    });
  }
}

/**
 * Uploads, validates, and analyzes a media asset for a workspace.
 */
export async function uploadMarketingMediaAsset(params: {
  organizationId: string;
  userId?: string | null;
  fileBuffer: Buffer;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  manualInput?: ManualMediaInput;
}): Promise<MarketingMediaAsset> {
  const {
    organizationId,
    userId,
    fileBuffer,
    fileName,
    fileType,
    fileSizeBytes,
    width,
    height,
    durationSeconds,
    manualInput,
  } = params;

  // 1. Validate file constraints
  const validation = validateMediaFile({
    name: fileName,
    type: fileType,
    size: fileSizeBytes,
  });

  if (!validation.valid || !validation.mediaType) {
    throw new Error(validation.error || "Geçersiz medya dosyası.");
  }

  const mediaType = validation.mediaType;

  // 2. Storage path: organizations/{orgId}/marketing-media/{timestamp}-{safeName}
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `organizations/${organizationId}/marketing-media/${Date.now()}_${sanitizedName}`;

  const supabase = createSupabaseAdminClient();

  // 3. Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(ASSET_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: fileType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Medya yükleme başarısız: ${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage
    .from(ASSET_BUCKET)
    .getPublicUrl(storagePath);

  const publicUrl = publicUrlData.publicUrl;

  // 4. Run Multimodal Analysis for all allowed images up to MAX_IMAGE_SIZE_BYTES (10MB)
  let base64Data: string | undefined = undefined;
  if (mediaType === "image" && fileSizeBytes <= MAX_IMAGE_SIZE_BYTES) {
    base64Data = fileBuffer.toString("base64");
  }

  const analysisResult = await analyzeMarketingMedia({
    mediaType,
    mimeType: fileType,
    base64Data,
    fileName,
    manualInput,
  });

  // Map structured status to database column status
  let dbAnalysisStatus: "completed" | "fallback" | "failed" = "completed";
  if (analysisResult.analysis_status === "ANALYZED") {
    dbAnalysisStatus = "completed";
  } else if (analysisResult.analysis_status === "RATE_LIMITED" || analysisResult.analysis_status === "PROVIDER_UNAVAILABLE") {
    dbAnalysisStatus = "fallback";
  } else {
    dbAnalysisStatus = "failed";
  }

  // 5. Persist record in database
  const { data: inserted, error: dbError } = await supabase
    .from("marketing_media_assets")
    .insert({
      organization_id: organizationId,
      storage_path: storagePath,
      public_url: publicUrl,
      file_name: fileName,
      file_type: fileType,
      file_size_bytes: fileSizeBytes,
      media_type: mediaType,
      width: width ?? null,
      height: height ?? null,
      duration_seconds: durationSeconds ?? null,
      analysis_status: dbAnalysisStatus,
      analysis_result: analysisResult,
      created_by: userId ?? null,
    })
    .select()
    .single();

  if (dbError || !inserted) {
    // If table insert fails, return memory mapped object
    return {
      id: crypto.randomUUID(),
      organizationId,
      storagePath,
      publicUrl,
      fileName,
      fileType,
      fileSizeBytes,
      mediaType,
      width: width ?? null,
      height: height ?? null,
      durationSeconds: durationSeconds ?? null,
      analysisStatus: dbAnalysisStatus,
      analysisResult,
      createdBy: userId ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    id: inserted.id,
    organizationId: inserted.organization_id,
    storagePath: inserted.storage_path,
    publicUrl: inserted.public_url,
    fileName: inserted.file_name,
    fileType: inserted.file_type,
    fileSizeBytes: inserted.file_size_bytes,
    mediaType: inserted.media_type,
    width: inserted.width,
    height: inserted.height,
    durationSeconds: inserted.duration_seconds ? Number(inserted.duration_seconds) : null,
    analysisStatus: inserted.analysis_status,
    analysisResult: inserted.analysis_result,
    createdBy: inserted.created_by,
    createdAt: inserted.created_at,
    updatedAt: inserted.updated_at,
  };
}

/**
 * Re-analyzes an existing marketing media asset, optionally applying manual input.
 */
export async function reanalyzeMarketingMediaAsset(params: {
  assetId: string;
  organizationId: string;
  manualInput?: ManualMediaInput;
}): Promise<MarketingMediaAsset | null> {
  const supabase = createSupabaseAdminClient();
  const { data: asset, error } = await supabase
    .from("marketing_media_assets")
    .select("*")
    .eq("id", params.assetId)
    .eq("organization_id", params.organizationId)
    .single();

  if (error || !asset) return null;

  let base64Data: string | undefined = undefined;
  if (asset.media_type === "image") {
    // Download binary from storage
    const { data: fileBlob } = await supabase.storage
      .from(ASSET_BUCKET)
      .download(asset.storage_path);

    if (fileBlob) {
      const arrayBuffer = await fileBlob.arrayBuffer();
      base64Data = Buffer.from(arrayBuffer).toString("base64");
    }
  }

  const analysisResult = await analyzeMarketingMedia({
    mediaType: asset.media_type,
    mimeType: asset.file_type,
    base64Data,
    fileName: asset.file_name,
    manualInput: params.manualInput,
  });

  let dbAnalysisStatus: "completed" | "fallback" | "failed" = "completed";
  if (analysisResult.analysis_status === "ANALYZED") {
    dbAnalysisStatus = "completed";
  } else if (analysisResult.analysis_status === "RATE_LIMITED" || analysisResult.analysis_status === "PROVIDER_UNAVAILABLE") {
    dbAnalysisStatus = "fallback";
  } else {
    dbAnalysisStatus = "failed";
  }

  const { data: updated } = await supabase
    .from("marketing_media_assets")
    .update({
      analysis_status: dbAnalysisStatus,
      analysis_result: analysisResult,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.assetId)
    .eq("organization_id", params.organizationId)
    .select()
    .single();

  if (!updated) return null;

  return {
    id: updated.id,
    organizationId: updated.organization_id,
    storagePath: updated.storage_path,
    publicUrl: updated.public_url,
    fileName: updated.file_name,
    fileType: updated.file_type,
    fileSizeBytes: updated.file_size_bytes,
    mediaType: updated.media_type,
    width: updated.width,
    height: updated.height,
    durationSeconds: updated.duration_seconds ? Number(updated.duration_seconds) : null,
    analysisStatus: updated.analysis_status,
    analysisResult: updated.analysis_result,
    createdBy: updated.created_by,
    createdAt: updated.created_at,
    updatedAt: updated.updated_at,
  };
}

/**
 * Lists marketing media assets for an organization.
 */
export async function getMarketingMediaAssets(
  organizationId: string,
  options: { limit?: number; offset?: number; mediaType?: MediaKind } = {}
): Promise<MarketingMediaAsset[]> {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("marketing_media_assets")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (options.mediaType) {
    query = query.eq("media_type", options.mediaType);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    storagePath: row.storage_path,
    publicUrl: row.public_url,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSizeBytes: row.file_size_bytes,
    mediaType: row.media_type,
    width: row.width,
    height: row.height,
    durationSeconds: row.duration_seconds ? Number(row.duration_seconds) : null,
    analysisStatus: row.analysis_status,
    analysisResult: row.analysis_result,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
