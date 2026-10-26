import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { getGeminiClient, hasGeminiConfig, getGeminiModel } from "@/server/services/ai";
import {
  validateMediaFile,
  MediaAnalysisResult,
  MarketingMediaAsset,
  MediaKind,
  mediaAnalysisResultSchema,
} from "./domain";

const ASSET_BUCKET = "workspace-assets";

/**
 * Analyzes uploaded image or video using Gemini free tier if available,
 * or safely falls back with isFallback=true without faking vision results.
 */
export async function analyzeMarketingMedia(params: {
  mediaType: MediaKind;
  mimeType: string;
  base64Data?: string;
  fileName: string;
}): Promise<MediaAnalysisResult> {
  const { mediaType, mimeType, base64Data, fileName } = params;

  // If Gemini is not configured or image data is missing
  if (!hasGeminiConfig() || !base64Data || mediaType === "video") {
    const reason = mediaType === "video"
      ? "Video formatı doğrudan görsel API çözümlemesi için uygun değil; meta veri ve dosya adı temel alındı."
      : !hasGeminiConfig()
      ? "Gemini API anahtarı yapılandırılmamış."
      : "Medya ikili verisi mevcut değil.";

    return {
      productOrService: "İzon Konteyner & Prefabrik Yapılar",
      primarySubject: fileName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
      detectedTheme: "Endüstriyel Yapı, Konteyner ve Ofis Çözümleri",
      suggestedAudience: "Şantiye yöneticileri, ticari işletmeler, villa/bahçe sahipleri",
      keyFeatures: ["Yüksek izolasyon", "Hızlı sevkiyat", "Dayanıklı çelik konstrüksiyon"],
      visualTone: "Profesyonel, sağlam, kurumsal",
      marketingAngle: "Hızlı kurulum, uzun ömürlü kullanım ve fabrika çıkışı garantisi",
      suitablePlatforms: ["instagram", "facebook", "google", "youtube"],
      summary: `Dosya: ${fileName}. ${reason}`,
      isFallback: true,
      fallbackReason: reason,
    };
  }

  try {
    const aiClient = getGeminiClient();
    const model = getGeminiModel();

    const prompt = `
Aşağıdaki görseli bir dijital pazarlama uzmanı gözüyle analiz et.
FlowSales AI - İzon Konteyner (konteyner, prefabrik, modüler yaşam ve çalışma alanları) bağlamında şu bilgileri Türkçe olarak JSON formatında üret:
{
  "productOrService": "Görseldeki ana ürün veya hizmet adı",
  "primarySubject": "Görselin ana konusu (örn: 3x7 Yaşam Konteyneri, Ofis Konteyneri, Şantiye Çözümü)",
  "detectedTheme": "Görselin atmosferi ve teması (örn: Modern mimari, sağlam şantiye yapısı, ferah yaşam alanı)",
  "suggestedAudience": "Bu görsele en çok ilgi gösterecek hedef kitle",
  "keyFeatures": ["öne çıkan 3-4 görsel veya teknik özellik"],
  "visualTone": "Görselin yarattığı duygu ve kurumsal ton",
  "marketingAngle": "Sosyal medya ve reklamlarda vurgulanması gereken en güçlü satış açısı",
  "suitablePlatforms": ["instagram", "facebook", "google", "youtube"],
  "summary": "1-2 cümlelik görsel özeti"
}
Sadece geçerli JSON çıktısı ver, markdown kod blokları arasına alabilirsin.
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
    });

    const text = response.text || "";
    const cleanJson = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanJson);

    return mediaAnalysisResultSchema.parse({
      ...parsed,
      isFallback: false,
      fallbackReason: null,
    });
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    return {
      productOrService: "İzon Konteyner Çözümleri",
      primarySubject: fileName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
      detectedTheme: "Modüler Yapı ve Yaşam Çözümleri",
      suggestedAudience: "Prefabrik ve konteyner ilgilileri",
      keyFeatures: ["Sağlam profil", "Isı yalıtımı", "Kolay taşınabilirlik"],
      visualTone: "Güvenilir, estetik, fonksiyonel",
      marketingAngle: "Hızlı üretim, kaliteli malzeme ve cazip fiyatlar",
      suitablePlatforms: ["instagram", "facebook", "google", "youtube"],
      summary: `Otomatik model analizi sırasında istisna oluştu (${errMessage.slice(0, 100)}). Güvenli bağlam devrede.`,
      isFallback: true,
      fallbackReason: `Model çağrısı başarısız: ${errMessage.slice(0, 150)}`,
    };
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

  // 4. Run Multimodal Analysis (images < 4MB pass base64 to Gemini)
  let base64Data: string | undefined = undefined;
  if (mediaType === "image" && fileSizeBytes <= 4 * 1024 * 1024) {
    base64Data = fileBuffer.toString("base64");
  }

  const analysisResult = await analyzeMarketingMedia({
    mediaType,
    mimeType: fileType,
    base64Data,
    fileName,
  });

  const analysisStatus = analysisResult.isFallback ? "fallback" : "completed";

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
      analysis_status: analysisStatus,
      analysis_result: analysisResult,
      created_by: userId ?? null,
    })
    .select()
    .single();

  if (dbError || !inserted) {
    // If table does not exist or insert fails, return memory mapped object
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
      analysisStatus,
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
