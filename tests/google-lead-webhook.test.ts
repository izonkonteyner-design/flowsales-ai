import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseGoogleLeadPayload,
  googleLeadPayloadSchema,
} from "@/lib/validations/google-lead-ingestion";

const testsDir = dirname(fileURLToPath(import.meta.url));
const webhookRoutePath = join(testsDir, "..", "app", "api", "webhooks", "google-leads", "route.ts");
const webhookRouteSource = readFileSync(webhookRoutePath, "utf8");

test("google leads webhook route has server-only guard and handles workspace parameter", () => {
  assert.match(webhookRouteSource, /import "server-only";/);
  assert.match(webhookRouteSource, /workspace_id/);
  assert.match(webhookRouteSource, /processGoogleLeadSubmission/);
  assert.match(webhookRouteSource, /GOOGLE_ADS_WEBHOOK_KEY/);
});

test("parseGoogleLeadPayload extracts lead form columns into normalized contact record", () => {
  const rawPayload = {
    lead_id: "glead_998877",
    form_id: "gform_123",
    campaign_id: "gcamp_456",
    user_column_data: [
      { column_id: "FULL_NAME", string_value: "Mehmet Demir" },
      { column_id: "EMAIL", string_value: "mehmet@example.com" },
      { column_id: "PHONE_NUMBER", string_value: "+905321112233" },
      { column_id: "COMPANY_NAME", string_value: "Demir İnşaat" },
    ],
  };

  const parsed = parseGoogleLeadPayload(rawPayload);
  assert.equal(parsed.googleLeadId, "glead_998877");
  assert.equal(parsed.formId, "gform_123");
  assert.equal(parsed.campaignId, "gcamp_456");
  assert.equal(parsed.fullName, "Mehmet Demir");
  assert.equal(parsed.email, "mehmet@example.com");
  assert.equal(parsed.phoneNumber, "+905321112233");
  assert.equal(parsed.companyName, "Demir İnşaat");
});

test("googleLeadPayloadSchema rejects missing lead_id or invalid payload", () => {
  assert.throws(
    () => googleLeadPayloadSchema.parse({ form_id: "f1" }),
    /lead_id/
  );
});
