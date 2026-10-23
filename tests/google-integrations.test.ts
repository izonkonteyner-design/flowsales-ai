import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { describe } from "node:test";
import assert from "node:assert/strict";

const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as NodeModule;

import {
  googleCalendarEventSchema,
  formatGoogleCalendarEventPayload,
} from "@/lib/validations/google-calendar";
import { parseGoogleLeadPayload } from "@/lib/validations/google-lead-ingestion";
import { encryptToken } from "@/server/services/integrations/encryption";

const {
  syncSalesAppointmentToGoogleCalendar,
  syncCallbackToGoogleCalendar,
  cancelGoogleCalendarEvent,
  refreshGoogleCalendarAccessToken,
  resolveWorkspaceGoogleCalendarAuth,
} = req("../server/services/integrations/google-calendar") as typeof import("@/server/services/integrations/google-calendar");

const testsDir = dirname(fileURLToPath(import.meta.url));
const calendarServicePath = join(testsDir, "..", "server", "services", "integrations", "google-calendar.ts");
const leadIngestionPath = join(testsDir, "..", "server", "services", "integrations", "google-lead-ingestion.ts");

const calendarServiceSource = readFileSync(calendarServicePath, "utf8");
const leadIngestionSource = readFileSync(leadIngestionPath, "utf8");

const WORKSPACE_A = "550e8400-e29b-41d4-a716-446655440000";
const WORKSPACE_B = "770e8400-e29b-41d4-a716-446655440000";
const DEMO_WORKSPACE = "d3e00000-0000-0000-0000-000000000000";
const TEST_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("Google Integrations Tests", () => {
  test("google-calendar.ts and google-lead-ingestion.ts have import server-only and no fake ID generators", () => {
    assert.match(calendarServiceSource, /import "server-only";/);
    assert.match(leadIngestionSource, /import "server-only";/);
    assert.doesNotMatch(calendarServiceSource, /gcal_\$\{Date\.now\(\)\}/);
    assert.doesNotMatch(calendarServiceSource, /gcal_evt_\$\{Date\.now\(\)\}/);
  });

  test("googleCalendarEventSchema validates required calendar event attributes", () => {
    const valid = googleCalendarEventSchema.parse({
      workspaceId: WORKSPACE_A,
      summary: "Müşteri Geri Arama Görüşmesi",
      startTime: "2026-04-10T09:00:00Z",
      endTime: "2026-04-10T09:30:00Z",
    });

    assert.equal(valid.workspaceId, WORKSPACE_A);
    assert.equal(valid.summary, "Müşteri Geri Arama Görüşmesi");

    assert.throws(
      () =>
        googleCalendarEventSchema.parse({
          workspaceId: WORKSPACE_A,
          summary: "",
          startTime: "invalid-date",
          endTime: "invalid-date",
        }),
      /Etkinlik başlığı boş olamaz/,
    );
  });

  test("formatGoogleCalendarEventPayload formats payload with private workspace metadata and timezone", () => {
    const payload = formatGoogleCalendarEventPayload({
      workspaceId: WORKSPACE_A,
      leadId: "660e8400-e29b-41d4-a716-446655440000",
      summary: "Demo Toplantısı",
      startTime: "2026-04-10T10:00:00Z",
      endTime: "2026-04-10T11:00:00Z",
    });

    assert.equal(payload.summary, "Demo Toplantısı");
    assert.equal(payload.start.dateTime, "2026-04-10T10:00:00Z");
    assert.equal(payload.start.timeZone, "UTC");
    assert.equal(payload.extendedProperties.private.flowsales_workspace_id, WORKSPACE_A);
    assert.equal(payload.extendedProperties.private.flowsales_lead_id, "660e8400-e29b-41d4-a716-446655440000");

    const istanbulPayload = formatGoogleCalendarEventPayload({
      workspaceId: WORKSPACE_A,
      summary: "İstanbul Toplantısı",
      startTime: "2026-04-10T10:00:00Z",
      endTime: "2026-04-10T11:00:00Z",
      timeZone: "Europe/Istanbul",
      idempotencyKey: "idem_123",
    });
    assert.equal(istanbulPayload.start.timeZone, "Europe/Istanbul");
    assert.equal(istanbulPayload.extendedProperties.private.flowsales_sync_key, "idem_123");
  });

  test("syncCallbackToGoogleCalendar creates event via POST and returns real Google event ID", async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const mockFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push({
        url,
        method: init?.method || "GET",
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });

      if (init?.method === "GET") {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }

      return new Response(
        JSON.stringify({
          id: "google_real_event_98765",
          status: "confirmed",
          htmlLink: "https://calendar.google.com/calendar/event?eid=98765",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const result = await syncCallbackToGoogleCalendar(
      {
        workspaceId: WORKSPACE_A,
        leadId: "660e8400-e29b-41d4-a716-446655440000",
        summary: "Satış Görüşmesi",
        startTime: "2026-04-12T14:00:00Z",
        endTime: "2026-04-12T14:30:00Z",
      },
      "ya29.valid_access_token",
      { fetchImpl: mockFetch },
    );

    assert.equal(result.success, true);
    assert.equal(result.googleEventId, "google_real_event_98765");
    assert.equal(result.updated, false);
    const postCall = calls.find((c) => c.method === "POST");
    assert.ok(postCall, "Expected POST request to Google Calendar API");
    assert.match(postCall.url, /\/calendars\/primary\/events$/);
  });

  test("syncCallbackToGoogleCalendar uses PATCH when googleEventId is provided or idempotent match exists", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const mockFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || "GET";
      calls.push({ url, method });

      if (method === "GET") {
        return new Response(
          JSON.stringify({
            items: [{ id: "existing_event_id_42", status: "confirmed" }],
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          id: "existing_event_id_42",
          status: "confirmed",
        }),
        { status: 200 },
      );
    };

    // 1. Idempotent lookup matches existing event -> uses PATCH instead of POST
    const idempotentRes = await syncSalesAppointmentToGoogleCalendar(
      WORKSPACE_A,
      {
        summary: "Tekrarlanan Randevu Senkronizasyonu",
        startTime: "2026-04-15T10:00:00Z",
        endTime: "2026-04-15T11:00:00Z",
        idempotencyKey: "appt_unique_key_42",
      },
      {
        accessToken: "ya29.valid_token",
        fetchImpl: mockFetch,
      },
    );

    assert.equal(idempotentRes.success, true);
    assert.equal(idempotentRes.eventId, "existing_event_id_42");
    assert.equal(idempotentRes.updated, true);
    assert.ok(calls.some((c) => c.method === "GET" && c.url.includes("flowsales_sync_key")));
    assert.ok(calls.some((c) => c.method === "PATCH" && c.url.endsWith("/events/existing_event_id_42")));
    assert.ok(!calls.some((c) => c.method === "POST"));
  });

  test("cancelGoogleCalendarEvent sends DELETE and handles HTTP 204 No Content safely", async () => {
    let deleteCalledUrl = "";
    const mockFetch204: typeof fetch = async (input, init) => {
      deleteCalledUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      assert.equal(init?.method, "DELETE");
      return new Response(null, { status: 204 });
    };

    const res = await cancelGoogleCalendarEvent("google_evt_to_delete_1", "ya29.valid_token", {
      fetchImpl: mockFetch204,
    });
    assert.equal(res.success, true);
    assert.match(deleteCalledUrl, /\/calendars\/primary\/events\/google_evt_to_delete_1$/);

    // 404 Not Found should not report success
    const mockFetch404: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { code: 404, message: "Not Found" } }), { status: 404 });

    const res404 = await cancelGoogleCalendarEvent("missing_evt", "ya29.valid_token", {
      fetchImpl: mockFetch404,
    });
    assert.equal(res404.success, false);
    assert.match(res404.errorMessage!, /bulunamadı/);
  });

  test("OAuth token refresh on expired token or 401 response persists encrypted token and retries", async () => {
    const prevClientId = process.env.GOOGLE_CLIENT_ID;
    const prevClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const prevEncKey = process.env.TOKEN_ENCRYPTION_KEY;

    process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
    process.env.TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;

    try {
      let persistedCipher: string | null = null;
      const mockDb = {
        from(table: string) {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            maybeSingle: async () => {
              if (table === "channel_connections") {
                return {
                  data: {
                    id: "conn-google-1",
                    organization_id: WORKSPACE_A,
                    status: "connected",
                    external_account_id: "primary",
                    scopes: ["https://www.googleapis.com/auth/calendar.events"],
                  },
                };
              }
              if (table === "integration_tokens") {
                return {
                  data: {
                    connection_id: "conn-google-1",
                    organization_id: WORKSPACE_A,
                    access_token_cipher: encryptToken("expired_access_token"),
                    refresh_token_cipher: encryptToken("valid_refresh_token_abc"),
                    expires_at: new Date(Date.now() - 120_000).toISOString(), // expired 2 mins ago
                  },
                };
              }
              if (table === "organizations") {
                return { data: { timezone: "Europe/Istanbul" } };
              }
              return { data: null };
            },
            update(values: Record<string, unknown>) {
              if (table === "integration_tokens" && typeof values.access_token_cipher === "string") {
                persistedCipher = values.access_token_cipher;
              }
              return {
                eq() {
                  return this;
                },
              };
            },
          };
        },
      };

      const mockFetch: typeof fetch = async (input) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url === "https://oauth2.googleapis.com/token") {
          return new Response(
            JSON.stringify({
              access_token: "fresh_google_access_token_999",
              expires_in: 3600,
              token_type: "Bearer",
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({ id: "cal_event_after_refresh_1", status: "confirmed" }),
          { status: 200 },
        );
      };

      const syncRes = await syncSalesAppointmentToGoogleCalendar(
        WORKSPACE_A,
        {
          summary: "Yenilenmiş Token ile Toplantı",
          startTime: "2026-05-01T09:00:00Z",
          endTime: "2026-05-01T10:00:00Z",
        },
        {
          fetchImpl: mockFetch,
          dbClient: mockDb,
        },
      );

      assert.equal(syncRes.success, true);
      assert.equal(syncRes.eventId, "cal_event_after_refresh_1");
      assert.ok(persistedCipher, "Refreshed access token must be encrypted and persisted to integration_tokens");

      const failedRefreshRes = await refreshGoogleCalendarAccessToken({
        organizationId: WORKSPACE_A,
        refreshToken: "invalid_refresh_token",
      });
      assert.equal(failedRefreshRes.ok, false);
    } finally {
      process.env.GOOGLE_CLIENT_ID = prevClientId;
      process.env.GOOGLE_CLIENT_SECRET = prevClientSecret;
      process.env.TOKEN_ENCRYPTION_KEY = prevEncKey;
    }
  });

  test("Workspace authorization blocks demo workspace, unauthorized users, and cross-workspace token leakage", async () => {
    const prevClientId = process.env.GOOGLE_CLIENT_ID;
    const prevClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";

    try {
      // 1. Demo workspace blocked
      const demoAuth = await resolveWorkspaceGoogleCalendarAuth(DEMO_WORKSPACE, {
        accessToken: "ya29.any",
      });
      assert.equal(demoAuth.ok, false);
      if (!demoAuth.ok) {
        assert.equal(demoAuth.errorCode, "demo_blocked");
      }

      // 2. Viewer role blocked from calendar write operations
      const viewerDb = {
        from(table: string) {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            maybeSingle: async () => {
              if (table === "organization_members") {
                return { data: { role: "viewer" } };
              }
              return { data: null };
            },
          };
        },
      };
      const viewerAuth = await resolveWorkspaceGoogleCalendarAuth(WORKSPACE_A, {
        userId: "880e8400-e29b-41d4-a716-446655440000",
        dbClient: viewerDb,
      });
      assert.equal(viewerAuth.ok, false);
      if (!viewerAuth.ok) {
        assert.equal(viewerAuth.errorCode, "unauthorized_workspace");
      }

      // 3. Cross-workspace connection row mismatch rejected
      const crossTenantDb = {
        from(table: string) {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            maybeSingle: async () => {
              if (table === "channel_connections") {
                return {
                  data: {
                    id: "conn-b",
                    organization_id: WORKSPACE_B, // belongs to Workspace B, not A!
                    status: "connected",
                  },
                };
              }
              return { data: null };
            },
          };
        },
      };
      const crossAuth = await resolveWorkspaceGoogleCalendarAuth(WORKSPACE_A, {
        dbClient: crossTenantDb,
      });
      assert.equal(crossAuth.ok, false);
      if (!crossAuth.ok) {
        assert.equal(crossAuth.errorCode, "not_connected");
      }
    } finally {
      process.env.GOOGLE_CLIENT_ID = prevClientId;
      process.env.GOOGLE_CLIENT_SECRET = prevClientSecret;
    }
  });

  test("parseGoogleLeadPayload extracts lead fields from Google column data", () => {
    const parsed = parseGoogleLeadPayload({
      lead_id: "glead_12345",
      form_id: "gform_67890",
      campaign_id: "gcamp_999",
      user_column_data: [
        { column_id: "FULL_NAME", string_value: "Mehmet Demir" },
        { column_id: "EMAIL", string_value: "mehmet@demir.com" },
        { column_id: "PHONE_NUMBER", string_value: "+905321112233" },
        { column_id: "COMPANY_NAME", string_value: "Demir Lojistik" },
      ],
    });

    assert.equal(parsed.googleLeadId, "glead_12345");
    assert.equal(parsed.fullName, "Mehmet Demir");
    assert.equal(parsed.email, "mehmet@demir.com");
    assert.equal(parsed.phoneNumber, "+905321112233");
    assert.equal(parsed.companyName, "Demir Lojistik");
  });
});
