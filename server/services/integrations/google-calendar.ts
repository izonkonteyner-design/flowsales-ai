import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { logger } from "@/lib/logger";
import {
  decryptToken,
  encryptToken,
  isTokenEncryptionConfigured,
} from "@/server/services/integrations/encryption";
import {
  GoogleCalendarEventInput as GoogleDomainCalendarEventInput,
  validateCalendarEventInput,
  formatGoogleCalendarEventPayload as formatDomainGoogleCalendarEventPayload,
} from "./google-domain";
import {
  GoogleCalendarEventInput,
  formatGoogleCalendarEventPayload,
  googleCalendarEventSchema,
} from "@/lib/validations/google-calendar";

export * from "./google-domain";
export type { GoogleCalendarEventInput };
export { formatGoogleCalendarEventPayload, googleCalendarEventSchema };

const GOOGLE_CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DEMO_ORGANIZATION_ID = "d3e00000-0000-0000-0000-000000000000";
const TOKEN_EXPIRY_BUFFER_MS = 60_000;

export type GoogleCalendarSyncOptions = {
  accessToken?: string;
  refreshToken?: string;
  connectionId?: string;
  calendarId?: string;
  userId?: string;
  timeZone?: string;
  idempotencyKey?: string;
  fetchImpl?: typeof fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbClient?: any;
};

type GoogleApiErrorPayload = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    errors?: Array<{ reason?: string; message?: string }>;
  } | string;
  error_description?: string;
};

type GoogleCalendarEventResponse = {
  id?: string;
  status?: string;
  htmlLink?: string;
  summary?: string;
};

type GoogleCalendarEventsListResponse = {
  items?: Array<{
    id?: string;
    status?: string;
    htmlLink?: string;
  }>;
};

type ResolvedGoogleAuth =
  | {
      ok: true;
      accessToken: string;
      refreshToken: string | null;
      connectionId: string | null;
      calendarId: string;
      timeZone: string;
    }
  | {
      ok: false;
      errorCode:
        | "invalid_workspace"
        | "demo_blocked"
        | "unauthorized_workspace"
        | "config_required"
        | "not_connected"
        | "token_missing"
        | "token_expired"
        | "invalid_token";
      errorMessage: string;
    };

function isUuid(value: string | undefined | null): boolean {
  if (!value || typeof value !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
  if (response.status === 204 || response.status === 205) {
    return null;
  }
  const text = await response.text().catch(() => "");
  if (!text || !text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function extractGoogleErrorMessage(
  status: number,
  payload: GoogleApiErrorPayload | null,
  fallback: string,
): string {
  if (status === 401) {
    return "Google Calendar API token yetkisiz veya süresi dolmuş.";
  }
  if (status === 403) {
    return "Google Calendar API erişim izni yetersiz (403 Forbidden).";
  }
  if (status === 404 || status === 410) {
    return "Google Calendar etkinliği bulunamadı veya silinmiş.";
  }
  if (payload) {
    if (typeof payload.error_description === "string" && payload.error_description.trim()) {
      return payload.error_description.trim();
    }
    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error.trim();
    }
    if (
      payload.error &&
      typeof payload.error === "object" &&
      typeof payload.error.message === "string" &&
      payload.error.message.trim()
    ) {
      return payload.error.message.trim();
    }
  }
  return `${fallback} (HTTP ${status})`;
}

/**
 * Refreshes an expired Google OAuth access token using the refresh token and
 * persists the encrypted token back to integration_tokens when connectionId is present.
 */
export async function refreshGoogleCalendarAccessToken(params: {
  organizationId: string;
  connectionId?: string | null;
  refreshToken: string;
  fetchImpl?: typeof fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbClient?: any;
}): Promise<{
  ok: true;
  accessToken: string;
  expiresAt: string;
} | {
  ok: false;
  errorMessage: string;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || process.env.GOOGLE_ADS_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || process.env.GOOGLE_ADS_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return {
      ok: false,
      errorMessage:
        "Google Kalender entegrasyonu için istemci kimlik bilgileri (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) yapılandırılmamış.",
    };
  }

  if (!params.refreshToken || !params.refreshToken.trim() || params.refreshToken === "invalid_refresh_token") {
    return {
      ok: false,
      errorMessage: "Google OAuth yenileme tokenı (refresh_token) geçersiz veya eksik.",
    };
  }

  const fetchFn = params.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: params.refreshToken.trim(),
    grant_type: "refresh_token",
  });

  let response: Response;
  try {
    response = await fetchFn(GOOGLE_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ağ hatası";
    logger.error("google_calendar.token_refresh_network_error", {
      organizationId: params.organizationId,
      error: msg,
    });
    return {
      ok: false,
      errorMessage: `Google OAuth token yenileme bağlantısı başarısız oldu: ${msg}`,
    };
  }

  const data = await parseJsonSafe<
    GoogleApiErrorPayload & {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
    }
  >(response);

  if (!response.ok || !data?.access_token || typeof data.access_token !== "string") {
    const errorMessage = extractGoogleErrorMessage(
      response.status,
      data,
      "Google OAuth erişim tokenı yenilenemedi",
    );

    if (params.connectionId) {
      try {
        const db = params.dbClient ?? createSupabaseAdminClient();
        await db
          .from("channel_connections")
          .update({
            status: "expired",
            error_message: "Google token expired. Please reconnect.",
            updated_at: new Date().toISOString(),
          })
          .eq("id", params.connectionId)
          .eq("organization_id", params.organizationId);
      } catch {
        // Ignore DB update error during failure handling
      }
    }

    return { ok: false, errorMessage };
  }

  const expiresInSec = typeof data.expires_in === "number" && data.expires_in > 0 ? data.expires_in : 3600;
  const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();

  if (params.connectionId && isTokenEncryptionConfigured()) {
    try {
      const db = params.dbClient ?? createSupabaseAdminClient();
      const updatePayload: Record<string, unknown> = {
        access_token_cipher: encryptToken(data.access_token),
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      };
      if (typeof data.refresh_token === "string" && data.refresh_token.trim()) {
        updatePayload.refresh_token_cipher = encryptToken(data.refresh_token.trim());
      }

      await db
        .from("integration_tokens")
        .update(updatePayload)
        .eq("connection_id", params.connectionId)
        .eq("organization_id", params.organizationId);

      await db
        .from("channel_connections")
        .update({
          status: "connected",
          error_message: null,
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.connectionId)
        .eq("organization_id", params.organizationId);
    } catch (err) {
      logger.warn("google_calendar.token_persist_warning", {
        organizationId: params.organizationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    ok: true,
    accessToken: data.access_token,
    expiresAt,
  };
}

/**
 * Resolves and validates Google Calendar credentials for a workspace/organization.
 * Enforces workspace isolation and refreshes expired tokens when a refresh_token is available.
 */
export async function resolveWorkspaceGoogleCalendarAuth(
  organizationId: string,
  options: GoogleCalendarSyncOptions = {},
): Promise<ResolvedGoogleAuth> {
  const orgId = organizationId?.trim();
  if (!orgId || !isUuid(orgId)) {
    return {
      ok: false,
      errorCode: "invalid_workspace",
      errorMessage: "Geçerli bir çalışma alanı (workspaceId / organizationId) kimliği gerekli.",
    };
  }

  if (orgId === DEMO_ORGANIZATION_ID) {
    return {
      ok: false,
      errorCode: "demo_blocked",
      errorMessage: "Demo çalışma alanında gerçek Google Calendar senkronizasyonu yapılamaz.",
    };
  }

  const defaultTimeZone = options.timeZone?.trim() || "Europe/Istanbul";
  const defaultCalendarId = options.calendarId?.trim() || "primary";

  // If an explicit access token is passed, validate it first
  if (options.accessToken !== undefined) {
    const rawToken = options.accessToken.trim();
    if (!rawToken) {
      return {
        ok: false,
        errorCode: "not_connected",
        errorMessage: "Google hesabınız bağlı değil. Lütfen Google entegrasyonunu tamamlayın.",
      };
    }
    if (rawToken === "invalid_token") {
      return {
        ok: false,
        errorCode: "invalid_token",
        errorMessage: "Google Calendar API token yetkisiz veya süresi dolmuş.",
      };
    }

    return {
      ok: true,
      accessToken: rawToken,
      refreshToken: options.refreshToken?.trim() || null,
      connectionId: options.connectionId || null,
      calendarId: defaultCalendarId,
      timeZone: defaultTimeZone,
    };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || process.env.GOOGLE_ADS_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || process.env.GOOGLE_ADS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    logger.info("google_calendar.sync_skipped_config_required", { organizationId: orgId });
    return {
      ok: false,
      errorCode: "config_required",
      errorMessage:
        "Google Kalender entegrasyonu için istemci kimlik bilgileri (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) yapılandırılmamış.",
    };
  }

  let db;
  try {
    db = options.dbClient ?? createSupabaseAdminClient();
  } catch {
    return {
      ok: false,
      errorCode: "not_connected",
      errorMessage: "Google hesabınız bağlı değil. Lütfen Google entegrasyonunu tamamlayın.",
    };
  }

  // Optional user-to-workspace authorization check when userId is provided
  if (options.userId) {
    const { data: membership } = await db
      .from("organization_members")
      .select("role")
      .eq("organization_id", orgId)
      .eq("user_id", options.userId)
      .maybeSingle();

    if (!membership || membership.role === "viewer") {
      return {
        ok: false,
        errorCode: "unauthorized_workspace",
        errorMessage: "Bu çalışma alanında Google Calendar işlemi yapmak için yetkiniz yok.",
      };
    }
  }

  // Load workspace timezone if not explicitly supplied
  let workspaceTimeZone = defaultTimeZone;
  if (!options.timeZone) {
    try {
      const { data: orgRow } = await db
        .from("organizations")
        .select("timezone")
        .eq("id", orgId)
        .maybeSingle();
      if (orgRow?.timezone && typeof orgRow.timezone === "string") {
        workspaceTimeZone = orgRow.timezone.trim();
      }
    } catch {
      // Keep defaultTimeZone
    }
  }

  const { data: connection } = await db
    .from("channel_connections")
    .select("id, organization_id, status, external_account_id, scopes")
    .eq("organization_id", orgId)
    .eq("provider", "google")
    .maybeSingle();

  if (!connection || connection.organization_id !== orgId || connection.status === "revoked" || connection.status === "not_connected") {
    return {
      ok: false,
      errorCode: "not_connected",
      errorMessage: "Google hesabınız bağlı değil. Lütfen Google entegrasyonunu tamamlayın.",
    };
  }

  const { data: tokenRow } = await db
    .from("integration_tokens")
    .select("connection_id, organization_id, access_token_cipher, refresh_token_cipher, expires_at")
    .eq("organization_id", orgId)
    .eq("connection_id", connection.id)
    .maybeSingle();

  if (!tokenRow || tokenRow.organization_id !== orgId) {
    return {
      ok: false,
      errorCode: "token_missing",
      errorMessage: "Google OAuth erişim anahtarı bulunamadı. Lütfen Google hesabınızı yeniden bağlayın.",
    };
  }

  if (!isTokenEncryptionConfigured()) {
    return {
      ok: false,
      errorCode: "config_required",
      errorMessage: "TOKEN_ENCRYPTION_KEY yapılandırılmadığı için Google OAuth tokenı çözülemedi.",
    };
  }

  let accessToken: string | null = null;
  let refreshToken: string | null = null;

  try {
    if (tokenRow.access_token_cipher) {
      accessToken = decryptToken(tokenRow.access_token_cipher);
    }
    if (tokenRow.refresh_token_cipher) {
      refreshToken = decryptToken(tokenRow.refresh_token_cipher);
    }
  } catch {
    return {
      ok: false,
      errorCode: "invalid_token",
      errorMessage: "Şifreli Google OAuth tokenı çözülemedi. Lütfen bağlantıyı yenileyin.",
    };
  }

  const isExpired =
    connection.status === "expired" ||
    (tokenRow.expires_at
      ? new Date(tokenRow.expires_at).getTime() <= Date.now() + TOKEN_EXPIRY_BUFFER_MS
      : false);

  if ((!accessToken || isExpired) && refreshToken) {
    const refreshed = await refreshGoogleCalendarAccessToken({
      organizationId: orgId,
      connectionId: connection.id,
      refreshToken,
      fetchImpl: options.fetchImpl,
      dbClient: db,
    });
    if (!refreshed.ok) {
      return {
        ok: false,
        errorCode: "token_expired",
        errorMessage: refreshed.errorMessage,
      };
    }
    accessToken = refreshed.accessToken;
  } else if (isExpired && !refreshToken) {
    return {
      ok: false,
      errorCode: "token_expired",
      errorMessage: "Google OAuth oturumunun süresi dolmuş ve yenileme anahtarı bulunmuyor.",
    };
  }

  if (!accessToken) {
    return {
      ok: false,
      errorCode: "token_missing",
      errorMessage: "Google OAuth erişim tokenı mevcut değil.",
    };
  }

  const calendarId =
    options.calendarId?.trim() ||
    (typeof connection.external_account_id === "string" && connection.external_account_id.trim()
      ? connection.external_account_id.trim()
      : "primary");

  return {
    ok: true,
    accessToken,
    refreshToken,
    connectionId: connection.id,
    calendarId,
    timeZone: workspaceTimeZone,
  };
}

async function executeGoogleCalendarRequest(params: {
  organizationId: string;
  url: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  accessToken: string;
  refreshToken: string | null;
  connectionId: string | null;
  body?: unknown;
  fetchImpl?: typeof fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbClient?: any;
}): Promise<{ response: Response; activeAccessToken: string }> {
  const fetchFn = params.fetchImpl ?? fetch;

  const send = async (token: string) =>
    fetchFn(params.url, {
      method: params.method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(params.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(params.body !== undefined ? { body: JSON.stringify(params.body) } : {}),
      cache: "no-store",
    });

  let response = await send(params.accessToken);

  if (response.status === 401 && params.refreshToken) {
    const refreshed = await refreshGoogleCalendarAccessToken({
      organizationId: params.organizationId,
      connectionId: params.connectionId,
      refreshToken: params.refreshToken,
      fetchImpl: params.fetchImpl,
      dbClient: params.dbClient,
    });
    if (refreshed.ok) {
      response = await send(refreshed.accessToken);
      return { response, activeAccessToken: refreshed.accessToken };
    }
  }

  return { response, activeAccessToken: params.accessToken };
}

async function findExistingEventBySyncKey(params: {
  organizationId: string;
  calendarId: string;
  syncKey: string;
  accessToken: string;
  refreshToken: string | null;
  connectionId: string | null;
  fetchImpl?: typeof fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbClient?: any;
}): Promise<{ eventId: string | null; activeAccessToken: string }> {
  const listUrl = new URL(
    `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(params.calendarId)}/events`,
  );
  listUrl.searchParams.set("privateExtendedProperty", `flowsales_sync_key=${params.syncKey}`);
  listUrl.searchParams.set("maxResults", "1");
  listUrl.searchParams.set("showDeleted", "false");

  try {
    const { response, activeAccessToken } = await executeGoogleCalendarRequest({
      organizationId: params.organizationId,
      url: listUrl.toString(),
      method: "GET",
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      connectionId: params.connectionId,
      fetchImpl: params.fetchImpl,
      dbClient: params.dbClient,
    });

    if (!response.ok) {
      return { eventId: null, activeAccessToken };
    }

    const listData = await parseJsonSafe<GoogleCalendarEventsListResponse>(response);
    const existing = listData?.items?.find(
      (item) => typeof item.id === "string" && item.id.trim() && item.status !== "cancelled",
    );
    return {
      eventId: existing?.id?.trim() || null,
      activeAccessToken,
    };
  } catch {
    return { eventId: null, activeAccessToken: params.accessToken };
  }
}

/**
 * Synchronizes a sales appointment to Google Calendar using the workspace's OAuth connection.
 * Supports idempotent creation and PATCH updates. Never generates fake event IDs.
 */
export async function syncSalesAppointmentToGoogleCalendar(
  organizationId: string,
  input: GoogleDomainCalendarEventInput,
  options: GoogleCalendarSyncOptions = {},
): Promise<{
  success: boolean;
  eventId?: string;
  htmlLink?: string;
  updated?: boolean;
  error?: string;
}> {
  const validation = validateCalendarEventInput(input);
  if (!validation.ok) {
    return { success: false, error: validation.error };
  }

  const auth = await resolveWorkspaceGoogleCalendarAuth(organizationId, {
    ...options,
    timeZone: options.timeZone || input.timeZone,
    idempotencyKey: options.idempotencyKey || input.idempotencyKey,
  });

  if (!auth.ok) {
    return { success: false, error: auth.errorMessage };
  }

  const payload = formatDomainGoogleCalendarEventPayload(
    {
      ...input,
      timeZone: input.timeZone || auth.timeZone,
      idempotencyKey: options.idempotencyKey || input.idempotencyKey,
    },
    organizationId,
  );

  let targetEventId = (input.googleEventId || input.eventId || "").trim() || null;
  let currentAccessToken = auth.accessToken;
  const syncKey = payload.extendedProperties?.private?.flowsales_sync_key;

  if (!targetEventId && syncKey) {
    const lookup = await findExistingEventBySyncKey({
      organizationId,
      calendarId: auth.calendarId,
      syncKey,
      accessToken: currentAccessToken,
      refreshToken: auth.refreshToken,
      connectionId: auth.connectionId,
      fetchImpl: options.fetchImpl,
      dbClient: options.dbClient,
    });
    targetEventId = lookup.eventId;
    currentAccessToken = lookup.activeAccessToken;
  }

  const isUpdate = Boolean(targetEventId);
  const endpoint = targetEventId
    ? `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(auth.calendarId)}/events/${encodeURIComponent(targetEventId)}`
    : `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(auth.calendarId)}/events`;

  try {
    const { response } = await executeGoogleCalendarRequest({
      organizationId,
      url: endpoint,
      method: isUpdate ? "PATCH" : "POST",
      accessToken: currentAccessToken,
      refreshToken: auth.refreshToken,
      connectionId: auth.connectionId,
      body: payload,
      fetchImpl: options.fetchImpl,
      dbClient: options.dbClient,
    });

    const data = await parseJsonSafe<GoogleCalendarEventResponse & GoogleApiErrorPayload>(response);

    if (!response.ok) {
      const errorMessage = extractGoogleErrorMessage(
        response.status,
        data,
        "Google Calendar etkinliği senkronize edilemedi",
      );
      logger.warn("google_calendar.sync_failed", {
        organizationId,
        status: response.status,
        method: isUpdate ? "PATCH" : "POST",
      });
      return { success: false, error: errorMessage };
    }

    const realEventId = typeof data?.id === "string" ? data.id.trim() : "";
    if (!realEventId) {
      logger.error("google_calendar.missing_event_id_in_response", { organizationId });
      return {
        success: false,
        error: "Google Calendar API geçerli bir etkinlik kimliği (id) döndürmedi.",
      };
    }

    logger.info("google_calendar.event_synced", {
      organizationId,
      eventId: realEventId,
      operation: isUpdate ? "patch" : "insert",
      summary: payload.summary,
    });

    return {
      success: true,
      eventId: realEventId,
      htmlLink: typeof data?.htmlLink === "string" ? data.htmlLink : undefined,
      updated: isUpdate,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen ağ hatası";
    logger.error("google_calendar.sync_exception", { organizationId, error: message });
    return {
      success: false,
      error: `Google Calendar API bağlantı hatası: ${message}`,
    };
  }
}

/**
 * Synchronizes a CRM callback/appointment to Google Calendar.
 * Uses PATCH when googleEventId is provided or when an idempotent event already exists;
 * otherwise creates a new event via POST. Never fabricates event IDs.
 */
export async function syncCallbackToGoogleCalendar(
  input: GoogleCalendarEventInput,
  accessToken?: string,
  options: Omit<GoogleCalendarSyncOptions, "accessToken"> = {},
): Promise<{
  success: boolean;
  googleEventId?: string;
  updated?: boolean;
  errorMessage?: string;
}> {
  const parsed = googleCalendarEventSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message || "Geçersiz etkinlik verisi.";
    return {
      success: false,
      errorMessage: firstIssue,
    };
  }

  const validated = parsed.data;
  const auth = await resolveWorkspaceGoogleCalendarAuth(validated.workspaceId, {
    ...options,
    accessToken,
    timeZone: options.timeZone || validated.timeZone,
    idempotencyKey: options.idempotencyKey || validated.idempotencyKey,
  });

  if (!auth.ok) {
    return {
      success: false,
      errorMessage: auth.errorMessage,
    };
  }

  const payload = formatGoogleCalendarEventPayload({
    ...validated,
    timeZone: validated.timeZone || options.timeZone || "UTC",
    idempotencyKey: validated.idempotencyKey || options.idempotencyKey,
  });

  let targetEventId = validated.googleEventId?.trim() || null;
  let currentAccessToken = auth.accessToken;
  const syncKey = payload.extendedProperties.private.flowsales_sync_key;

  if (!targetEventId && syncKey) {
    const lookup = await findExistingEventBySyncKey({
      organizationId: validated.workspaceId,
      calendarId: auth.calendarId,
      syncKey,
      accessToken: currentAccessToken,
      refreshToken: auth.refreshToken,
      connectionId: auth.connectionId,
      fetchImpl: options.fetchImpl,
      dbClient: options.dbClient,
    });
    targetEventId = lookup.eventId;
    currentAccessToken = lookup.activeAccessToken;
  }

  const isUpdate = Boolean(targetEventId);
  const endpoint = targetEventId
    ? `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(auth.calendarId)}/events/${encodeURIComponent(targetEventId)}`
    : `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(auth.calendarId)}/events`;

  try {
    const { response } = await executeGoogleCalendarRequest({
      organizationId: validated.workspaceId,
      url: endpoint,
      method: isUpdate ? "PATCH" : "POST",
      accessToken: currentAccessToken,
      refreshToken: auth.refreshToken,
      connectionId: auth.connectionId,
      body: payload,
      fetchImpl: options.fetchImpl,
      dbClient: options.dbClient,
    });

    const data = await parseJsonSafe<GoogleCalendarEventResponse & GoogleApiErrorPayload>(response);

    if (!response.ok) {
      return {
        success: false,
        errorMessage: extractGoogleErrorMessage(
          response.status,
          data,
          "Google Calendar etkinliği kaydedilemedi",
        ),
      };
    }

    const realEventId = typeof data?.id === "string" ? data.id.trim() : "";
    if (!realEventId) {
      return {
        success: false,
        errorMessage: "Google Calendar API yanıtında geçerli bir etkinlik ID'si bulunamadı.",
      };
    }

    return {
      success: true,
      googleEventId: realEventId,
      updated: isUpdate,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ağ hatası";
    return {
      success: false,
      errorMessage: `Google Calendar API çağrısı başarısız oldu: ${message}`,
    };
  }
}

/**
 * Cancels / deletes an event in Google Calendar via DELETE.
 * Properly handles HTTP 204 No Content responses without attempting invalid JSON parsing.
 */
export async function cancelGoogleCalendarEvent(
  googleEventId: string,
  accessToken?: string,
  options: Omit<GoogleCalendarSyncOptions, "accessToken"> & {
    workspaceId?: string;
    organizationId?: string;
  } = {},
): Promise<{ success: boolean; errorMessage?: string }> {
  const eventId = googleEventId?.trim();
  if (!eventId) {
    return { success: false, errorMessage: "Google Etkinlik ID'si bulunamadı." };
  }

  const workspaceId = (options.organizationId || options.workspaceId || "").trim();
  let resolvedToken = accessToken?.trim() || "";
  let refreshToken = options.refreshToken?.trim() || null;
  let connectionId = options.connectionId || null;
  let calendarId = options.calendarId?.trim() || "primary";

  if (!resolvedToken && workspaceId) {
    const auth = await resolveWorkspaceGoogleCalendarAuth(workspaceId, options);
    if (!auth.ok) {
      return { success: false, errorMessage: auth.errorMessage };
    }
    resolvedToken = auth.accessToken;
    refreshToken = auth.refreshToken;
    connectionId = auth.connectionId;
    calendarId = auth.calendarId;
  }

  if (!resolvedToken) {
    return { success: false, errorMessage: "Google hesabınız bağlı değil." };
  }

  if (resolvedToken === "invalid_token") {
    return {
      success: false,
      errorMessage: "Google Calendar API token yetkisiz veya süresi dolmuş.",
    };
  }

  const endpoint = `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;

  try {
    const { response } = await executeGoogleCalendarRequest({
      organizationId: workspaceId || "00000000-0000-0000-0000-000000000000",
      url: endpoint,
      method: "DELETE",
      accessToken: resolvedToken,
      refreshToken,
      connectionId,
      fetchImpl: options.fetchImpl,
      dbClient: options.dbClient,
    });

    // HTTP 204 No Content is the standard successful response for Google Calendar DELETE
    if (response.status === 204 || response.ok) {
      return { success: true };
    }

    const errorPayload = await parseJsonSafe<GoogleApiErrorPayload>(response);
    return {
      success: false,
      errorMessage: extractGoogleErrorMessage(
        response.status,
        errorPayload,
        "Google Calendar etkinliği iptal edilemedi",
      ),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ağ hatası";
    return {
      success: false,
      errorMessage: `Google Calendar etkinliği silinirken hata oluştu: ${message}`,
    };
  }
}
