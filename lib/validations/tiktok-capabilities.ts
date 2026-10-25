// ============================================================================
// TikTok Capability Model (Client & Server shared)
//
// Distinguishes account connection, basic profile access, video upload,
// and direct publishing authorization without bypassing TikTok Developer App Review.
// ============================================================================

export type TikTokCapability = {
  accountConnected: boolean;
  basicProfileAccess: boolean;
  videoUploadAuthorized: boolean;
  directPublishAuthorized: boolean;
  grantedScopes: string[];
  missingPermissions: string[];
  appReviewStatus: "fully_authorized" | "partially_authorized" | "pending_review";
  explanation: string;
};

export function resolveTikTokCapabilities(scopes: string[]): TikTokCapability {
  const scopeSet = new Set((scopes || []).map((s) => s.trim().toLowerCase()));

  const basicProfile =
    scopeSet.has("user.info.basic") || scopeSet.has("user.info.profile");
  const videoUpload = scopeSet.has("video.upload");
  const directPublish = scopeSet.has("video.publish");

  const missing: string[] = [];
  if (!basicProfile) missing.push("user.info.basic (Temel Profil Erişimi)");
  if (!videoUpload) missing.push("video.upload (Video Yükleme Erişimi)");
  if (!directPublish) missing.push("video.publish (Doğrudan Yayınlama İzni)");

  let appReviewStatus: TikTokCapability["appReviewStatus"] = "fully_authorized";
  let explanation = "TikTok hesabı tüm yayınlama ve analiz izinleriyle bağlı.";

  if (!directPublish && !videoUpload) {
    appReviewStatus = "partially_authorized";
    explanation =
      "Temel profil bağlı. Video yükleme ve doğrudan yayınlama izinleri için TikTok Geliştirici İncelemesi (App Review) gereklidir.";
  } else if (!directPublish) {
    appReviewStatus = "partially_authorized";
    explanation =
      "Hesap bağlı ve video yükleme yetkisi mevcut. Doğrudan yayınlama (video.publish) için TikTok App Review onayı bekleniyor.";
  }

  return {
    accountConnected: true,
    basicProfileAccess: basicProfile,
    videoUploadAuthorized: videoUpload,
    directPublishAuthorized: directPublish,
    grantedScopes: scopes || [],
    missingPermissions: missing,
    appReviewStatus,
    explanation,
  };
}
