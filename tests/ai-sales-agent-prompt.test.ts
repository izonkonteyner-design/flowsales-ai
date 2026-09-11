import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAiSalesAgentPrompt,
  parseAiSalesAgentResponse,
  AiSalesAgentServiceError,
} from "@/lib/validations/ai-sales-agent";
import type { Activity, Task } from "@/types/crm";

type LeadInput = Parameters<typeof buildAiSalesAgentPrompt>[0];

// ---------------------------------------------------------------------------
// buildAiSalesAgentPrompt
// ---------------------------------------------------------------------------

function baseLead(): LeadInput["lead"] {
  return {
    id: "lead-1",
    full_name: "Ahmet Yilmaz",
    company: "Yilmaz Ticaret",
    email: "ahmet@example.com",
    phone: "+90-555-000-0001",
    city: "Istanbul",
    source: "website",
    status: "qualified",
    estimated_value: 420000,
    currency: "TRY",
    notes: "Awaiting install confirmation.",
    next_follow_up_at: null,
    created_at: "2026-07-01T10:00:00Z",
  };
}

function baseOrganization(): LeadInput["organization"] {
  return {
    name: "FlowSales Demo",
    city: "Istanbul",
    default_payment_terms: "Net 30",
    default_delivery_terms: "FOB",
  };
}

test("buildAiSalesAgentPrompt includes lead id, name, stage and budget in the prompt", () => {
  const prompt = buildAiSalesAgentPrompt({
    lead: baseLead(),
    tasks: [],
    activities: [],
    relatedQuotes: [],
    organization: baseOrganization(),
    availableProducts: [],
  });

  assert.match(prompt, /lead-1/);
  assert.match(prompt, /Ahmet Yilmaz/);
  assert.match(prompt, /qualified/);
  assert.match(prompt, /420.000 TRY/);
});

test("buildAiSalesAgentPrompt caps tasks and activities to keep the prompt bounded", () => {
  const manyTasks: Task[] = Array.from({ length: 25 }, (_, i) => ({
    id: `task-${i}`,
    organization_id: "org-1",
    lead_id: "lead-1",
    title: `Task ${i}`,
    due_at: "2026-08-01",
    priority: "medium",
    assigned_to: "user-1",
    status: "open",
    created_at: "2026-07-01",
    updated_at: "2026-07-01",
  }));
  const manyActivities: Activity[] = Array.from({ length: 25 }, (_, i) => ({
    id: `act-${i}`,
    organization_id: "org-1",
    lead_id: "lead-1",
    quote_id: null,
    type: "note",
    title: `Activity ${i}`,
    detail: "",
    created_by: "user-1",
    created_at: "2026-07-01",
    updated_at: "2026-07-01",
  }));

  const prompt = buildAiSalesAgentPrompt({
    lead: baseLead(),
    tasks: manyTasks,
    activities: manyActivities,
    relatedQuotes: [],
    organization: baseOrganization(),
    availableProducts: [],
  });

  const taskOccurrences = (prompt.match(/Task \d+/g) ?? []).length;
  const activityOccurrences = (prompt.match(/Activity \d+/g) ?? []).length;
  assert.ok(taskOccurrences <= 10, `tasks should be capped (got ${taskOccurrences})`);
  assert.ok(activityOccurrences <= 12, `activities should be capped (got ${activityOccurrences})`);
  assert.ok(taskOccurrences > 0, "tasks should appear");
  assert.ok(activityOccurrences > 0, "activities should appear");
});

test("buildAiSalesAgentPrompt warns against inventing prices and catalog ids", () => {
  const prompt = buildAiSalesAgentPrompt({
    lead: baseLead(),
    tasks: [],
    activities: [],
    relatedQuotes: [],
    organization: baseOrganization(),
    availableProducts: [],
  });
  assert.match(prompt, /Never invent prices/);
  assert.match(prompt, /MUST be one of the catalog product ids/);
});

test("buildAiSalesAgentPrompt warns not to recommend products when catalog is empty", () => {
  const prompt = buildAiSalesAgentPrompt({
    lead: baseLead(),
    tasks: [],
    activities: [],
    relatedQuotes: [],
    organization: baseOrganization(),
    availableProducts: [],
  });
  assert.match(prompt, /do not recommend products or quote suggestions/);
});

test("buildAiSalesAgentPrompt includes workspace system prompt when provided", () => {
  const prompt = buildAiSalesAgentPrompt(
    {
      lead: baseLead(),
      tasks: [],
      activities: [],
      relatedQuotes: [],
      organization: baseOrganization(),
      availableProducts: [],
    },
    { workspacePrompt: "Always end with a discount cap of 10%." },
  );
  assert.match(prompt, /Workspace system prompt/);
  assert.match(prompt, /Always end with a discount cap of 10%/);
});

test("buildAiSalesAgentPrompt lists authorized product ids from the catalog", () => {
  const prompt = buildAiSalesAgentPrompt({
    lead: baseLead(),
    tasks: [],
    activities: [],
    relatedQuotes: [],
    organization: baseOrganization(),
    availableProducts: [
      {
        id: "prod-1",
        name: "Konteyner 20ft",
        sku: "K-20",
        unit: "adet",
        currency: "TRY",
        unit_price: 35000,
        base_price: null,
      },
    ],
  });
  assert.match(prompt, /prod-1/);
  assert.match(prompt, /Konteyner 20ft/);
});

// ---------------------------------------------------------------------------
// parseAiSalesAgentResponse
// ---------------------------------------------------------------------------

test("parseAiSalesAgentResponse accepts a valid recommendation", () => {
  const valid = JSON.stringify({
    summary: "Ahmet is qualified.",
    leadScore: 70,
    priority: "high",
    reasoning: ["Stage qualified"],
    nextBestAction: { type: "call", description: "Call back tomorrow." },
  });
  const parsed = parseAiSalesAgentResponse(valid);
  assert.equal(parsed.priority, "high");
  assert.equal(parsed.leadScore, 70);
});

test("parseAiSalesAgentResponse rejects empty input with invalid_output", () => {
  assert.throws(
    () => parseAiSalesAgentResponse(""),
    (err: unknown) => err instanceof AiSalesAgentServiceError && err.code === "invalid_output",
  );
});

test("parseAiSalesAgentResponse rejects malformed JSON with invalid_output", () => {
  assert.throws(
    () => parseAiSalesAgentResponse("{not json"),
    (err: unknown) => err instanceof AiSalesAgentServiceError && err.code === "invalid_output",
  );
});

test("parseAiSalesAgentResponse rejects valid JSON that violates the schema", () => {
  assert.throws(
    () => parseAiSalesAgentResponse(JSON.stringify({ summary: "x", leadScore: 999, priority: "nope" })),
    (err: unknown) => err instanceof AiSalesAgentServiceError && err.code === "invalid_output",
  );
});
