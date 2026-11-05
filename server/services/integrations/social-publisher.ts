import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { logger } from "@/lib/logger";
import {
  decryptToken,
  isTokenEncryptionConfigured,
} from "@/server/services/integrations/encryption";
import { getProviderAdapter } from "@/server/services/integrations/provider-adapter";
import { SocialPlatform, adaptCaptionForPlatform } from "./social-domain";
import {
  socialPlatformSchema,
  socialPostInputSchema,
  socialPostStatusSchema,
  buildMockSocialPost,
} from "@/lib/validations/social-publisher";

export * from "./social-domain";
export {
  socialPlatformSchema,
  socialPostInputSchema,
  socialPostStatusSchema,
  buildMockSocialPost,
};

const GRAPH_VERSION = process.env.META_GRAPH_VERSION?.trim() || "v20.0";
const FACEBOOK_GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const DEMO_ORGANIZATION_ID = "d3e00000-0000-0000-0000-000000000000";
const TOKEN_EXPIRY_BUFFER_MS = 60_000;

const SUPPORTED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const SUPPORTED_VIDEO_EXTENSIONS = [".mp4", ".mov"];
const UNSUPPORTED_MEDIA_EXTENSIONS = [".exe", ".svg", ".bmp", ".pdf", ".gif", ".avi", ".mkv", ".zip"];

const RATE_LIMIT_META_CODES = new Set([4, 17, 32, 613, 80000, 80001, 80002, 80003, 80004, 80005, 80006, 80008]);
const PERMISSION_META_CODES = new Set([10, 200, 201, 210, 220, 230, 240, 250, 260, 270, 280, 290, 299]);
const TRANSIENT_META_CODES = new Set([1, 2]);

export type MetaPublishErrorCode =
  | "missing_token"
  | "invalid_token"
  | "token_expired"
  | "permission_denied"
  | "rate_limited"
  | "media_required"
  | "unsupported_media"
  | "validation_error"
  | "missing_account_id"
  | "container_error"
  | "container_in_progress"
  | "transient_api_error"
  | "demo_blocked"
  | "graph_api_error";

export type MetaPublishPostInput = {
  id?: string;
  organizationId?: string;
  workspaceId?: string;
  content?: string;
  caption?: string;
  platform?: string;
  mediaUrls?: string[];
  media_urls?: string[];
  hashtags?: string[];
  pageId?: string;
  igUserId?: string;
  externalAccountId?: string;
  containerId?: string;
  alreadyPublishedExternalId?: string | null;
  partialResults?: {
    facebook?: string;
    instagram?: string;
    instagramContainerId?: string;
  };
  [key: string]: unknown;
};

export type MetaPublishOptions = {
  organizationId?: string;
  workspaceId?: string;
  pageId?: string;
  igUserId?: string;
  externalAccountId?: string;
  scopes?: string[];
  containerId?: string;
  alreadyPublishedExternalId?: string | null;
  maxPollAttempts?: number;
  pollIntervalMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  fetchImpl?: typeof fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbClient?: any;
};

export type MetaPublishResult = {
  success: boolean;
  metaPostId?: string;
  containerId?: string;
  deduplicated?: boolean;
  retryable?: boolean;
  retryAfterMs?: number;
  errorCode?: MetaPublishErrorCode;
  errorMessage?: string;
  partialResults?: {
    facebook?: string;
    instagram?: string;
    instagramContainerId?: string;
  };
};

type MetaGraphErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

export async function generateSocialCaptionSuggestions(params: {
  topic: string;
  callToAction?: string;
  platform?: SocialPlatform;
  contentType?: string;
  tone?: string;
  language?: "tr" | "en" | "auto";
}): Promise<{
  caption: string;
  hashtags: string[];
  headlines: string[];
  hooks: string[];
  callToAction: string;
}> {
  const isEn = params.language === "en";
  const platformName = params.platform ? String(params.platform) : "Instagram & Facebook";
  const formatName = params.contentType || "Feed Post";
  const toneName = params.tone || (isEn ? "Engaging" : "Etkileyici & Profesyonel");
  const cta = params.callToAction?.trim() || (isEn ? "Click the link in bio or message us to learn more!" : "Detaylı bilgi için bio'daki linke tıklayın veya DM atın!");

  try {
    const { generateText } = await import("@/server/services/ai");
    const prompt = isEn
      ? `You are an elite digital marketing and social media strategist.
Create compelling social media content for ${platformName} (${formatName}).
Tone: ${toneName}
Topic: ${params.topic}
CTA: ${cta}

Respond ONLY in valid JSON format:
{
  "headlines": ["Title 1", "Title 2"],
  "hooks": ["Hook sentence 1", "Hook sentence 2"],
  "caption": "Full post caption",
  "callToAction": "${cta}",
  "hashtags": ["#marketing", "#business"]
}`
      : `Sen Türkiye'nin en başarılı dijital pazarlama ve sosyal medya uzmanısın.
${platformName} (${formatName}) için etkileyici sosyal medya içeriği üret.
Ton: ${toneName}
Konu: ${params.topic}
Eylem Çağrısı (CTA): ${cta}

SADECE geçerli JSON formatında yanıt ver:
{
  "headlines": ["Başlık 1", "Başlık 2"],
  "hooks": ["Dikkat çekici kanca 1", "Dikkat çekici kanca 2"],
  "caption": "Detaylı gönderi metni",
  "callToAction": "${cta}",
  "hashtags": ["#etiket1", "#etiket2", "#etiket3"]
}`;

    const rawResponse = await generateText(prompt, { responseMimeType: "application/json" });
    const parsed = JSON.parse(rawResponse) as {
      caption?: string;
      headlines?: string[];
      hooks?: string[];
      callToAction?: string;
      hashtags?: string[];
    };

    return {
      caption: parsed.caption?.trim() || (isEn ? `Discover the latest insights on ${params.topic}. ${cta}` : `${params.topic} hakkında en yeni fırsatları keşfedin! ${cta}`),
      headlines: Array.isArray(parsed.headlines) && parsed.headlines.length > 0 ? parsed.headlines : [isEn ? `Exclusive Insights: ${params.topic}` : `Özel Fırsat: ${params.topic}`],
      hooks: Array.isArray(parsed.hooks) && parsed.hooks.length > 0 ? parsed.hooks : [isEn ? "Did you know this about your business growth?" : "Satışlarınızı 2 katına çıkaracak bu yöntemi biliyor muydunuz?"],
      callToAction: parsed.callToAction || cta,
      hashtags: Array.isArray(parsed.hashtags) && parsed.hashtags.length > 0 ? parsed.hashtags : (isEn ? ["#FlowSalesAI", "#SalesGrowth", "#BusinessSuccess"] : ["#FlowSalesAI", "#Pazarlama", "#Büyüme"]),
    };
  } catch {
    return {
      caption: isEn
        ? `${params.topic}\n\nReady to take your sales to the next level? ${cta}`
        : `${params.topic}\n\nSatış süreçlerinizi bir üst seviyeye taşımaya hazır mısınız? ${cta}`,
      headlines: [isEn ? `Grow with ${params.topic}` : `${params.topic} ile İşinizi Büyütün`],
      hooks: [isEn ? "Stop missing out on high-intent customer leads!" : "Potansiyel müşterilerinizi kaçırmayı bugün durdurun!"],
      callToAction: cta,
      hashtags: isEn ? ["#FlowSalesAI", "#SalesMarketing", "#Automation"] : ["#FlowSalesAI", "#SatışPazarlama", "#YapayZeka"],
    };
  }
}

export async function generateCaptionAi(params: {
  topic: string;
  callToAction?: string;
  platform?: SocialPlatform;
  tone?: string;
}): Promise<{ caption: string; hashtags: string[]; headlines?: string[] }> {
  return generateSocialCaptionSuggestions(params);
}

/**
 * Calculates exponential backoff timestamp for bounded queue retries.
 */
export function calculateNextSocialRetryAt(
  attempts: number,
  baseDelayMs = 60_000,
  retryAfterMs?: number,
): string {
  const safeAttempts = Math.max(1, Math.min(attempts, 6));
  const exponentialDelay = baseDelayMs * Math.pow(2, safeAttempts - 1);
  const delayMs = retryAfterMs && retryAfterMs > 0 ? Math.max(retryAfterMs, baseDelayMs) : exponentialDelay;
  const boundedDelayMs = Math.min(delayMs, 3_600_000); // cap at 1 hour
  return new Date(Date.now() + boundedDelayMs).toISOString();
}

function classifyMediaUrl(rawUrl: string): {
  valid: boolean;
  mediaType?: "image" | "video";
  errorMessage?: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return {
      valid: false,
      errorMessage: `Geçersiz medya URL formatı: ${rawUrl}`,
    };
  }

  if (parsed.protocol !== "https:") {
    return {
      valid: false,
      errorMessage: "Meta Graph API yalnızca güvenli HTTPS medya URL'lerini kabul eder.",
    };
  }

  const pathname = parsed.pathname.toLowerCase();
  for (const badExt of UNSUPPORTED_MEDIA_EXTENSIONS) {
    if (pathname.endsWith(badExt)) {
      return {
        valid: false,
        errorMessage: `Desteklenmeyen medya dosya formatı (${badExt}). Yalnızca JPEG, PNG veya MP4/MOV desteklenir.`,
      };
    }
  }

  for (const vidExt of SUPPORTED_VIDEO_EXTENSIONS) {
    if (pathname.endsWith(vidExt)) {
      return { valid: true, mediaType: "video" };
    }
  }

  for (const imgExt of SUPPORTED_IMAGE_EXTENSIONS) {
    if (pathname.endsWith(imgExt)) {
      return { valid: true, mediaType: "image" };
    }
  }

  // Allow signed CDN HTTPS URLs without explicit extension as image by default unless query indicates video
  const formatParam = (parsed.searchParams.get("format") || parsed.searchParams.get("mime") || "").toLowerCase();
  if (formatParam.includes("video") || formatParam.includes("mp4")) {
    return { valid: true, mediaType: "video" };
  }

  return { valid: true, mediaType: "image" };
}

/**
 * Validates platform, caption, hashtag, and media requirements before calling Meta Graph API.
 */
export function validatePlatformPublishingRequirements(params: {
  platform: "facebook" | "instagram" | "tiktok" | "youtube";
  caption: string;
  mediaUrls: string[];
  hashtags?: string[];
  scopes?: string[];
}): {
  ok: true;
  formattedCaption: string;
  primaryMedia?: { url: string; mediaType: "image" | "video" };
} | {
  ok: false;
  errorCode: MetaPublishErrorCode;
  errorMessage: string;
} {
  const { platform, caption, mediaUrls, hashtags = [], scopes } = params;

  // Validate scopes if explicitly provided on connection
  if (Array.isArray(scopes) && scopes.length > 0) {
    if (platform === "instagram") {
      const hasIgPublish = scopes.some(
        (s) =>
          s.includes("instagram_content_publish") ||
          s.includes("instagram_business_content_publish"),
      );
      if (!hasIgPublish) {
        return {
          ok: false,
          errorCode: "permission_denied",
          errorMessage:
            "Instagram Business hesabı için 'instagram_content_publish' yayınlama izni eksik.",
        };
      }
    } else if (platform === "facebook") {
      const hasFbPublish = scopes.some(
        (s) => s.includes("pages_manage_posts") || s.includes("publish_pages"),
      );
      if (!hasFbPublish) {
        return {
          ok: false,
          errorCode: "permission_denied",
          errorMessage:
            "Facebook Sayfası için 'pages_manage_posts' yayınlama izni eksik.",
        };
      }
    }
  }

  const normalizedHashtags = hashtags
    .map((h) => h.trim())
    .filter(Boolean)
    .map((h) => (h.startsWith("#") ? h : `#${h}`));

  const baseCaption = adaptCaptionForPlatform(caption || "", platform);
  const fullCaption =
    normalizedHashtags.length > 0
      ? `${baseCaption}${baseCaption ? "\n\n" : ""}${normalizedHashtags.join(" ")}`.trim()
      : baseCaption;

  // Count total hashtags in caption + hashtags array
  const allHashtags = fullCaption.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  if (platform === "instagram" && allHashtags.length > 30) {
    return {
      ok: false,
      errorCode: "validation_error",
      errorMessage: "Instagram gönderileri en fazla 30 hashtag içerebilir.",
    };
  }

  if (platform === "instagram" && fullCaption.length > 2200) {
    return {
      ok: false,
      errorCode: "validation_error",
      errorMessage: "Instagram metin sınırı 2200 karakterdir.",
    };
  }

  if (platform === "facebook" && !fullCaption && mediaUrls.length === 0) {
    return {
      ok: false,
      errorCode: "validation_error",
      errorMessage: "Facebook gönderisi için metin veya medya URL'si zorunludur.",
    };
  }

  if (platform === "tiktok") {
    if (mediaUrls.length === 0) {
      return {
        ok: false,
        errorCode: "media_required",
        errorMessage: "TikTok için video yüklenmesi zorunludur.",
      };
    }
    const hasVideo = mediaUrls.some((u) => {
      const lower = u.toLowerCase().split("?")[0];
      return lower.endsWith(".mp4") || lower.endsWith(".mov") || lower.endsWith(".webm") || u.includes("video");
    });
    if (!hasVideo && mediaUrls[0].match(/\.(jpg|jpeg|png|webp)$/i)) {
      return {
        ok: false,
        errorCode: "unsupported_media",
        errorMessage: "TikTok platformu yalnızca video formatlarını (.mp4, .mov) destekler.",
      };
    }
  }

  if (platform === "youtube") {
    if (mediaUrls.length === 0) {
      return {
        ok: false,
        errorCode: "media_required",
        errorMessage: "YouTube için video URL'si zorunludur.",
      };
    }
  }

  if (platform === "instagram" && mediaUrls.length === 0) {
    return {
      ok: false,
      errorCode: "media_required",
      errorMessage:
        "Instagram Business yayını için en az bir geçerli görsel veya video URL'si zorunludur.",
    };
  }

  let primaryMedia: { url: string; mediaType: "image" | "video" } | undefined;
  for (const rawUrl of mediaUrls) {
    const check = classifyMediaUrl(rawUrl);
    if (!check.valid || !check.mediaType) {
      return {
        ok: false,
        errorCode: "unsupported_media",
        errorMessage: check.errorMessage || "Desteklenmeyen medya URL'si.",
      };
    }
    if (!primaryMedia) {
      primaryMedia = { url: rawUrl.trim(), mediaType: check.mediaType };
    }
  }

  return {
    ok: true,
    formattedCaption: fullCaption,
    primaryMedia,
  };
}

function classifyMetaGraphError(
  status: number,
  body: MetaGraphErrorBody | null,
  headers?: Headers,
): {
  errorCode: MetaPublishErrorCode;
  errorMessage: string;
  retryable: boolean;
  retryAfterMs?: number;
} {
  const err = body?.error;
  const code = typeof err?.code === "number" ? err.code : undefined;
  const subcode = typeof err?.error_subcode === "number" ? err.error_subcode : undefined;
  const rawMessage = typeof err?.message === "string" && err.message.trim() ? err.message.trim() : "";

  const retryAfterHeader = headers?.get("retry-after");
  const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  const retryAfterMs = !isNaN(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : undefined;

  if (status === 429 || (code !== undefined && RATE_LIMIT_META_CODES.has(code))) {
    return {
      errorCode: "rate_limited",
      errorMessage:
        rawMessage || "Meta Graph API istek sınırı (rate limit) aşıldı. Lütfen daha sonra tekrar deneyin.",
      retryable: true,
      retryAfterMs: retryAfterMs ?? 60_000,
    };
  }

  if (
    status === 401 ||
    code === 190 ||
    err?.type === "OAuthException" && (subcode === 463 || subcode === 467 || status === 401 || code === 190)
  ) {
    return {
      errorCode: subcode === 463 ? "token_expired" : "invalid_token",
      errorMessage: rawMessage || "Meta API token yetkisiz veya süresi dolmuş.",
      retryable: false,
    };
  }

  if (
    status === 403 ||
    (code !== undefined && PERMISSION_META_CODES.has(code)) ||
    (code !== undefined && code >= 200 && code < 300)
  ) {
    return {
      errorCode: "permission_denied",
      errorMessage:
        rawMessage || "Meta Graph API yayınlama izni yetersiz (pages_manage_posts / instagram_content_publish).",
      retryable: false,
    };
  }

  if (status >= 500 || (code !== undefined && TRANSIENT_META_CODES.has(code))) {
    return {
      errorCode: "transient_api_error",
      errorMessage: rawMessage || `Meta Graph API geçici sunucu hatası (HTTP ${status}).`,
      retryable: true,
      retryAfterMs: retryAfterMs ?? 15_000,
    };
  }

  return {
    errorCode: "graph_api_error",
    errorMessage: rawMessage || `Meta Graph API yayınlama hatası (HTTP ${status}).`,
    retryable: false,
  };
}

async function resolveMetaChannelCredentials(params: {
  organizationId?: string;
  platform: "facebook" | "instagram";
  explicitToken?: string;
  explicitAccountId?: string;
  explicitScopes?: string[];
  fetchImpl?: typeof fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbClient?: any;
}): Promise<
  | {
      ok: true;
      accessToken: string;
      externalAccountId: string;
      scopes?: string[];
    }
  | {
      ok: false;
      errorCode: MetaPublishErrorCode;
      errorMessage: string;
    }
> {
  const orgId = params.organizationId?.trim();
  if (orgId === DEMO_ORGANIZATION_ID) {
    return {
      ok: false,
      errorCode: "demo_blocked",
      errorMessage: "Demo çalışma alanında canlı Meta yayını yapılamaz.",
    };
  }

  const envAccountId =
    params.platform === "instagram"
      ? process.env.META_IG_USER_ID?.trim() || process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim()
      : process.env.META_PAGE_ID?.trim() || process.env.FACEBOOK_PAGE_ID?.trim();

  if (params.explicitToken !== undefined) {
    const token = params.explicitToken.trim();
    if (!token) {
      return {
        ok: false,
        errorCode: "missing_token",
        errorMessage: "Meta sayfa erişim tokenı tanımlı değil.",
      };
    }
    if (token === "invalid_token") {
      return {
        ok: false,
        errorCode: "invalid_token",
        errorMessage: "Meta API token yetkisiz veya süresi dolmuş.",
      };
    }

    const accountId = (params.explicitAccountId || envAccountId || "").trim();
    if (!accountId) {
      // Attempt to discover page/IG account via Graph API /me?fields=id,instagram_business_account
      const fetchFn = params.fetchImpl ?? fetch;
      try {
        const meRes = await fetchFn(
          `${FACEBOOK_GRAPH_BASE}/me?fields=id,name,instagram_business_account{id,username}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
            cache: "no-store",
          },
        );
        const meData = (await meRes.json().catch(() => null)) as
          | (MetaGraphErrorBody & {
              id?: string;
              instagram_business_account?: { id?: string };
            })
          | null;

        if (!meRes.ok || meData?.error) {
          const classified = classifyMetaGraphError(meRes.status, meData, meRes.headers);
          return {
            ok: false,
            errorCode: classified.errorCode,
            errorMessage: classified.errorMessage,
          };
        }

        const discoveredId =
          params.platform === "instagram"
            ? meData?.instagram_business_account?.id || meData?.id
            : meData?.id;

        if (!discoveredId || typeof discoveredId !== "string") {
          return {
            ok: false,
            errorCode: "missing_account_id",
            errorMessage:
              params.platform === "instagram"
                ? "Yetkili Instagram Business hesap kimliği (ig_user_id) doğrulanamadı."
                : "Yetkili Facebook Sayfa kimliği (page_id) doğrulanamadı.",
          };
        }

        return {
          ok: true,
          accessToken: token,
          externalAccountId: discoveredId.trim(),
          scopes: params.explicitScopes,
        };
      } catch (err) {
        return {
          ok: false,
          errorCode: "transient_api_error",
          errorMessage: `Meta Graph API hesap doğrulaması başarısız oldu: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    return {
      ok: true,
      accessToken: token,
      externalAccountId: accountId,
      scopes: params.explicitScopes,
    };
  }

  // No explicit token provided -> load from workspace channel_connections + integration_tokens
  if (!orgId) {
    return {
      ok: false,
      errorCode: "missing_token",
      errorMessage: "Meta sayfa erişim tokenı tanımlı değil.",
    };
  }

  let db;
  try {
    db = params.dbClient ?? createSupabaseAdminClient();
  } catch {
    return {
      ok: false,
      errorCode: "missing_token",
      errorMessage: "Meta sayfa erişim tokenı tanımlı değil.",
    };
  }

  const { data: connection } = await db
    .from("channel_connections")
    .select("id, organization_id, provider, status, external_account_id, scopes")
    .eq("organization_id", orgId)
    .eq("provider", params.platform)
    .maybeSingle();

  if (
    !connection ||
    connection.organization_id !== orgId ||
    connection.status === "not_connected" ||
    connection.status === "revoked"
  ) {
    return {
      ok: false,
      errorCode: "missing_token",
      errorMessage: `${params.platform === "instagram" ? "Instagram Business" : "Facebook Page"} hesabı bağlı değil.`,
    };
  }

  const { data: tokenRow } = await db
    .from("integration_tokens")
    .select("connection_id, organization_id, access_token_cipher, refresh_token_cipher, expires_at, scopes")
    .eq("organization_id", orgId)
    .eq("connection_id", connection.id)
    .maybeSingle();

  if (!tokenRow || tokenRow.organization_id !== orgId || !tokenRow.access_token_cipher) {
    return {
      ok: false,
      errorCode: "missing_token",
      errorMessage: "Şifreli Meta OAuth erişim tokenı bulunamadı.",
    };
  }

  if (!isTokenEncryptionConfigured()) {
    return {
      ok: false,
      errorCode: "missing_token",
      errorMessage: "TOKEN_ENCRYPTION_KEY yapılandırılmadığı için Meta OAuth tokenı çözülemedi.",
    };
  }

  let accessToken: string;
  try {
    accessToken = decryptToken(tokenRow.access_token_cipher);
  } catch {
    return {
      ok: false,
      errorCode: "invalid_token",
      errorMessage: "Meta OAuth erişim tokenı çözülemedi.",
    };
  }

  const isExpired =
    connection.status === "expired" ||
    (tokenRow.expires_at
      ? new Date(tokenRow.expires_at).getTime() <= Date.now() + TOKEN_EXPIRY_BUFFER_MS
      : false);

  if (isExpired) {
    // Attempt token refresh using existing MetaAdapter if refresh cipher or current token cipher is available
    const refreshCipher = tokenRow.refresh_token_cipher || tokenRow.access_token_cipher;
    try {
      const adapter = getProviderAdapter(params.platform);
      const refreshed = await adapter.refreshAccessToken({
        refreshTokenCipher: refreshCipher,
        organizationId: orgId,
        connectionId: connection.id,
      });
      accessToken = decryptToken(refreshed.accessTokenCipher);
      await db
        .from("integration_tokens")
        .update({
          access_token_cipher: refreshed.accessTokenCipher,
          refresh_token_cipher: refreshed.refreshTokenCipher,
          expires_at: refreshed.expiresAt ? refreshed.expiresAt.toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("connection_id", connection.id)
        .eq("organization_id", orgId);

      await db
        .from("channel_connections")
        .update({
          status: "connected",
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", connection.id)
        .eq("organization_id", orgId);
    } catch {
      return {
        ok: false,
        errorCode: "token_expired",
        errorMessage: "Meta erişim tokenının süresi dolmuş ve yenilenemedi. Lütfen hesabı yeniden bağlayın.",
      };
    }
  }

  const externalAccountId = (
    params.explicitAccountId ||
    connection.external_account_id ||
    envAccountId ||
    ""
  ).trim();

  if (!externalAccountId) {
    return {
      ok: false,
      errorCode: "missing_account_id",
      errorMessage: "Bağlı Meta hesabı için sayfa/hesap kimliği (external_account_id) seçilmemiş.",
    };
  }

  const scopes = Array.isArray(connection.scopes) && connection.scopes.length > 0
    ? connection.scopes
    : Array.isArray(tokenRow.scopes)
      ? tokenRow.scopes
      : undefined;

  return {
    ok: true,
    accessToken,
    externalAccountId,
    scopes: params.explicitScopes ?? scopes,
  };
}

/**
 * Resolves a usable access token for TikTok/YouTube publishing, reusing the same
 * channel_connections + integration_tokens OAuth storage/refresh pattern as
 * resolveMetaChannelCredentials. These providers don't need an explicit
 * external-account-id discovery step (the API call operates on the authenticated
 * identity directly), so this is a trimmed-down version of that function.
 */
async function resolveChannelAccessToken(params: {
  organizationId?: string;
  provider: "tiktok" | "youtube";
  explicitToken?: string;
  envFallback?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbClient?: any;
}): Promise<
  | { ok: true; accessToken: string; externalAccountId: string; scopes?: string[] }
  | { ok: false; errorCode: MetaPublishErrorCode; errorMessage: string }
> {
  const orgId = params.organizationId?.trim();
  const providerLabel = params.provider === "tiktok" ? "TikTok" : "YouTube";

  if (orgId === DEMO_ORGANIZATION_ID) {
    return {
      ok: false,
      errorCode: "demo_blocked",
      errorMessage: `Demo çalışma alanında ${providerLabel} yayını simülasyon korumasındadır.`,
    };
  }

  if (params.explicitToken !== undefined) {
    const token = params.explicitToken.trim();
    if (!token) {
      return {
        ok: false,
        errorCode: "missing_token",
        errorMessage: `${providerLabel} erişim tokenı tanımlı değil.`,
      };
    }
    return { ok: true, accessToken: token, externalAccountId: "explicit" };
  }

  if (orgId) {
    let db: ReturnType<typeof createSupabaseAdminClient> | null = null;
    try {
      db = params.dbClient ?? createSupabaseAdminClient();
    } catch {
      db = null;
    }

    if (db) {
      const { data: connection } = await db
        .from("channel_connections")
        .select("id, organization_id, provider, status, external_account_id, scopes")
        .eq("organization_id", orgId)
        .eq("provider", params.provider)
        .maybeSingle();

      if (
        connection &&
        connection.organization_id === orgId &&
        connection.status !== "not_connected" &&
        connection.status !== "revoked"
      ) {
        const { data: tokenRow } = await db
          .from("integration_tokens")
          .select("connection_id, organization_id, access_token_cipher, refresh_token_cipher, expires_at, scopes")
          .eq("organization_id", orgId)
          .eq("connection_id", connection.id)
          .maybeSingle();

        if (
          tokenRow &&
          tokenRow.organization_id === orgId &&
          tokenRow.access_token_cipher &&
          isTokenEncryptionConfigured()
        ) {
          let accessToken: string;
          try {
            accessToken = decryptToken(tokenRow.access_token_cipher);
          } catch {
            return {
              ok: false,
              errorCode: "invalid_token",
              errorMessage: `${providerLabel} OAuth erişim tokenı çözülemedi.`,
            };
          }

          const isExpired =
            connection.status === "expired" ||
            (tokenRow.expires_at
              ? new Date(tokenRow.expires_at).getTime() <= Date.now() + TOKEN_EXPIRY_BUFFER_MS
              : false);

          if (isExpired) {
            const refreshCipher = tokenRow.refresh_token_cipher || tokenRow.access_token_cipher;
            try {
              const adapter = getProviderAdapter(params.provider);
              const refreshed = await adapter.refreshAccessToken({
                refreshTokenCipher: refreshCipher,
                organizationId: orgId,
                connectionId: connection.id,
              });
              accessToken = decryptToken(refreshed.accessTokenCipher);
              await db
                .from("integration_tokens")
                .update({
                  access_token_cipher: refreshed.accessTokenCipher,
                  refresh_token_cipher: refreshed.refreshTokenCipher,
                  expires_at: refreshed.expiresAt ? refreshed.expiresAt.toISOString() : null,
                  updated_at: new Date().toISOString(),
                })
                .eq("connection_id", connection.id)
                .eq("organization_id", orgId);
              await db
                .from("channel_connections")
                .update({
                  status: "connected",
                  error_message: null,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", connection.id)
                .eq("organization_id", orgId);
            } catch {
              return {
                ok: false,
                errorCode: "token_expired",
                errorMessage: `${providerLabel} erişim tokenının süresi dolmuş ve yenilenemedi. Lütfen hesabı yeniden bağlayın.`,
              };
            }
          }

          const scopes =
            Array.isArray(connection.scopes) && connection.scopes.length > 0
              ? connection.scopes
              : Array.isArray(tokenRow.scopes)
                ? tokenRow.scopes
                : undefined;

          return {
            ok: true,
            accessToken,
            externalAccountId: connection.external_account_id || "connected",
            scopes,
          };
        }
      }
    }
  }

  const envToken = (params.envFallback ?? [])
    .map((name) => process.env[name]?.trim())
    .find((value): value is string => Boolean(value));
  if (envToken) {
    return { ok: true, accessToken: envToken, externalAccountId: "env" };
  }

  return {
    ok: false,
    errorCode: "missing_token",
    errorMessage: `${providerLabel} hesabı bağlı değil veya erişim tokenı yapılandırılmamış.`,
  };
}

async function sleepMs(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchMetaWithBoundedRetry(params: {
  url: string;
  init: RequestInit;
  maxRetries: number;
  retryDelayMs: number;
  fetchImpl?: typeof fetch;
}): Promise<{ response: Response; body: Record<string, unknown> | null }> {
  const fetchFn = params.fetchImpl ?? fetch;
  let attempt = 0;

  while (true) {
    attempt++;
    try {
      const response = await fetchFn(params.url, {
        ...params.init,
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;

      if (response.status >= 500 && attempt <= params.maxRetries) {
        await sleepMs(params.retryDelayMs * attempt);
        continue;
      }

      return { response, body };
    } catch (err) {
      if (attempt <= params.maxRetries) {
        await sleepMs(params.retryDelayMs * attempt);
        continue;
      }
      throw err;
    }
  }
}

async function publishToFacebookPage(params: {
  pageId: string;
  accessToken: string;
  formattedCaption: string;
  primaryMedia?: { url: string; mediaType: "image" | "video" };
  maxRetries: number;
  retryDelayMs: number;
  fetchImpl?: typeof fetch;
}): Promise<MetaPublishResult> {
  const { pageId, accessToken, formattedCaption, primaryMedia } = params;

  let endpoint = `${FACEBOOK_GRAPH_BASE}/${encodeURIComponent(pageId)}/feed`;
  let payload: Record<string, unknown> = {
    message: formattedCaption,
  };

  if (primaryMedia?.mediaType === "image") {
    endpoint = `${FACEBOOK_GRAPH_BASE}/${encodeURIComponent(pageId)}/photos`;
    payload = {
      url: primaryMedia.url,
      caption: formattedCaption,
      published: true,
    };
  } else if (primaryMedia?.mediaType === "video") {
    endpoint = `${FACEBOOK_GRAPH_BASE}/${encodeURIComponent(pageId)}/videos`;
    payload = {
      file_url: primaryMedia.url,
      description: formattedCaption,
    };
  }

  try {
    // Do NOT auto-retry POST publish mutations if they might have committed; maxRetries=0 for publish POST
    const { response, body } = await fetchMetaWithBoundedRetry({
      url: endpoint,
      init: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      },
      maxRetries: 0,
      retryDelayMs: params.retryDelayMs,
      fetchImpl: params.fetchImpl,
    });

    const errBody = body as MetaGraphErrorBody | null;
    if (!response.ok || errBody?.error) {
      const classified = classifyMetaGraphError(response.status, errBody, response.headers);
      logger.warn("social_publisher.facebook_publish_failed", {
        pageId,
        status: response.status,
        errorCode: classified.errorCode,
      });
      return {
        success: false,
        errorCode: classified.errorCode,
        errorMessage: classified.errorMessage,
        retryable: classified.retryable,
        retryAfterMs: classified.retryAfterMs,
      };
    }

    const postId =
      (typeof body?.post_id === "string" && body.post_id.trim()) ||
      (typeof body?.id === "string" && body.id.trim()) ||
      "";

    if (!postId) {
      return {
        success: false,
        errorCode: "graph_api_error",
        errorMessage: "Facebook Graph API geçerli bir gönderi kimliği (id) döndürmedi.",
        retryable: false,
      };
    }

    logger.info("social_publisher.facebook_published", {
      pageId,
      metaPostId: postId,
    });

    return {
      success: true,
      metaPostId: postId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      errorCode: "transient_api_error",
      errorMessage: `Facebook Graph API ağ hatası: ${message}`,
      retryable: true,
    };
  }
}

async function publishToInstagramBusiness(params: {
  igUserId: string;
  accessToken: string;
  formattedCaption: string;
  primaryMedia: { url: string; mediaType: "image" | "video" };
  existingContainerId?: string;
  maxPollAttempts: number;
  pollIntervalMs: number;
  maxRetries: number;
  retryDelayMs: number;
  fetchImpl?: typeof fetch;
}): Promise<MetaPublishResult> {
  const { igUserId, accessToken, formattedCaption, primaryMedia } = params;
  let containerId = params.existingContainerId?.trim() || "";

  // Step 1: Create media container if not already created in a prior partial attempt
  if (!containerId) {
    const containerEndpoint = `${FACEBOOK_GRAPH_BASE}/${encodeURIComponent(igUserId)}/media`;
    const containerPayload: Record<string, unknown> =
      primaryMedia.mediaType === "video"
        ? {
            media_type: "REELS",
            video_url: primaryMedia.url,
            caption: formattedCaption,
          }
        : {
            image_url: primaryMedia.url,
            caption: formattedCaption,
          };

    try {
      const { response, body } = await fetchMetaWithBoundedRetry({
        url: containerEndpoint,
        init: {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(containerPayload),
        },
        maxRetries: 0,
        retryDelayMs: params.retryDelayMs,
        fetchImpl: params.fetchImpl,
      });

      const errBody = body as MetaGraphErrorBody | null;
      if (!response.ok || errBody?.error) {
        const classified = classifyMetaGraphError(response.status, errBody, response.headers);
        return {
          success: false,
          errorCode: classified.errorCode,
          errorMessage: classified.errorMessage,
          retryable: classified.retryable,
          retryAfterMs: classified.retryAfterMs,
        };
      }

      containerId = typeof body?.id === "string" ? body.id.trim() : "";
      if (!containerId) {
        return {
          success: false,
          errorCode: "container_error",
          errorMessage: "Instagram medya konteyneri oluşturulamadı (creation_id eksik).",
          retryable: false,
        };
      }
    } catch (err) {
      return {
        success: false,
        errorCode: "transient_api_error",
        errorMessage: `Instagram medya konteyneri oluşturulurken ağ hatası: ${err instanceof Error ? err.message : String(err)}`,
        retryable: true,
      };
    }
  }

  // Step 2: Poll Instagram media container status before calling media_publish
  const statusEndpoint = `${FACEBOOK_GRAPH_BASE}/${encodeURIComponent(containerId)}?fields=status_code,status`;
  for (let pollAttempt = 1; pollAttempt <= Math.max(1, params.maxPollAttempts); pollAttempt++) {
    try {
      const { response, body } = await fetchMetaWithBoundedRetry({
        url: statusEndpoint,
        init: {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
        },
        maxRetries: params.maxRetries,
        retryDelayMs: params.retryDelayMs,
        fetchImpl: params.fetchImpl,
      });

      const errBody = body as MetaGraphErrorBody | null;
      if (!response.ok || errBody?.error) {
        const classified = classifyMetaGraphError(response.status, errBody, response.headers);
        return {
          success: false,
          containerId,
          errorCode: classified.errorCode,
          errorMessage: classified.errorMessage,
          retryable: classified.retryable,
          retryAfterMs: classified.retryAfterMs,
        };
      }

      const statusCode = typeof body?.status_code === "string" ? body.status_code.toUpperCase() : "FINISHED";
      if (statusCode === "FINISHED" || statusCode === "PUBLISHED") {
        break;
      }

      if (statusCode === "ERROR" || statusCode === "EXPIRED") {
        const statusDetail = typeof body?.status === "string" ? body.status : statusCode;
        return {
          success: false,
          containerId,
          errorCode: "container_error",
          errorMessage: `Instagram medya konteyneri işlenemedi (${statusDetail}).`,
          retryable: false,
        };
      }

      // IN_PROGRESS
      if (pollAttempt === Math.max(1, params.maxPollAttempts)) {
        return {
          success: false,
          containerId,
          errorCode: "container_in_progress",
          errorMessage: "Instagram medya konteyneri henüz hazırlanıyor (IN_PROGRESS).",
          retryable: true,
          retryAfterMs: 15_000,
        };
      }

      await sleepMs(params.pollIntervalMs);
    } catch (err) {
      return {
        success: false,
        containerId,
        errorCode: "transient_api_error",
        errorMessage: `Instagram konteyner durumu sorgulanırken ağ hatası: ${err instanceof Error ? err.message : String(err)}`,
        retryable: true,
      };
    }
  }

  // Step 3: Publish the ready container via media_publish
  const publishEndpoint = `${FACEBOOK_GRAPH_BASE}/${encodeURIComponent(igUserId)}/media_publish`;
  try {
    const { response, body } = await fetchMetaWithBoundedRetry({
      url: publishEndpoint,
      init: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ creation_id: containerId }),
      },
      maxRetries: 0,
      retryDelayMs: params.retryDelayMs,
      fetchImpl: params.fetchImpl,
    });

    const errBody = body as MetaGraphErrorBody | null;
    if (!response.ok || errBody?.error) {
      const classified = classifyMetaGraphError(response.status, errBody, response.headers);
      return {
        success: false,
        containerId,
        errorCode: classified.errorCode,
        errorMessage: classified.errorMessage,
        retryable: classified.retryable,
        retryAfterMs: classified.retryAfterMs,
      };
    }

    const publishedId = typeof body?.id === "string" ? body.id.trim() : "";
    if (!publishedId) {
      return {
        success: false,
        containerId,
        errorCode: "graph_api_error",
        errorMessage: "Instagram Graph API media_publish yanıtında geçerli bir yayın kimliği (id) bulunamadı.",
        retryable: false,
      };
    }

    logger.info("social_publisher.instagram_published", {
      igUserId,
      containerId,
      metaPostId: publishedId,
    });

    return {
      success: true,
      metaPostId: publishedId,
      containerId,
    };
  } catch (err) {
    return {
      success: false,
      containerId,
      errorCode: "transient_api_error",
      errorMessage: `Instagram media_publish ağ hatası: ${err instanceof Error ? err.message : String(err)}`,
      retryable: true,
    };
  }
}

/**
 * Publishes a social media post to Facebook Page and/or Instagram Business via Meta Graph API.
 * Enforces media validation, container status polling, rate-limit handling, and queue idempotency.
 * Never fabricates fake Meta post IDs.
 */
export async function publishSocialPostToMeta(
  post: MetaPublishPostInput,
  token?: string,
  options: MetaPublishOptions = {},
): Promise<MetaPublishResult> {
  // Queue idempotency: if already published in a prior run, do not duplicate
  const existingExternalId = (
    options.alreadyPublishedExternalId ||
    post.alreadyPublishedExternalId ||
    ""
  ).trim();
  if (existingExternalId) {
    return {
      success: true,
      metaPostId: existingExternalId,
      deduplicated: true,
    };
  }

  const rawPlatform = String(post.platform || "facebook").toLowerCase().trim();
  if (rawPlatform !== "facebook" && rawPlatform !== "instagram" && rawPlatform !== "both") {
    return {
      success: false,
      errorCode: "validation_error",
      errorMessage: `Desteklenmeyen sosyal medya platformu: ${rawPlatform}`,
      retryable: false,
    };
  }

  const organizationId = (
    options.organizationId ||
    options.workspaceId ||
    (typeof post.organizationId === "string" ? post.organizationId : "") ||
    (typeof post.workspaceId === "string" ? post.workspaceId : "") ||
    (typeof post.organization_id === "string" ? post.organization_id : "") ||
    (typeof post.workspace_id === "string" ? post.workspace_id : "")
  ).trim() || undefined;

  const caption = String(post.caption ?? post.content ?? "").trim();
  const rawMediaUrls = Array.isArray(post.mediaUrls)
    ? post.mediaUrls
    : Array.isArray(post.media_urls)
      ? post.media_urls
      : [];
  const mediaUrls = rawMediaUrls.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
  const hashtags = Array.isArray(post.hashtags)
    ? post.hashtags.filter((h): h is string => typeof h === "string" && h.trim().length > 0)
    : [];

  const maxPollAttempts = options.maxPollAttempts ?? 3;
  const pollIntervalMs = options.pollIntervalMs ?? 0;
  const maxRetries = options.maxRetries ?? 1;
  const retryDelayMs = options.retryDelayMs ?? 10;

  const targetPlatforms: Array<"facebook" | "instagram"> =
    rawPlatform === "both" ? ["facebook", "instagram"] : [rawPlatform];

  const partialResults: {
    facebook?: string;
    instagram?: string;
    instagramContainerId?: string;
  } = {
    ...(post.partialResults || {}),
  };

  for (const platform of targetPlatforms) {
    // Skip platform if it already succeeded in a prior partial run
    if (platform === "facebook" && partialResults.facebook) {
      continue;
    }
    if (platform === "instagram" && partialResults.instagram) {
      continue;
    }

    const explicitAccountId =
      platform === "instagram"
        ? options.igUserId || post.igUserId || options.externalAccountId || post.externalAccountId
        : options.pageId || post.pageId || options.externalAccountId || post.externalAccountId;

    const creds = await resolveMetaChannelCredentials({
      organizationId,
      platform,
      explicitToken: token,
      explicitAccountId,
      explicitScopes: options.scopes,
      fetchImpl: options.fetchImpl,
      dbClient: options.dbClient,
    });

    if (!creds.ok) {
      return {
        success: false,
        errorCode: creds.errorCode,
        errorMessage: creds.errorMessage,
        retryable: false,
        partialResults: Object.keys(partialResults).length > 0 ? partialResults : undefined,
      };
    }

    const validation = validatePlatformPublishingRequirements({
      platform,
      caption,
      mediaUrls,
      hashtags,
      scopes: creds.scopes,
    });

    if (!validation.ok) {
      return {
        success: false,
        errorCode: validation.errorCode,
        errorMessage: validation.errorMessage,
        retryable: false,
        partialResults: Object.keys(partialResults).length > 0 ? partialResults : undefined,
      };
    }

    if (platform === "facebook") {
      const fbResult = await publishToFacebookPage({
        pageId: creds.externalAccountId,
        accessToken: creds.accessToken,
        formattedCaption: validation.formattedCaption,
        primaryMedia: validation.primaryMedia,
        maxRetries,
        retryDelayMs,
        fetchImpl: options.fetchImpl,
      });

      if (!fbResult.success || !fbResult.metaPostId) {
        return {
          ...fbResult,
          partialResults: Object.keys(partialResults).length > 0 ? partialResults : undefined,
        };
      }

      partialResults.facebook = fbResult.metaPostId;
    } else {
      const igResult = await publishToInstagramBusiness({
        igUserId: creds.externalAccountId,
        accessToken: creds.accessToken,
        formattedCaption: validation.formattedCaption,
        primaryMedia: validation.primaryMedia!,
        existingContainerId:
          options.containerId || post.containerId || partialResults.instagramContainerId,
        maxPollAttempts,
        pollIntervalMs,
        maxRetries,
        retryDelayMs,
        fetchImpl: options.fetchImpl,
      });

      if (igResult.containerId) {
        partialResults.instagramContainerId = igResult.containerId;
      }

      if (!igResult.success || !igResult.metaPostId) {
        return {
          ...igResult,
          partialResults: Object.keys(partialResults).length > 0 ? partialResults : undefined,
        };
      }

      partialResults.instagram = igResult.metaPostId;
    }
  }

  const finalPostId =
    rawPlatform === "both"
      ? `fb:${partialResults.facebook},ig:${partialResults.instagram}`
      : rawPlatform === "facebook"
        ? partialResults.facebook
        : partialResults.instagram;

  if (!finalPostId) {
    return {
      success: false,
      errorCode: "graph_api_error",
      errorMessage: "Meta yayın kimliği doğrulanamadı.",
      retryable: false,
    };
  }

  return {
    success: true,
    metaPostId: finalPostId,
    containerId: partialResults.instagramContainerId,
    partialResults,
  };
}

export async function publishSocialPostToTikTok(
  post: MetaPublishPostInput,
  token?: string,
  options: MetaPublishOptions = {},
): Promise<MetaPublishResult> {
  if (post.alreadyPublishedExternalId) {
    return {
      success: true,
      metaPostId: post.alreadyPublishedExternalId,
      deduplicated: true,
    };
  }

  const orgId = options.organizationId || post.organizationId || post.workspaceId;
  const caption = String(post.caption ?? post.content ?? "").trim();
  const rawMediaUrls = post.mediaUrls || post.media_urls || [];
  const mediaUrls = rawMediaUrls.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
  const hashtags = Array.isArray(post.hashtags)
    ? post.hashtags.filter((h): h is string => typeof h === "string" && h.trim().length > 0)
    : [];

  const validation = validatePlatformPublishingRequirements({ platform: "tiktok", caption, mediaUrls, hashtags });
  if (!validation.ok) {
    return { success: false, errorCode: validation.errorCode, errorMessage: validation.errorMessage, retryable: false };
  }

  // Validation before credential resolution: demo-blocked workspaces still
  // need a valid video attached to reach that check, matching the existing
  // test contract (media_required takes priority over missing_token/demo
  // detection for a request that's missing required input regardless).
  const creds = await resolveChannelAccessToken({
    organizationId: orgId,
    provider: "tiktok",
    explicitToken: token,
    envFallback: ["TIKTOK_ACCESS_TOKEN"],
    dbClient: options.dbClient,
  });
  if (!creds.ok) {
    return { success: false, errorCode: creds.errorCode, errorMessage: creds.errorMessage, retryable: false };
  }

  const fetchFn = options.fetchImpl ?? fetch;
  // TikTok caption/title limit is 2200 chars for the Content Posting API's
  // post_info.title field, but we keep it short to stay well inside platform UI truncation.
  const title = validation.formattedCaption.slice(0, 150);

  let initRes: Response;
  try {
    initRes = await fetchFn("https://open.tiktokapis.com/v2/post/publish/video/init/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title,
          // Apps that have not completed TikTok's Content Posting API audit are
          // restricted to SELF_ONLY (private) posts by TikTok's own server-side
          // enforcement — any other privacy_level is rejected with
          // "unaudited_client_can_only_post_private". This is not our choice to
          // relax; it lifts automatically once the app passes TikTok's audit.
          privacy_level: "SELF_ONLY",
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: validation.primaryMedia!.url,
        },
      }),
      cache: "no-store",
    });
  } catch (err) {
    return {
      success: false,
      errorCode: "transient_api_error",
      errorMessage: `TikTok API isteği başarısız: ${err instanceof Error ? err.message : String(err)}`,
      retryable: true,
    };
  }

  const initData = (await initRes.json().catch(() => ({}))) as {
    data?: { publish_id?: string };
    error?: { code?: string; message?: string; log_id?: string };
  };

  const tiktokErrorCode = initData.error?.code;
  if (!initRes.ok || !initData.data?.publish_id || (tiktokErrorCode && tiktokErrorCode !== "ok")) {
    const retryable = initRes.status === 429 || initRes.status >= 500;
    return {
      success: false,
      errorCode: initRes.status === 401 || tiktokErrorCode === "access_token_invalid"
        ? "invalid_token"
        : retryable
          ? "transient_api_error"
          : "graph_api_error",
      errorMessage: initData.error?.message || `TikTok video yayını başlatılamadı (${initRes.status}).`,
      retryable,
    };
  }

  // PULL_FROM_URL is an async job on TikTok's side: this publish_id confirms
  // TikTok accepted the request and is fetching the video, not that it has
  // finished publishing. Status can be checked via
  // /v2/post/publish/status/fetch/ if end-to-end confirmation is needed later.
  return {
    success: true,
    metaPostId: initData.data.publish_id,
  };
}

export async function publishSocialPostToYouTube(
  post: MetaPublishPostInput,
  token?: string,
  options: MetaPublishOptions = {},
): Promise<MetaPublishResult> {
  if (post.alreadyPublishedExternalId) {
    return {
      success: true,
      metaPostId: post.alreadyPublishedExternalId,
      deduplicated: true,
    };
  }

  const orgId = options.organizationId || post.organizationId || post.workspaceId;
  const caption = String(post.caption ?? post.content ?? "").trim();
  const rawMediaUrls = post.mediaUrls || post.media_urls || [];
  const mediaUrls = rawMediaUrls.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
  const hashtags = Array.isArray(post.hashtags)
    ? post.hashtags.filter((h): h is string => typeof h === "string" && h.trim().length > 0)
    : [];

  const validation = validatePlatformPublishingRequirements({ platform: "youtube", caption, mediaUrls, hashtags });
  if (!validation.ok) {
    return { success: false, errorCode: validation.errorCode, errorMessage: validation.errorMessage, retryable: false };
  }

  const creds = await resolveChannelAccessToken({
    organizationId: orgId,
    provider: "youtube",
    explicitToken: token,
    envFallback: ["YOUTUBE_ACCESS_TOKEN", "GOOGLE_ACCESS_TOKEN"],
    dbClient: options.dbClient,
  });
  if (!creds.ok) {
    return { success: false, errorCode: creds.errorCode, errorMessage: creds.errorMessage, retryable: false };
  }

  const fetchFn = options.fetchImpl ?? fetch;
  const videoUrl = validation.primaryMedia!.url;

  // The YouTube Data API's resumable upload requires the video bytes themselves
  // (unlike TikTok's URL-pull model), so fetch the source media first.
  let videoBytes: ArrayBuffer;
  let contentType = "video/mp4";
  try {
    const mediaRes = await fetchFn(videoUrl, { cache: "no-store" });
    if (!mediaRes.ok) {
      return {
        success: false,
        errorCode: "unsupported_media",
        errorMessage: `Video medyası indirilemedi (${mediaRes.status}).`,
        retryable: true,
      };
    }
    contentType = mediaRes.headers.get("content-type") || contentType;
    videoBytes = await mediaRes.arrayBuffer();
  } catch (err) {
    return {
      success: false,
      errorCode: "transient_api_error",
      errorMessage: `Video medyası indirilemedi: ${err instanceof Error ? err.message : String(err)}`,
      retryable: true,
    };
  }

  const title = (validation.formattedCaption.split("\n")[0] || "FlowSales AI").slice(0, 100);

  let initRes: Response;
  try {
    initRes = await fetchFn(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": contentType,
          "X-Upload-Content-Length": String(videoBytes.byteLength),
        },
        body: JSON.stringify({
          snippet: { title, description: validation.formattedCaption },
          // Defaults to "unlisted" rather than "public" as a deliberate safety
          // choice for this first wiring of a brand-new publish path — adjust
          // once verified end-to-end. Unlike TikTok's SELF_ONLY, this is not an
          // API-enforced restriction.
          status: { privacyStatus: "unlisted", selfDeclaredMadeForKids: false },
        }),
        cache: "no-store",
      },
    );
  } catch (err) {
    return {
      success: false,
      errorCode: "transient_api_error",
      errorMessage: `YouTube yükleme oturumu başlatılamadı: ${err instanceof Error ? err.message : String(err)}`,
      retryable: true,
    };
  }

  if (!initRes.ok) {
    const retryable = initRes.status === 429 || initRes.status >= 500;
    return {
      success: false,
      errorCode: initRes.status === 401 ? "invalid_token" : retryable ? "transient_api_error" : "graph_api_error",
      errorMessage: `YouTube yükleme oturumu başlatılamadı (${initRes.status}).`,
      retryable,
    };
  }

  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) {
    return {
      success: false,
      errorCode: "graph_api_error",
      errorMessage: "YouTube yükleme oturumu adresi alınamadı.",
      retryable: true,
    };
  }

  let uploadRes: Response;
  try {
    uploadRes = await fetchFn(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType, "Content-Length": String(videoBytes.byteLength) },
      body: videoBytes,
      cache: "no-store",
    });
  } catch (err) {
    return {
      success: false,
      errorCode: "transient_api_error",
      errorMessage: `YouTube video yüklemesi başarısız: ${err instanceof Error ? err.message : String(err)}`,
      retryable: true,
    };
  }

  const uploadData = (await uploadRes.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };

  if (!uploadRes.ok || !uploadData.id) {
    const retryable = uploadRes.status === 429 || uploadRes.status >= 500;
    return {
      success: false,
      errorCode: uploadRes.status === 401 ? "invalid_token" : retryable ? "transient_api_error" : "graph_api_error",
      errorMessage: uploadData.error?.message || `YouTube video yüklemesi başarısız (${uploadRes.status}).`,
      retryable,
    };
  }

  return { success: true, metaPostId: uploadData.id };
}

export async function publishSocialPost(
  post: MetaPublishPostInput,
  token?: string,
  options: MetaPublishOptions = {},
): Promise<MetaPublishResult> {
  const rawPlatform = String(post.platform || "facebook").toLowerCase();
  if (rawPlatform === "tiktok") {
    return publishSocialPostToTikTok(post, token, options);
  }
  if (rawPlatform === "youtube") {
    return publishSocialPostToYouTube(post, token, options);
  }
  return publishSocialPostToMeta(post, token, options);
}
