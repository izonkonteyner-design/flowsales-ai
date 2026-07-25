import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  aiResponseSchema,
  createLeadDraftPayloadSchema,
  createQuoteDraftPayloadSchema,
} from "../server/ai-agents/schema";

const testsDir = dirname(fileURLToPath(import.meta.url));
const actionSource = readFileSync(
  join(testsDir, "..", "server", "ai-agents", "actions", "index.ts"),
  "utf8"
);
const rateLimitSource = readFileSync(
  join(testsDir, "..", "server", "ai-agents", "rate-limit.ts"),
  "utf8"
);

test("AI Sales Agent Schema Validation", async (t) => {
  await t.test("accepts valid aiResponse with actions", () => {
    const validPayload = {
      message: "Here is your quote",
      intent: "sales",
      confidence: 0.9,
      handoff_flag: false,
      proposed_actions: [
        {
          action_type: "create_quote_draft",
          payload: {
            lead_id: "d3e00004-0000-0000-0000-000000000000",
            items: [{ product_id: "d3e00001-0000-0000-0000-000000000000", quantity: 2 }]
          }
        }
      ]
    };

    const parsed = aiResponseSchema.parse(validPayload);
    assert.strictEqual(parsed.intent, "sales");
    assert.strictEqual(parsed.proposed_actions?.length, 1);
  });

  await t.test("rejects missing required fields in aiResponse", () => {
    const invalidPayload = {
      message: "Hello",
    };
    assert.throws(() => aiResponseSchema.parse(invalidPayload));
  });

  await t.test("createQuoteDraftPayloadSchema enforces positive quantity", () => {
    const invalidPayload = {
      lead_id: "d3e00004-0000-0000-0000-000000000000",
      items: [{ product_id: "d3e00001-0000-0000-0000-000000000000", quantity: -5 }]
    };
    assert.throws(() => createQuoteDraftPayloadSchema.parse(invalidPayload));
  });

  await t.test("createLeadDraftPayloadSchema requires full_name", () => {
    const invalidPayload = {
      email: "test@test.com",
    };
    assert.throws(() => createLeadDraftPayloadSchema.parse(invalidPayload));
  });
});

test("AI Action Execution Authorization", async (t) => {
  await t.test("executeAiAction blocks demo mode before any database mutation", () => {
    // Static analysis guard: demoMode check must appear before adminClient creation
    // so no service-role client is ever constructed in demo mode.
    const demoGuardIndex = actionSource.indexOf("if (demoMode)");
    const adminClientIndex = actionSource.indexOf("createSupabaseAdminClient()");

    assert.ok(demoGuardIndex > -1, "executeAiAction must include a demoMode guard");
    assert.ok(adminClientIndex > -1, "executeAiAction must create the admin client");
    assert.ok(
      demoGuardIndex < adminClientIndex,
      "demoMode guard must run before the admin client is constructed"
    );

    const guardText = actionSource.slice(demoGuardIndex, adminClientIndex);
    assert.match(
      guardText,
      /Mutations are strictly prohibited in Demo Mode/,
      "demoMode guard must throw before reaching the admin client"
    );
  });

  await t.test("rate limit check precedes the demo guard so demo is never throttled", () => {
    const rateLimitIndex = actionSource.indexOf("checkAiRateLimit");
    const demoGuardIndex = actionSource.indexOf("if (demoMode)");

    assert.ok(rateLimitIndex > -1, "rate limit must be invoked");
    assert.ok(rateLimitIndex < demoGuardIndex, "rate limit must run before the demo guard");
  });

  await t.test("rate-limit helper fails secure when the rpc errors", () => {
    assert.match(rateLimitSource, /return false;\s*\/\/ Fail secure/);
  });
});
