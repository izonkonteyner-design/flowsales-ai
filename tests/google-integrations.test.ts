import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { describe } from "node:test";
import assert from "node:assert/strict";

import {
  googleCalendarEventSchema,
  formatGoogleCalendarEventPayload,
} from "@/lib/validations/google-calendar";
import { parseGoogleLeadPayload } from "@/lib/validations/google-lead-ingestion";

const testsDir = dirname(fileURLToPath(import.meta.url));
const calendarServicePath = join(testsDir, "..", "server", "services", "integrations", "google-calendar.ts");
const leadIngestionPath = join(testsDir, "..", "server", "services", "integrations", "google-lead-ingestion.ts");

const calendarServiceSource = readFileSync(calendarServicePath, "utf8");
const leadIngestionSource = readFileSync(leadIngestionPath, "utf8");

describe("Google Integrations Tests", () => {
  test("google-calendar.ts and google-lead-ingestion.ts have import server-only", () => {
    assert.match(calendarServiceSource, /import "server-only";/);
    assert.match(leadIngestionSource, /import "server-only";/);
  });

  test("googleCalendarEventSchema validates required calendar event attributes", () => {
    const valid = googleCalendarEventSchema.parse({
      workspaceId: "550e8400-e29b-41d4-a716-446655440000",
      summary: "Müşteri Geri Arama Görüşmesi",
      startTime: "2026-04-10T09:00:00Z",
      endTime: "2026-04-10T09:30:00Z",
    });

    assert.equal(valid.workspaceId, "550e8400-e29b-41d4-a716-446655440000");
    assert.equal(valid.summary, "Müşteri Geri Arama Görüşmesi");

    assert.throws(
      () =>
        googleCalendarEventSchema.parse({
          workspaceId: "550e8400-e29b-41d4-a716-446655440000",
          summary: "",
          startTime: "invalid-date",
          endTime: "invalid-date",
        }),
      /Etkinlik başlığı boş olamaz/
    );
  });

  test("formatGoogleCalendarEventPayload formats payload with private workspace metadata", () => {
    const payload = formatGoogleCalendarEventPayload({
      workspaceId: "550e8400-e29b-41d4-a716-446655440000",
      leadId: "660e8400-e29b-41d4-a716-446655440000",
      summary: "Demo Toplantısı",
      startTime: "2026-04-10T10:00:00Z",
      endTime: "2026-04-10T11:00:00Z",
    });

    assert.equal(payload.summary, "Demo Toplantısı");
    assert.equal(payload.start.dateTime, "2026-04-10T10:00:00Z");
    assert.equal(payload.extendedProperties.private.flowsales_workspace_id, "550e8400-e29b-41d4-a716-446655440000");
    assert.equal(payload.extendedProperties.private.flowsales_lead_id, "660e8400-e29b-41d4-a716-446655440000");
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
