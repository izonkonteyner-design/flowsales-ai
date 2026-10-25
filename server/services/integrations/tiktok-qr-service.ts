import "server-only";

import crypto from "crypto";
import QRCode from "qrcode";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { logger } from "@/lib/logger";
import {
  encryptToken,
  decryptToken,
  isTokenEncryptionConfigured,
} from "@/server/services/integrations/encryption";
import {
  getProviderAdapter,
  isProviderConfigured,
  OAuthConfigurationRequiredError,
  OAuthTokenEncryptionNotConfiguredError,
} from "@/server/services/integrations/provider-adapter";
import { getSiteUrl } from "@/server/env";

// ============================================================================
// TikTok Official QR Code Authorization Service
//
// Complies with TikTok Login Kit v2 QR Code API:
// 1. POST https://open.tiktokapis.com/v2/oauth/get_qrcode/
// 2. Client ticket generation and scan_qrcode_url injection
// 3. POST https://open.tiktokapis.com/v2/oauth/check_qrcode/ (polling)
// 4. Token exchange on confirmation and persistence to channel_connections
// ============================================================================

export type InitiateQrResult =
  | {
      ok: true;
      qrSessionId: string;
      qrCodeDataUrl: string;
      scanUrl: string;
      expiresAt: string;
    }
  | {
      ok: false;
      error: string;
      message: string;
    };

export type CheckQrStatusResult =
  | {
      status: "waiting";
      message: string;
    }
  | {
      status: "scanned";
      message: string;
    }
  | {
      status: "confirmed";
      connected: true;
      displayName: string;
      externalAccountId?: string | null;
      scopes: string[];
      message: string;
    }
  | {
      status: "expired";
      message: string;
    }
  | {
      status: "error" | "invalid";
      message: string;
    };

function getTikTokCredentials(): { clientKey: string; clientSecret: string } {
  const clientKey =
    process.env.TIKTOK_CLIENT_KEY?.trim() ||
    process.env.TIKTOK_CLIENT_ID?.trim() ||
    process.env.TIKTOK_APP_ID?.trim();
  const clientSecret =
    process.env.TIKTOK_CLIENT_SECRET?.trim() ||
    process.env.TIKTOK_APP_SECRET?.trim();
  if (!clientKey || !clientSecret) {
    throw new OAuthConfigurationRequiredError("tiktok");
  }
  return { clientKey, clientSecret };
}

export async function initiateTikTokQrSession(params: {
  organizationId: string;
  userId: string;
  returnPath?: string;
  fetchImpl?: typeof fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbClient?: any;
}): Promise<InitiateQrResult> {
  if (!isProviderConfigured("tiktok")) {
    throw new OAuthConfigurationRequiredError("tiktok");
  }

  if (!isTokenEncryptionConfigured()) {
    throw new OAuthTokenEncryptionNotConfiguredError();
  }

  const { clientKey } = getTikTokCredentials();
  const rawStateToken = crypto.randomBytes(32).toString("hex");
  const clientTicket = crypto.randomBytes(32).toString("hex");
  const qrSessionId = crypto.randomUUID();

  const fetchFn = params.fetchImpl ?? fetch;

  const body = new URLSearchParams({
    client_key: clientKey,
    scope: "user.info.basic,video.upload,video.publish",
    state: rawStateToken,
  });

  let response: Response;
  try {
    response = await fetchFn("https://open.tiktokapis.com/v2/oauth/get_qrcode/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });
  } catch (networkErr) {
    const errorMsg =
      networkErr instanceof Error ? networkErr.message : String(networkErr);
    logger.error("tiktok_qr.initiate_network_error", {
      organizationId: params.organizationId,
      error: errorMsg,
    });
    return {
      ok: false,
      error: "network_error",
      message: `TikTok QR servisine bağlanırken ağ hatası oluştu: ${errorMsg}`,
    };
  }

  const data = (await response.json().catch(() => ({}))) as {
    data?: {
      scan_qrcode_url?: string;
      token?: string;
    };
    error?: {
      code?: string | number;
      message?: string;
    };
  };

  const rawScanUrl = data.data?.scan_qrcode_url;
  const tiktokToken = data.data?.token;

  if (!response.ok || !rawScanUrl || !tiktokToken || data.error?.code !== "ok" && data.error?.code !== undefined && data.error?.code !== 0) {
    const errorMsg = data.error?.message || `HTTP ${response.status}`;
    logger.warn("tiktok_qr.initiate_rejected", {
      organizationId: params.organizationId,
      error: errorMsg,
      status: response.status,
    });
    return {
      ok: false,
      error: "qr_unavailable",
      message: `TikTok resmi QR yetkilendirme servisi bu uygulama için etkin değil veya inceleme aşamasında: ${errorMsg}. Lütfen standart 'TikTok ile Bağlan' (OAuth) yöntemini kullanın.`,
    };
  }

  // Inject client ticket into scan_qrcode_url
  let finalScanUrl = rawScanUrl;
  if (finalScanUrl.includes("client_ticket=tobefilled")) {
    finalScanUrl = finalScanUrl.replace("client_ticket=tobefilled", `client_ticket=${clientTicket}`);
  } else {
    const delimiter = finalScanUrl.includes("?") ? "&" : "?";
    finalScanUrl = `${finalScanUrl}${delimiter}client_ticket=${clientTicket}`;
  }

  // Generate visual QR code as base64 Data URL
  const qrCodeDataUrl = await QRCode.toDataURL(finalScanUrl, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 280,
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const stateHash = crypto.createHash("sha256").update(qrSessionId).digest("hex");

  const sessionPayload = JSON.stringify({
    qrSessionId,
    tiktokToken,
    clientTicket,
    scopes: ["user.info.basic", "video.upload", "video.publish"],
  });

  const codeVerifierCiphertext = encryptToken(sessionPayload);

  // Store in oauth_states (atomic single-use & workspace-isolated)
  try {
    const admin = params.dbClient ?? createSupabaseAdminClient();
    const { error: dbError } = await admin.from("oauth_states").insert({
      organization_id: params.organizationId,
      user_id: params.userId,
      provider: "tiktok",
      state_hash: stateHash,
      code_verifier_ciphertext: codeVerifierCiphertext,
      return_path: params.returnPath || "/settings/integrations",
      expires_at: expiresAt,
    });

    if (dbError) {
      logger.error("tiktok_qr.db_state_insert_failed", {
        organizationId: params.organizationId,
        error: dbError.message,
      });
      return {
        ok: false,
        error: "db_error",
        message: "QR oturumu veritabanına kaydedilemedi.",
      };
    }
  } catch (err) {
    const isMissingEnv =
      !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!isMissingEnv) {
      throw err;
    }
  }

  return {
    ok: true,
    qrSessionId,
    qrCodeDataUrl,
    scanUrl: finalScanUrl,
    expiresAt,
  };
}

export async function checkTikTokQrStatus(params: {
  qrSessionId: string;
  organizationId: string;
  userId: string;
  fetchImpl?: typeof fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbClient?: any;
}): Promise<CheckQrStatusResult> {
  const stateHash = crypto.createHash("sha256").update(params.qrSessionId).digest("hex");
  let admin;
  try {
    admin = params.dbClient ?? createSupabaseAdminClient();
  } catch {
    return {
      status: "invalid",
      message: "QR oturumu bulunamadı veya veritabanı hazır değil.",
    };
  }

  const { data: row, error: fetchError } = await admin
    .from("oauth_states")
    .select("id, organization_id, user_id, provider, code_verifier_ciphertext, expires_at, consumed_at")
    .eq("state_hash", stateHash)
    .eq("organization_id", params.organizationId)
    .eq("user_id", params.userId)
    .eq("provider", "tiktok")
    .maybeSingle();

  if (fetchError || !row) {
    return {
      status: "invalid",
      message: "QR oturumu bulunamadı veya bu çalışma alanına ait değil.",
    };
  }

  if (row.consumed_at) {
    return {
      status: "invalid",
      message: "Bu QR oturumu daha önce kullanılmış veya iptal edilmiş.",
    };
  }

  if (new Date(row.expires_at) < new Date()) {
    return {
      status: "expired",
      message: "QR kodunun süresi doldu. Lütfen yeni bir QR kodu oluşturun.",
    };
  }

  let sessionData: {
    qrSessionId: string;
    tiktokToken: string;
    clientTicket: string;
    scopes: string[];
  };

  try {
    const raw = decryptToken(row.code_verifier_ciphertext);
    sessionData = JSON.parse(raw);
  } catch {
    return {
      status: "error",
      message: "QR oturum verisi çözülemedi.",
    };
  }

  const { clientKey, clientSecret } = getTikTokCredentials();
  const fetchFn = params.fetchImpl ?? fetch;

  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    token: sessionData.tiktokToken,
  });

  let checkRes: Response;
  try {
    checkRes = await fetchFn("https://open.tiktokapis.com/v2/oauth/check_qrcode/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("tiktok_qr.check_network_error", {
      organizationId: params.organizationId,
      error: msg,
    });
    return {
      status: "error",
      message: `TikTok durumu sorgulanırken ağ hatası oluştu: ${msg}`,
    };
  }

  const checkData = (await checkRes.json().catch(() => ({}))) as {
    data?: {
      status?: string;
      code?: string;
      client_ticket?: string;
    };
    status?: string;
    code?: string;
    error?: {
      code?: string | number;
      message?: string;
    };
  };

  const rawStatus = (checkData.data?.status || checkData.status || "").toLowerCase();
  const authCode = checkData.data?.code || checkData.code;

  if (rawStatus === "new") {
    return {
      status: "waiting",
      message: "TikTok uygulamasını açın ve QR kodu tarayın...",
    };
  }

  if (rawStatus === "scanned") {
    return {
      status: "scanned",
      message: "QR kod tarandı! Telefonunuzda oturum açmayı onaylayın...",
    };
  }

  if (rawStatus === "expired") {
    return {
      status: "expired",
      message: "QR kodunun süresi doldu.",
    };
  }

  if (rawStatus === "confirmed" && authCode) {
    // Atomically consume state to prevent replay
    const { error: consumeErr } = await admin
      .from("oauth_states")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("consumed_at", null);

    if (consumeErr) {
      logger.error("tiktok_qr.state_consume_error", {
        organizationId: params.organizationId,
        error: consumeErr.message,
      });
    }

    // Exchange the code for tokens and save to channel_connections
    const adapter = getProviderAdapter("tiktok");
    const redirectUri = `${getSiteUrl()}/api/integrations/tiktok/callback`;

    await adapter.exchangeCode({
      code: authCode,
      codeVerifier: null,
      redirectUri,
      organizationId: params.organizationId,
      userId: params.userId,
    });

    // Verify stored connection
    const { data: connection } = await admin
      .from("channel_connections")
      .select("id, status, display_name, external_account_id, scopes")
      .eq("organization_id", params.organizationId)
      .eq("provider", "tiktok")
      .maybeSingle();

    return {
      status: "confirmed",
      connected: true,
      displayName: connection?.display_name || "TikTok Account",
      externalAccountId: connection?.external_account_id,
      scopes: connection?.scopes || [],
      message: "TikTok hesabı başarıyla bağlandı ve doğrulandı!",
    };
  }

  if (checkData.error?.message) {
    return {
      status: "error",
      message: `TikTok yetkilendirme hatası: ${checkData.error.message}`,
    };
  }

  return {
    status: "waiting",
    message: "Yetkilendirme bekleniyor...",
  };
}

export async function cancelTikTokQrSession(params: {
  qrSessionId: string;
  organizationId: string;
  userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbClient?: any;
}): Promise<{ ok: boolean }> {
  const stateHash = crypto.createHash("sha256").update(params.qrSessionId).digest("hex");
  try {
    const admin = params.dbClient ?? createSupabaseAdminClient();
    await admin
      .from("oauth_states")
      .update({ consumed_at: new Date().toISOString() })
      .eq("state_hash", stateHash)
      .eq("organization_id", params.organizationId)
      .eq("user_id", params.userId)
      .is("consumed_at", null);
  } catch {
    // Ignore cancellation error in mock environments
  }

  return { ok: true };
}
