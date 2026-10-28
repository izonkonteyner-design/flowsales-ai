/* eslint-disable */
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key";

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as NodeModule;

// Module 1: Revenue Autopilot
const {
  canonicalizePhoneNumber,
  ingestNormalizedLead,
  evaluateLeadIntelligence,
  generateDailyRevenueBriefing,
} = req("../server/services/revenue-autopilot/service") as typeof import("../server/services/revenue-autopilot/service");

// Module 2: Ad-to-Revenue Intelligence
const {
  recordAdAttribution,
  linkWonRevenueToAttribution,
  getAttributionAnalytics,
  generateAdOptimizationRecommendations,
} = req("../server/services/ad-attribution/service") as typeof import("../server/services/ad-attribution/service");

// Module 3: Omnichannel Customer Memory
const {
  recordCustomerMemory,
  ingestInteractionToMemories,
  getCustomerMemoryTimeline,
  synthesizeCustomerMemoryContext,
} = req("../server/services/customer-memory/service") as typeof import("../server/services/customer-memory/service");

// Module 4: Quote & Negotiation Copilot
const {
  generateQuoteCopilotDraft,
  evaluateNegotiationStrategy,
  scanQuotesForFollowUp,
} = req("../server/services/quote-copilot/service") as typeof import("../server/services/quote-copilot/service");

// Module 5: Industry AI Packs
const {
  getIndustryPackPresets,
  getActiveIndustryPack,
  activateIndustryPack,
} = req("../server/services/industry-packs/service") as typeof import("../server/services/industry-packs/service");

// Module 6: Explainable AI Action Center
const {
  computeActionHash,
  proposeAiAction,
  listAiActionProposals,
  decideAiActionProposal,
  aggregateProposalsFromAllModules,
} = req("../server/services/action-center/service") as typeof import("../server/services/action-center/service");

// Module 7: Local-First / BYOAI
const {
  getWorkspaceAiSettings,
  updateWorkspaceAiSettings,
  checkWorkspaceAiHealth,
  generateWithWorkspaceAi,
} = req("../server/services/byoai/service") as typeof import("../server/services/byoai/service");

// In-memory Supabase Mock Helper
function createMockSupabase(initialStore: Record<string, any[]> = {}) {
  const store: Record<string, any[]> = {
    leads: [],
    contacts: [],
    quotes: [],
    ad_campaigns: [],
    ad_attributions: [],
    customer_memories: [],
    industry_pack_configurations: [],
    ai_action_proposals: [],
    workspace_ai_settings: [],
    ...initialStore,
  };

  function createTableQuery(tableName: string) {
    let currentData = [...(store[tableName] || [])];
    const filters: Array<(row: any) => boolean> = [];
    let limitCount: number | null = null;
    let orderCol: string | null = null;
    let orderAsc: boolean = true;
    let pendingAction: { type: "insert" | "update" | "upsert"; payload: any; onConflict?: string } | null = null;

    const query: any = {
      select: (_cols = "*") => query,
      eq: (col: string, val: any) => {
        filters.push((r) => r[col] === val);
        return query;
      },
      neq: (col: string, val: any) => {
        filters.push((r) => r[col] !== val);
        return query;
      },
      in: (col: string, vals: any[]) => {
        filters.push((r) => vals.includes(r[col]));
        return query;
      },
      lt: (col: string, val: any) => {
        filters.push((r) => r[col] < val);
        return query;
      },
      gte: (col: string, val: any) => {
        filters.push((r) => r[col] >= val);
        return query;
      },
      or: (_expr: string) => {
        // Simple mock bypass or custom filter
        return query;
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        orderCol = col;
        orderAsc = opts?.ascending ?? true;
        return query;
      },
      limit: (n: number) => {
        limitCount = n;
        return query;
      },
      insert: (payload: any) => {
        pendingAction = { type: "insert", payload };
        return query;
      },
      update: (payload: any) => {
        pendingAction = { type: "update", payload };
        return query;
      },
      upsert: (payload: any, opts?: { onConflict?: string }) => {
        pendingAction = { type: "upsert", payload, onConflict: opts?.onConflict };
        return query;
      },
      maybeSingle: async () => {
        const res = applyExecution();
        const row = Array.isArray(res.data) ? (res.data.length > 0 ? res.data[0] : null) : res.data;
        return { data: row || null, error: null };
      },
      single: async () => {
        const res = applyExecution();
        const row = Array.isArray(res.data) ? (res.data.length > 0 ? res.data[0] : null) : res.data;
        if (!row) {
          return { data: null, error: { message: "Row not found" } };
        }
        return { data: row, error: null };
      },
      then: (resolve: any, reject: any) => {
        try {
          const res = applyExecution();
          resolve(res);
        } catch (e) {
          reject(e);
        }
      },
    };

    function applyExecution() {
      if (pendingAction) {
        if (pendingAction.type === "insert") {
          const items = Array.isArray(pendingAction.payload) ? pendingAction.payload : [pendingAction.payload];
          const inserted = items.map((item) => ({
            id: item.id || `mock-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...item,
          }));
          store[tableName] = store[tableName] || [];
          store[tableName].push(...inserted);
          return { data: inserted.length === 1 ? inserted[0] : inserted, error: null };
        }
        if (pendingAction.type === "update") {
          store[tableName] = store[tableName] || [];
          const affected: any[] = [];
          for (let i = 0; i < store[tableName].length; i++) {
            const matches = filters.every((f) => f(store[tableName][i]));
            if (matches) {
              store[tableName][i] = {
                ...store[tableName][i],
                ...pendingAction.payload,
                updated_at: new Date().toISOString(),
              };
              affected.push(store[tableName][i]);
            }
          }
          return { data: affected.length === 1 ? affected[0] : affected, error: null };
        }
        if (pendingAction.type === "upsert") {
          const item = pendingAction.payload;
          store[tableName] = store[tableName] || [];
          let existingIdx = -1;
          if (pendingAction.onConflict) {
            const conflictCols = pendingAction.onConflict.split(",").map((s) => s.trim());
            existingIdx = store[tableName].findIndex((row) =>
              conflictCols.every((col) => row[col] === item[col])
            );
          } else if (item.id) {
            existingIdx = store[tableName].findIndex((row) => row.id === item.id);
          }

          if (existingIdx >= 0) {
            store[tableName][existingIdx] = {
              ...store[tableName][existingIdx],
              ...item,
              updated_at: new Date().toISOString(),
            };
            return { data: store[tableName][existingIdx], error: null };
          } else {
            const inserted = {
              id: item.id || `mock-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              ...item,
            };
            store[tableName].push(inserted);
            return { data: inserted, error: null };
          }
        }
      }

      let res = currentData.filter((row) => filters.every((f) => f(row)));
      if (orderCol) {
        res.sort((a, b) => {
          if (a[orderCol!] < b[orderCol!]) return orderAsc ? -1 : 1;
          if (a[orderCol!] > b[orderCol!]) return orderAsc ? 1 : -1;
          return 0;
        });
      }
      if (limitCount !== null) {
        res = res.slice(0, limitCount);
      }
      return { data: res, error: null };
    }

    return query;
  }

  return {
    from: (table: string) => createTableQuery(table),
    _store: store,
  } as any;
}

const mockOrgId = "f11c1551-8b3a-4a18-ad6e-0ab16c061920"; // İZON KONTEYNER

// -------------------------------------------------------------
// MODULE 1 TESTS: AI REVENUE AUTOPILOT
// -------------------------------------------------------------
test("Module 1: Phone canonicalization adheres strictly to E.164 and rejects invalid formats", () => {
  assert.equal(canonicalizePhoneNumber("0532 123 45 67"), "+905321234567");
  assert.equal(canonicalizePhoneNumber("+90 (532) 123 4567"), "+905321234567");
  assert.equal(canonicalizePhoneNumber("5321234567"), "+905321234567");
  assert.equal(canonicalizePhoneNumber(""), null);
  assert.equal(canonicalizePhoneNumber("12345"), null);
});

test("Module 1: Revenue Autopilot deduplicates leads strictly by phone/email and prevents duplication", async () => {
  const supabase = createMockSupabase();

  // Ingest first lead
  const lead1 = await ingestNormalizedLead(supabase, mockOrgId, {
    fullName: "Ahmet Yılmaz",
    phone: "0532 555 10 20",
    email: "ahmet@example.com",
    sourceChannel: "web_form",
    productInterest: "3x7m Sandviç Panel Konteyner",
  });

  assert.equal(lead1.isDuplicate, false);
  assert.equal(lead1.deduplicationReason, undefined);

  // Ingest second lead with formatted same phone -> must be marked duplicate
  const lead2 = await ingestNormalizedLead(supabase, mockOrgId, {
    fullName: "Ahmet Yılmaz (Tekrar)",
    phone: "+90 532 555 1020",
    sourceChannel: "whatsapp",
    productInterest: "Ekstra WC talep ediyor",
  });

  assert.equal(lead2.isDuplicate, true);
  assert.equal(lead2.existingLeadId, lead1.leadId);
  assert.equal(lead2.deduplicationReason, "canonical_phone");
});

test("Module 1: Lead Intelligence calculates qualification, facts vs inferences, and next best actions", async () => {
  const supabase = createMockSupabase();
  const res = await evaluateLeadIntelligence(supabase, mockOrgId, {
    leadId: "lead-123",
    fullName: "Mehmet Demir",
    phone: "+905329998877",
    notes: "Sakarya Karasu'daki arsası için 3x7m şantiye konteyneri arıyor. Bütçesi 150.000 TL.",
    productInterest: "3x7 Konteyner",
    budgetAmount: 150000,
    city: "Sakarya",
    status: "new_lead",
    channel: "meta_leads",
  });

  assert.equal(res.leadId, "lead-123");
  assert.ok(res.qualificationScore >= 70);
  assert.equal(res.temperature, "hot");
  assert.ok(res.observedFacts.length >= 2);
  assert.ok(res.aiInferences.length >= 1);
  assert.ok(res.recommendedNextActions.length >= 1);
  assert.equal(res.recommendedNextActions[0].actionType, "quote_draft");
});

// -------------------------------------------------------------
// MODULE 2 TESTS: AD-TO-REVENUE INTELLIGENCE
// -------------------------------------------------------------
test("Module 2: Ad-to-Revenue records attribution and links won revenue to campaigns", async () => {
  const supabase = createMockSupabase();

  const attr = await recordAdAttribution(supabase, {
    organizationId: mockOrgId,
    leadId: "lead-attr-001",
    platform: "google_ads",
    utmSource: "google",
    utmMedium: "cpc",
    utmCampaign: "konteyner-fiyatlari-2026",
    clickId: "gclid-test-abc-123",
    adSpendCents: 15000, // 150 TL spend
  });

  assert.equal(attr.leadId, "lead-attr-001");
  assert.equal(attr.platform, "google_ads");
  assert.equal(attr.clickId, "gclid-test-abc-123");

  // Link closed-won quote revenue
  const linked = await linkWonRevenueToAttribution(supabase, {
    organizationId: mockOrgId,
    leadId: "lead-attr-001",
    quoteId: "quote-won-999",
    wonRevenueCents: 16200000, // 162.000 TL revenue
  });

  assert.equal(linked.attributedRevenueCents, 16200000);
  assert.equal(linked.quoteId, "quote-won-999");
});

test("Module 2: Computes CPL, CPQL, CAC and ROAS across platforms with explainable suggestions", async () => {
  const supabase = createMockSupabase({
    ad_attributions: [
      {
        id: "attr-1",
        organization_id: mockOrgId,
        lead_id: "lead-g1",
        platform: "google_ads",
        ad_spend_cents: 20000,
        attributed_revenue_cents: 200000,
        created_at: new Date().toISOString(),
      },
      {
        id: "attr-2",
        organization_id: mockOrgId,
        lead_id: "lead-g2",
        platform: "google_ads",
        ad_spend_cents: 20000,
        attributed_revenue_cents: 0,
        created_at: new Date().toISOString(),
      },
    ],
  });

  const analytics = await getAttributionAnalytics(supabase, mockOrgId);
  const googleMetric = analytics.find((m) => m.platform === "google_ads");

  assert.ok(googleMetric);
  assert.equal(googleMetric?.totalLeads, 2);
  assert.equal(googleMetric?.wonLeads, 1);
  assert.equal(googleMetric?.totalSpend, 400); // 400 TL
  assert.equal(googleMetric?.attributedRevenue, 2000); // 2000 TL
  assert.equal(googleMetric?.roas, 5.0); // 2000 / 400 = 5.0x
});

// -------------------------------------------------------------
// MODULE 3 TESTS: OMNICHANNEL CUSTOMER MEMORY
// -------------------------------------------------------------
test("Module 3: Ingests interaction into separate verified facts, statements, preferences and objections", async () => {
  const supabase = createMockSupabase();

  const memories = await ingestInteractionToMemories(supabase, {
    organizationId: mockOrgId,
    leadId: "lead-mem-01",
    channel: "whatsapp",
    rawText: "Merhaba, Sakarya Akyazı için 3x7m konteyner bakıyoruz. Bütçemiz en fazla 140.000 TL. Dışının antrasit renk olmasını ve taşyünü yalıtım istiyoruz ancak teslim süresi 3 hafta dediler bu bize biraz geç geliyor.",
  });

  assert.ok(memories.length >= 4);

  const context = await synthesizeCustomerMemoryContext(supabase, mockOrgId, { leadId: "lead-mem-01" });

  assert.ok(context.verifiedFacts.some((f) => f.includes("3x7")));
  assert.ok(context.customerStatements.some((s) => s.includes("140.000")));
  assert.ok(context.preferences.some((p) => p.includes("antrasit") || p.includes("Taşyünü")));
  assert.ok(context.activeObjections.some((o) => o.includes("Teslim")));
  assert.ok(context.recommendedNegotiationAngle?.includes("zamanlama kritik") || context.recommendedNegotiationAngle?.includes("stok"));
});

// -------------------------------------------------------------
// MODULE 4 TESTS: AI QUOTE & NEGOTIATION COPILOT
// -------------------------------------------------------------
test("Module 4: Generates quote draft and applies strict margin guardrails on negotiation discounts", async () => {
  const supabase = createMockSupabase();

  const draft = await generateQuoteCopilotDraft(supabase, {
    organizationId: mockOrgId,
    projectDescription: "3x7m Şantiye konteyneri wc ve lavabolu",
    currency: "TRY",
  });

  assert.ok(draft.items.length >= 1);
  assert.ok(draft.subtotal > 0);
  assert.equal(draft.maxAuthorizedDiscountPercent, 8); // Rep floor is 8%

  // Negotiation test: request 6% discount (within rep limit)
  const safeNeg = await evaluateNegotiationStrategy(supabase, {
    organizationId: mockOrgId,
    quoteId: "quote-100",
    customerObjection: "Bütçemiz biraz sıkışık, peşin ödemede 6% iskonto yapabilir misiniz?",
    currentTotal: 150000,
    requestedDiscountPercent: 6,
  });

  assert.equal(safeNeg.requiresManagerApproval, false);
  assert.equal(safeNeg.recommendedAction, "offer_tiered_discount");
  assert.equal(safeNeg.offeredDiscountPercent, 6);

  // Negotiation test: request 18% discount (exceeds limit -> requires management approval)
  const highNeg = await evaluateNegotiationStrategy(supabase, {
    organizationId: mockOrgId,
    quoteId: "quote-100",
    customerObjection: "Rakip firma 25 bin TL daha ucuz, %18 indirim yapmazsanız alamayız.",
    currentTotal: 150000,
    requestedDiscountPercent: 18,
  });

  assert.equal(highNeg.requiresManagerApproval, true);
  assert.equal(highNeg.recommendedAction, "require_management_approval");
});

// -------------------------------------------------------------
// MODULE 5 TESTS: INDUSTRY AI PACKS
// -------------------------------------------------------------
test("Module 5: Returns 4 standard industry packs and activates container_modular for İzon", async () => {
  const supabase = createMockSupabase();

  const presets = getIndustryPackPresets();
  assert.equal(presets.length, 4);
  assert.ok(presets.some((p) => p.packKey === "container_modular"));
  assert.ok(presets.some((p) => p.packKey === "real_estate"));
  assert.ok(presets.some((p) => p.packKey === "automotive"));
  assert.ok(presets.some((p) => p.packKey === "general_services"));

  // Default active pack is container_modular
  const activeDefault = await getActiveIndustryPack(supabase, mockOrgId);
  assert.equal(activeDefault.packKey, "container_modular");

  // Activate Real Estate pack
  const activated = await activateIndustryPack(supabase, mockOrgId, "real_estate");
  assert.equal(activated.packKey, "real_estate");
  assert.equal(activated.isActive, true);

  // Switch back to Container Modular pack
  const reactivated = await activateIndustryPack(supabase, mockOrgId, "container_modular");
  assert.equal(reactivated.packKey, "container_modular");
});

// -------------------------------------------------------------
// MODULE 6 TESTS: EXPLAINABLE AI ACTION CENTER
// -------------------------------------------------------------
test("Module 6: Proposes explainable actions with SHA-256 deduplication and records human decisions", async () => {
  const supabase = createMockSupabase();

  const proposalInput = {
    organizationId: mockOrgId,
    sourceModule: "quote_copilot" as const,
    actionType: "send_follow_up" as const,
    title: "Teklif Takibi - İzon Konteyner",
    description: "Müşteriye WhatsApp hatırlatması gönderilsin.",
    targetEntityType: "quote" as const,
    targetEntityId: "quote-777",
    evidence: ["Teklif 3 gün önce iletildi", "Müşteri henüz yanıtlamadı"],
    reasons: ["Sıcak tekliflerin 72 saat içinde takibi kapanışı artırır"],
    priority: "high" as const,
    actionPayload: { channel: "whatsapp" },
    requiredRole: "sales" as const,
  };

  const prop1 = await proposeAiAction(supabase, proposalInput);
  assert.ok(prop1.id);
  assert.equal(prop1.status, "pending_review");

  // Attempting to propose the identical action must deduplicate
  const prop2 = await proposeAiAction(supabase, proposalInput);
  assert.equal(prop2.id, prop1.id);

  // Human approves the proposal
  const approved = await decideAiActionProposal(supabase, {
    proposalId: prop1.id,
    organizationId: mockOrgId,
    decision: "approved",
    userId: "user-rep-1",
    decisionNote: "Teklif teyidi için onay verildi.",
  });

  assert.equal(approved.status, "approved");
  assert.equal(approved.decisionNote, "Teklif teyidi için onay verildi.");
});

// -------------------------------------------------------------
// MODULE 7 TESTS: BYOAI & ZERO-COST CONTROLS
// -------------------------------------------------------------
test("Module 7: Strictly enforces zero-cost invariant and health check routing", async () => {
  const supabase = createMockSupabase();

  const settings = await getWorkspaceAiSettings(supabase, mockOrgId);
  assert.equal(settings.activeProvider, "gemini");
  assert.equal(settings.spendingCeilingCents, 0); // Must default to 0
  assert.equal(settings.allowPaidApi, false); // Must default to false

  const health = await checkWorkspaceAiHealth(supabase, mockOrgId);
  assert.ok(["healthy", "unconfigured"].includes(health.status));

  // Generation verifies zero cost
  const genResult = await generateWithWorkspaceAi(supabase, {
    organizationId: mockOrgId,
    prompt: "Test prompt",
  });

  assert.equal(genResult.zeroCostVerified, true);
});

// -------------------------------------------------------------
// MODULE 8 TESTS: END-TO-END BUSINESS AUTOMATION FLYWHEEL
// -------------------------------------------------------------
test("Module 8: Complete Closed-Loop Flywheel (Ad Click -> Lead -> Memory -> Autopilot -> Quote Copilot -> Action Center -> Attribution)", async () => {
  const supabase = createMockSupabase();

  // 1. Lead intake from Google Ads
  const intakeResult = await ingestNormalizedLead(supabase, mockOrgId, {
    fullName: "Kaan Yurt",
    phone: "0533 111 22 33",
    email: "kaan@yurt.com",
    city: "Bolu",
    sourceChannel: "google_leads",
    productInterest: "3x7m Sandviç Panel Konteyner",
    budgetAmount: 140000,
    utmParameters: {
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "konteyner-kampanyasi",
    },
  });

  assert.ok(intakeResult.leadId);

  // 2. Ad Attribution recorded
  await recordAdAttribution(supabase, {
    organizationId: mockOrgId,
    leadId: intakeResult.leadId,
    platform: "google_ads",
    utmSource: "google",
    utmCampaign: "konteyner-kampanyasi",
    clickId: "gclid-flywheel-001",
    adSpendCents: 12500, // 125 TL ad spend
  });

  // 3. Customer Memory recorded from inbound WhatsApp message
  await ingestInteractionToMemories(supabase, {
    organizationId: mockOrgId,
    leadId: intakeResult.leadId,
    channel: "whatsapp",
    rawText: "Bolu Mengen'deki arsamıza 3x7m sandviç panel ofis konteyneri düşünüyoruz. Bütçemiz 140 bin TL. Fiyat biraz yüksek geldi, nakliye dahil olursa anlaşabiliriz.",
  });

  // 4. Revenue Autopilot evaluates lead intelligence
  const intel = await evaluateLeadIntelligence(supabase, mockOrgId, {
    leadId: intakeResult.leadId,
    fullName: "Kaan Yurt",
    notes: "Bolu Mengen arsa, 3x7m konteyner talebi",
    budgetAmount: 140000,
    city: "Bolu",
    status: "new_lead",
    channel: "google_leads",
  });

  assert.ok(intel.qualificationScore >= 70);

  // 5. Quote Copilot drafts proposal using grounded memories
  const quoteDraft = await generateQuoteCopilotDraft(supabase, {
    organizationId: mockOrgId,
    leadId: intakeResult.leadId,
    projectDescription: "Bolu Mengen 3x7m sandviç panel konteyner",
    currency: "TRY",
  });

  assert.ok(quoteDraft.subtotal > 0);
  assert.ok(quoteDraft.commercialTerms.length >= 2);

  // 6. Action Center records proposal and human manager approves it
  const actionProposal = await proposeAiAction(supabase, {
    organizationId: mockOrgId,
    sourceModule: "quote_copilot",
    actionType: "create_quote_draft",
    title: "Kaan Yurt Teklif Onayı",
    description: "Hazırlanan 3x7m teklifi müşteriye iletilmek üzere hazır.",
    targetEntityType: "lead",
    targetEntityId: intakeResult.leadId,
    evidence: quoteDraft.evidenceNotes,
    reasons: ["Müşterinin bütçesi ve lokasyonu doğrulandı"],
    priority: "high",
    actionPayload: { quoteDraft },
    requiredRole: "sales",
  });

  const decision = await decideAiActionProposal(supabase, {
    proposalId: actionProposal.id,
    organizationId: mockOrgId,
    decision: "approved",
    userId: "admin-user",
    decisionNote: "Teklif uygun bulundu, gönderildi.",
  });

  assert.equal(decision.status, "approved");

  // 7. Deal closed-won: Revenue linked back to Google Ads attribution
  const wonResult = await linkWonRevenueToAttribution(supabase, {
    organizationId: mockOrgId,
    leadId: intakeResult.leadId,
    quoteId: "quote-flywheel-1",
    wonRevenueCents: 14500000, // 145.000 TL revenue
  });

  assert.equal(wonResult.attributedRevenueCents, 14500000);

  // 8. Verify ROI & zero-cost AI invariant
  const analytics = await getAttributionAnalytics(supabase, mockOrgId);
  const campaign = analytics.find((a) => a.platform === "google_ads");
  assert.ok(campaign);
  assert.ok(campaign.roas !== null && campaign.roas !== undefined && campaign.roas > 10.0); // 145000 / 125 > 10x ROAS
});
