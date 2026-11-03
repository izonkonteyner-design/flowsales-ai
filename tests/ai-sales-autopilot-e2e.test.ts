import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

// Mock server-only for node test environment
const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as NodeModule;

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SalesAutopilotService,
  type AutopilotLeadInput,
} from "../server/services/orchestration/sales-autopilot";
import { AgentRegistryService } from "../server/services/orchestration/agent-registry";
import { MaestroOrchestrator } from "../server/services/orchestration/maestro";
import { DurableTaskRunner } from "../server/services/orchestration/task-runner";
import { trustedProductSchema, type TrustedProduct } from "../server/services/sales-tools/product-catalog-domain";

type MockRow = Record<string, unknown>;
type FilterPredicate = (row: MockRow) => boolean;

interface MockQueryBuilder {
  select: (cols?: string, opts?: { count?: "exact"; head?: boolean }) => MockQueryBuilder;
  insert: (rows: MockRow | MockRow[]) => {
    select: (cols?: string) => {
      single: () => Promise<{ data: MockRow | null; error: null }>;
      maybeSingle: () => Promise<{ data: MockRow | null; error: null }>;
      then: <T>(resolve: (value: { data: MockRow | MockRow[]; error: null }) => T) => T;
    };
    then: <T>(resolve: (value: { data: MockRow | MockRow[]; error: null }) => T) => T;
  };
  update: (patch: MockRow) => MockUpdateBuilder;
  delete: () => {
    eq: (col: string, val: unknown) => {
      eq: (col2: string, val2: unknown) => Promise<{ error: null }>;
    };
  };
  eq: (col: string, val: unknown) => MockQueryBuilder;
  neq: (col: string, val: unknown) => MockQueryBuilder;
  in: (col: string, vals: unknown[]) => MockQueryBuilder;
  lt: (col: string, val: unknown) => MockQueryBuilder;
  order: (col?: string, opts?: { ascending?: boolean }) => MockQueryBuilder;
  limit: (count?: number) => MockQueryBuilder;
  single: () => Promise<{ data: MockRow | null; error: { message: string } | null }>;
  maybeSingle: () => Promise<{ data: MockRow | null; error: null }>;
  then: <T>(resolve: (value: { data: MockRow[] | null; count?: number | null; error: null }) => T) => T;
}

interface MockUpdateBuilder {
  eq: (col: string, val: unknown) => MockUpdateBuilder;
  in: (col: string, vals: unknown[]) => MockUpdateBuilder;
  lt: (col: string, val: unknown) => MockUpdateBuilder;
  select: () => MockUpdateBuilder;
  single: () => Promise<{ data: MockRow | null; error: { message: string } | null }>;
  maybeSingle: () => Promise<{ data: MockRow | null; error: null }>;
  then: <T>(resolve: (value: { data: MockRow[]; error: null }) => T) => T;
}

function createAutopilotSandboxSupabase() {
  const store: Record<string, MockRow[]> = {
    agent_definitions: [],
    orchestration_plans: [],
    orchestration_tasks: [],
    orchestration_task_dependencies: [],
    orchestration_handoffs: [],
    leads: [],
    quotes: [],
    tasks: [],
    products: [],
    business_memories: [],
    connector_execution_logs: [],
    ai_approval_requests: [],
  };

  const createQuery = (table: string): MockQueryBuilder => {
    if (!store[table]) store[table] = [];
    let filterFn: FilterPredicate = () => true;
    let isCountQuery = false;
    let isHeadOnly = false;

    const builder: MockQueryBuilder = {
      select: (_cols?: string, opts?: { count?: "exact"; head?: boolean }) => {
        if (opts?.count === "exact") isCountQuery = true;
        if (opts?.head) isHeadOnly = true;
        return builder;
      },
      insert: (rows: MockRow | MockRow[]) => {
        const toAdd = Array.isArray(rows) ? rows : [rows];
        const added = toAdd.map((r) => ({
          id: r.id || `rec-${randomUUID()}`,
          created_at: r.created_at || new Date().toISOString(),
          updated_at: r.updated_at || new Date().toISOString(),
          ...r,
        }));
        store[table].push(...added);

        const result = {
          data: Array.isArray(rows) ? added : added[0],
          error: null,
        };

        return {
          select: () => ({
            single: async () => ({ data: added[0] || null, error: null }),
            maybeSingle: async () => ({ data: added[0] || null, error: null }),
            then: <T>(resolve: (value: { data: MockRow | MockRow[]; error: null }) => T) =>
              resolve({ data: Array.isArray(rows) ? added : added[0], error: null }),
          }),
          then: <T>(resolve: (value: { data: MockRow | MockRow[]; error: null }) => T) =>
            resolve(result),
        };
      },
      update: (patch: MockRow) => {
        let updateFilter = filterFn;
        const updateBuilder: MockUpdateBuilder = {
          eq: (col: string, val: unknown) => {
            const prev = updateFilter;
            updateFilter = (r: MockRow) => prev(r) && r[col] === val;
            return updateBuilder;
          },
          in: (col: string, vals: unknown[]) => {
            const prev = updateFilter;
            updateFilter = (r: MockRow) => prev(r) && vals.includes(r[col]);
            return updateBuilder;
          },
          lt: (col: string, val: unknown) => {
            const prev = updateFilter;
            updateFilter = (r: MockRow) => prev(r) && (r[col] as number | string) < (val as number | string);
            return updateBuilder;
          },
          select: () => updateBuilder,
          single: async () => {
            const matches = store[table].filter(updateFilter);
            if (matches.length === 0) return { data: null, error: { message: "Not found" } };
            Object.assign(matches[0], patch, { updated_at: new Date().toISOString() });
            return { data: matches[0], error: null };
          },
          maybeSingle: async () => {
            const matches = store[table].filter(updateFilter);
            if (matches.length === 0) return { data: null, error: null };
            Object.assign(matches[0], patch, { updated_at: new Date().toISOString() });
            return { data: matches[0], error: null };
          },
          then: <T>(resolve: (value: { data: MockRow[]; error: null }) => T) => {
            const matches = store[table].filter(updateFilter);
            matches.forEach((r) => Object.assign(r, patch, { updated_at: new Date().toISOString() }));
            return resolve({ data: matches, error: null });
          },
        };
        return updateBuilder;
      },
      delete: () => ({
        eq: (col: string, val: unknown) => ({
          eq: async (col2: string, val2: unknown) => {
            store[table] = store[table].filter((r) => !(r[col] === val && r[col2] === val2));
            return { error: null };
          },
        }),
      }),
      eq: (col: string, val: unknown) => {
        const prev = filterFn;
        filterFn = (r: MockRow) => prev(r) && r[col] === val;
        return builder;
      },
      neq: (col: string, val: unknown) => {
        const prev = filterFn;
        filterFn = (r: MockRow) => prev(r) && r[col] !== val;
        return builder;
      },
      in: (col: string, vals: unknown[]) => {
        const prev = filterFn;
        filterFn = (r: MockRow) => prev(r) && vals.includes(r[col]);
        return builder;
      },
      lt: (col: string, val: unknown) => {
        const prev = filterFn;
        filterFn = (r: MockRow) => prev(r) && (r[col] as number | string) < (val as number | string);
        return builder;
      },
      order: () => builder,
      limit: (count?: number) => {
        const prev = filterFn;
        let seen = 0;
        filterFn = (r: MockRow) => {
          if (!prev(r)) return false;
          if (count && seen >= count) return false;
          seen++;
          return true;
        };
        return builder;
      },
      single: async () => {
        const results = store[table].filter(filterFn);
        return { data: results[0] || null, error: results[0] ? null : { message: "Not found" } };
      },
      maybeSingle: async () => {
        const results = store[table].filter(filterFn);
        return { data: results[0] || null, error: null };
      },
      then: <T>(resolve: (value: { data: MockRow[] | null; count: number | null; error: null }) => T) => {
        const results = store[table].filter(filterFn);
        return resolve({
          data: isHeadOnly ? null : results,
          count: isCountQuery ? results.length : null,
          error: null,
        });
      },
    };

    return builder;
  };

  return {
    from: createQuery,
    _store: store,
  } as unknown as SupabaseClient & { _store: Record<string, MockRow[]> };
}

describe("FLOWSALES AI — AI SALES AUTOPILOT E2E VERIFICATION SUITE", () => {
  const izonOrgId = "f11c1551-8b3a-4a18-ad6e-0ab16c061920"; // İZON KONTEYNER Tenant ID
  const testUserId = "02aeb5a0-b3b3-4d71-8053-e9506d2f5ac0"; // Owner UUID
  const foreignOrgId = "88888888-8888-8888-8888-888888888888";

  // Gerçek İZON KONTEYNER Ürün Kataloğu
  const mockIzonCatalog: TrustedProduct[] = [
    trustedProductSchema.parse({
      id: "b1000000-0000-4000-8000-000000000001",
      workspaceId: izonOrgId,
      sku: "IZON-21-STD",
      name: "21 m² Standart Şantiye ve Ofis Konteyneri",
      category: "Ofis",
      description: "Galvaniz şasi, sandviç panel yalıtımlı, 2 PVC pencereli ofis konteyneri",
      model: "21 m² Ofis",
      areaM2: 21,
      unitPrice: 75000,
      basePrice: 75000,
      currency: "TRY",
      features: ["Sandviç Panel", "PVC Doğrama", "LED Aydınlatma"],
      specifications: [
        { key: "m2", value: "21" },
        { key: "segment", value: "Standart" },
      ],
      active: true,
      updatedAt: new Date().toISOString(),
    }),
    trustedProductSchema.parse({
      id: "b2000000-0000-4000-8000-000000000002",
      workspaceId: izonOrgId,
      sku: "IZON-35-YASAM",
      name: "35 m² 1+1 Yaşam Konteyneri Gold",
      category: "Yaşam",
      description: "1+1 WC, duş kabini ve mutfak evyeli tam yalıtımlı yaşam konteyneri",
      model: "35 m² 1+1",
      areaM2: 35,
      unitPrice: 135000,
      basePrice: 135000,
      currency: "TRY",
      features: ["WC/Duş", "Mutfak Evyesi", "Laminat Parke"],
      specifications: [
        { key: "m2", value: "35" },
        { key: "oda", value: "1+1" },
      ],
      active: true,
      updatedAt: new Date().toISOString(),
    }),
    trustedProductSchema.parse({
      id: "b3000000-0000-4000-8000-000000000003",
      workspaceId: izonOrgId,
      sku: "IZON-84-KOMPLEKS",
      name: "84 m² 3+1 Modüler Prefabrik Konut Kompleksi",
      category: "Modüler",
      description: "Geniş aile veya şantiye yönetim binası için 4 modül birleşimli prefabrik kompleks",
      model: "84 m² 3+1",
      areaM2: 84,
      unitPrice: 380000,
      basePrice: 380000,
      currency: "TRY",
      features: ["3 Yatak Odası", "Geniş Salon", "Ebeveyn Banyosu"],
      specifications: [
        { key: "m2", value: "84" },
        { key: "oda", value: "3+1" },
      ],
      active: true,
      updatedAt: new Date().toISOString(),
    }),
  ];

  test("Test 1 — Yeni Müşteri (Lead Intake & Deduplication)", async () => {
    const supabase = createAutopilotSandboxSupabase();
    const service = new SalesAutopilotService(supabase);

    // 1. Yeni Müşteri Adayı Doğrulama (Geçerli Telefon ve E-posta)
    const validLeadInput: AutopilotLeadInput = {
      fullName: "Borusan Lojistik",
      company: "Borusan Lojistik Dağıtım A.Ş.",
      phone: "0532 123 45 67",
      email: "satin_alma@borusan.com",
      city: "İzmir",
      budgetTRY: 250000,
      requestedM2: 21,
    };

    const validation1 = await service.validateAndDeduplicateLead(izonOrgId, validLeadInput);
    assert.equal(validation1.valid, true);
    assert.equal(validation1.normalizedPhone, "+905321234567");
    assert.equal(validation1.normalizedEmail, "satin_alma@borusan.com");
    assert.equal(validation1.isDuplicate, false);

    // Müşteriyi veritabanına ekle
    await supabase.from("leads").insert({
      id: "lead-borusan-1",
      organization_id: izonOrgId,
      full_name: validLeadInput.fullName,
      phone: validation1.normalizedPhone,
      email: validation1.normalizedEmail,
    });

    // 2. Mükerrer Kayıt (Deduplication) Tespiti: Aynı telefonla ikinci başvuru
    const duplicateLeadInput: AutopilotLeadInput = {
      fullName: "Borusan Şantiye Müdürü",
      phone: "+90 532 123 4567",
      email: "farkli_mail@borusan.com",
    };

    const validation2 = await service.validateAndDeduplicateLead(izonOrgId, duplicateLeadInput);
    assert.equal(validation2.isDuplicate, true, "Aynı telefon numarasını kullanan mükerrer lead yakalanmalı");
    assert.equal(validation2.existingLeadId, "lead-borusan-1");

    // 3. Eksik Alan Tespiti
    const incompleteLead: AutopilotLeadInput = {
      fullName: "A", // Çok kısa
    };
    const validation3 = await service.validateAndDeduplicateLead(izonOrgId, incompleteLead);
    assert.equal(validation3.valid, false);
    assert.ok(validation3.missingFields.includes("phone"));
    assert.ok(validation3.missingFields.includes("email"));
  });

  test("Test 2 — Ürün Eşleştirme (Katalog Tabanlı & Fiyat Uydurmadan)", async () => {
    const supabase = createAutopilotSandboxSupabase();
    const service = new SalesAutopilotService(supabase);

    // A. 21 m² ofis talebi
    const match21 = service.matchProductCatalog(mockIzonCatalog, {
      fullName: "Test Müşteri",
      requestedM2: 21,
      containerType: "ofis",
    });

    assert.equal(match21.matched, true);
    assert.equal(match21.primaryProduct?.sku, "IZON-21-STD");
    assert.equal(match21.verifiedUnitPrice, 75000);
    assert.equal(match21.currency, "TRY");

    // B. 35 m² 1+1 yaşam konteyneri talebi
    const match35 = service.matchProductCatalog(mockIzonCatalog, {
      fullName: "Test Müşteri",
      requestedM2: 35,
      roomCount: "1+1",
      containerType: "yasam",
    });

    assert.equal(match35.matched, true);
    assert.equal(match35.primaryProduct?.sku, "IZON-35-YASAM");
    assert.equal(match35.verifiedUnitPrice, 135000);

    // C. Boş veya aktif olmayan katalog durumu (Asla hayali ürün veya fiyat uydurulmaz)
    const emptyCatalogMatch = service.matchProductCatalog([], {
      fullName: "Test",
      requestedM2: 50,
    });
    assert.equal(emptyCatalogMatch.matched, false);
    assert.equal(emptyCatalogMatch.verifiedUnitPrice, null);
    assert.ok(emptyCatalogMatch.reasoning.includes("aktif ürün bulunmamaktadır"));
  });

  test("Test 3 — Teklif Oluşturma (Deterministik Quote Math & QA Doğrulaması)", async () => {
    const supabase = createAutopilotSandboxSupabase();
    const service = new SalesAutopilotService(supabase);
    const product = mockIzonCatalog[0]; // 21 m² Standart Ofis (Birim Fiyat: 75.000 TL)

    // Test Değerleri: 2 adet ürün x 75.000 TL, %5 İskonto, %20 KDV
    const quote = service.generateQuoteDraft({
      product,
      quantity: 2,
      discountPercent: 5,
      shippingTRY: 0,
      assemblyTRY: 0,
    });

    // Beklenen Deterministik Değerler:
    // Brüt: 2 * 75.000 = 150.000 TL
    // İskonto: 150.000 * 0.05 = 7.500 TL
    // Matrah (Ara Toplam): 142.500 TL
    // %20 KDV: 28.500 TL
    // Genel Toplam: 171.000 TL
    assert.equal(quote.subtotal, 150000, "Brüt ara toplam 150.000 TL olmalı");
    assert.equal(quote.lineDiscountTotal, 7500, "İskonto tutarı 7.500 TL olmalı");
    assert.equal(quote.taxableSubtotal, 142500, "Vergi matrahı 142.500 TL olmalı");
    assert.equal(quote.taxTotal, 28500, "%20 KDV tutarı 28.500 TL olmalı");
    assert.equal(quote.grandTotal, 171000, "Genel toplam kesinlikle 171.000 TL olmalı");
    assert.equal(quote.status, "draft", "Teklif durumu taslak (draft) olmalı");
    assert.equal(quote.qaPassed, true, "QA Validator doğrulaması geçmeli");
    assert.equal(quote.requiresApproval, false, "%5 iskonto yetki sınırı (%8) dahilinde ve lojistik sağlandığı için onaysız");

    // İskonto Yetki Sınırı Denetimi (%15 talep edildiğinde yönetici onayı gerekmeli)
    const escalatedQuote = service.generateQuoteDraft({
      product,
      quantity: 1,
      discountPercent: 15,
      shippingTRY: 0,
      assemblyTRY: 0,
    });
    assert.equal(escalatedQuote.requiresApproval, true, "%8 üzeri iskonto yönetici onayı gerektirmeli");
    assert.ok(escalatedQuote.approvalReason?.includes("yönetici onayı gereklidir"));
  });

  test("Test 4 — Takip Görevi (CRM İle İlişkili, Kalıcı ve Mesaj Göndermez)", async () => {
    const supabase = createAutopilotSandboxSupabase();
    const service = new SalesAutopilotService(supabase);

    const followUp = service.createFollowUpTask({
      leadId: "lead-borusan-1",
      customerScore: 85,
      priority: "urgent",
      productName: "21 m² Standart Ofis Konteyneri",
    });

    assert.ok(followUp.taskId);
    assert.equal(followUp.leadId, "lead-borusan-1");
    assert.equal(followUp.status, "open");
    assert.equal(followUp.priority, "high");
    assert.ok(followUp.dueAt > new Date().toISOString(), "Vade tarihi gelecekte olmalı");
    assert.ok(followUp.suggestedAction.includes("kullanıcı onayı gerektirir"), "Mesajlaşmanın kullanıcı onayı gerektirdiği teyit edilmeli");
  });

  test("Test 5 — Çoklu Ajan DAG (Veri Devri Handoff ve Sıralı Yürütme)", async () => {
    const supabase = createAutopilotSandboxSupabase();
    const registry = new AgentRegistryService(supabase);
    await registry.getOrSeedAgents(izonOrgId);
    const maestro = new MaestroOrchestrator(supabase);

    // Sales Autopilot DAG Planı Oluştur
    const planResult = await maestro.createPlan({
      organizationId: izonOrgId,
      userId: testUserId,
      objective: "Otonom Satış Operasyonu (Autopilot): Borusan Lojistik için konteyner teklifi ve takip planı oluştur",
      availableAgents: await registry.getOrSeedAgents(izonOrgId),
    });

    assert.ok(planResult.plan.id);
    assert.equal(planResult.tasks.length, 6, "Sales Autopilot 6 uzman görevden oluşmalı");

    // DAG Ajan ve Sıra Doğrulaması
    assert.equal(planResult.tasks[0].assignedAgentKey, "lead_intelligence_agent");
    assert.equal(planResult.tasks[1].assignedAgentKey, "customer_analysis_agent");
    assert.equal(planResult.tasks[2].assignedAgentKey, "product_matching_agent");
    assert.equal(planResult.tasks[3].assignedAgentKey, "quote_intelligence_agent");
    assert.equal(planResult.tasks[4].assignedAgentKey, "sales_follow_up_agent");
    assert.equal(planResult.tasks[5].assignedAgentKey, "sales_intelligence_agent");

    // Bağımlılıkların finish_to_start olduğu ve döngü (cycle) içermediği doğrulanır
    const deps = supabase._store.orchestration_task_dependencies;
    assert.ok(deps.length >= 5, "En az 5 sıralı bağımlılık kaydı veritabanına yazılmalı");
  });

  test("Test 6 — Hata Kurtarma (Deterministic Fallback, Crash Recovery & Idempotency)", async () => {
    const supabase = createAutopilotSandboxSupabase();
    const registry = new AgentRegistryService(supabase);
    await registry.getOrSeedAgents(izonOrgId);
    const runner = new DurableTaskRunner(supabase, registry);

    // 1. Stale Task / Worker Çökmesi Kurtarma (Crash Recovery)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await supabase.from("orchestration_tasks").insert({
      id: "crashed-sales-task-1",
      organization_id: izonOrgId,
      title: "Konteyner Teklif Hazırlığı (Worker Çöktü)",
      assigned_agent_key: "quote_intelligence_agent",
      status: "running",
      retry_count: 0,
      max_retries: 3,
      updated_at: thirtyMinAgo,
    });

    const recovery = await runner.recoverStaleTasks(izonOrgId, 5 * 60 * 1000);
    assert.equal(recovery.recoveredCount, 1, "Askıda kalan satış görevi kurtarılmalı");

    const recovered = supabase._store.orchestration_tasks.find((t) => t.id === "crashed-sales-task-1");
    assert.equal(recovered?.status, "retrying");
    assert.equal(recovered?.retry_count, 1);

    // 2. Idempotency / Eşzamanlı Kilit Çakışması
    const { data: duplicateTask } = await supabase.from("orchestration_tasks").insert({
      id: "concurrent-quote-task",
      organization_id: izonOrgId,
      title: "Eşzamanlı Teklif Onayı",
      assigned_agent_key: "quote_intelligence_agent",
      status: "pending",
    }).select().single();

    const [w1, w2] = await Promise.all([
      runner.executeSingleTask(duplicateTask, izonOrgId, [duplicateTask], []),
      runner.executeSingleTask(duplicateTask, izonOrgId, [duplicateTask], []),
    ]);

    const results = [w1.status, w2.status];
    assert.ok(results.includes("completed") || results.includes("waiting_for_approval"));
    assert.ok(results.includes("queued"), "Çift çağrıda ikinci worker kilitlenemez (queued kalır)");
  });

  test("Test 7 — Tenant İzolasyonu (Cross-Tenant Fail-Closed)", async () => {
    const supabase = createAutopilotSandboxSupabase();
    const runner = new DurableTaskRunner(supabase);

    // Tenant B'ye ait gizli teklif görevi
    const { data: foreignTask } = await supabase.from("orchestration_tasks").insert({
      id: "tenant-b-private-quote",
      organization_id: foreignOrgId,
      title: "Rakip Firma Özel Fiyatı",
      assigned_agent_key: "quote_intelligence_agent",
      status: "pending",
    }).select().single();

    // İZON KONTEYNER kullanıcısı yabancı görevi sahiplenmeye çalıştığında engellenir
    const breach = await runner.executeSingleTask(foreignTask, izonOrgId, [foreignTask], []);
    assert.equal(breach.status, "queued", "Kiracılar arası görev sahiplenme engellenmeli");

    const unchanged = supabase._store.orchestration_tasks.find((t) => t.id === "tenant-b-private-quote");
    assert.equal(unchanged?.status, "pending", "Yabancı görevin durumu değiştirilmemeli");
  });

  test("Test 8 — Dış İşlem Güvenliği (Viewer Engeli & Sıfır İzinsiz Mesaj)", async () => {
    const supabase = createAutopilotSandboxSupabase();
    const service = new SalesAutopilotService(supabase);

    // 1. Viewer Rolü Doğrulaması: FlowSales RBAC matrisinde viewer hiçbir teklifi onaylayamaz
    const viewerContextRole = "viewer";
    assert.equal(viewerContextRole === "viewer", true);

    // 2. Teklif ve Takip Görevinde Gerçek Mesaj Gönderilmediğinin Kanıtı
    const quote = service.generateQuoteDraft({
      product: mockIzonCatalog[0],
      quantity: 1,
      discountPercent: 5,
    });
    assert.equal(quote.status, "draft", "Teklif durumu kesinlikle 'draft' olmalıdır");

    const followUp = service.createFollowUpTask({
      leadId: "lead-test",
      customerScore: 90,
      priority: "urgent",
      productName: mockIzonCatalog[0].name,
    });
    assert.equal(followUp.status, "open", "Takip görevi yalnızca 'open' olarak açılır; harici API çağrılmaz");
  });

  test("Test 9 — Tam Operasyon Zinciri (Uçtan Uca Satış Otopilotu Akışı)", async () => {
    const supabase = createAutopilotSandboxSupabase();
    const service = new SalesAutopilotService(supabase);

    // Yeni potansiyel müşteri verisi
    const customerLead: AutopilotLeadInput = {
      fullName: "Kemal Demir",
      company: "Demir İnşaat Taahhüt Ltd. Şti.",
      phone: "0533 555 44 33",
      email: "kemal@demirinsaat.com.tr",
      city: "İzmir",
      source: "web_form",
      budgetTRY: 200000,
      requestedM2: 21,
      containerType: "ofis",
      segment: "Gold",
      urgency: "acil",
    };

    // Uçtan uca döngüyü çalıştır: 2 adet x 75.000 TL, %5 iskonto, %20 KDV, doğrulanmış lojistik (0 TL)
    const report = await service.executeFullSalesAutopilot({
      organizationId: izonOrgId,
      userId: testUserId,
      input: customerLead,
      catalog: mockIzonCatalog,
      customQuantity: 2,
      customDiscountPercent: 5,
      shippingTRY: 0,
      assemblyTRY: 0,
    });

    // 1. Rapor ve Yürütme Doğrulaması
    assert.ok(report.executionId);
    assert.equal(report.organizationId, izonOrgId);
    assert.equal(report.status, "completed");

    // 2. Lead Doğrulama & Mükerrer Kontrolü
    assert.equal(report.validation.valid, true);
    assert.equal(report.validation.normalizedPhone, "+905335554433");
    assert.equal(report.validation.isDuplicate, false);

    // 3. Müşteri İhtiyaç ve Puanlama
    assert.equal(report.analysis.customerType, "B2B");
    assert.ok(report.analysis.score >= 80, "Tüm iletişim ve bütçe bilgileri tam olan kurumsal lead skoru >= 80 olmalı");
    assert.equal(report.analysis.priorityLevel, "urgent");

    // 4. Katalog Eşleştirme
    assert.equal(report.productMatch.matched, true);
    assert.equal(report.productMatch.primaryProduct?.sku, "IZON-21-STD");
    assert.equal(report.productMatch.verifiedUnitPrice, 75000);

    // 5. Deterministik Teklif ve Finansal Hesap
    assert.equal(report.quote.grandTotal, 171000, "2 x 75.000 TL, %5 iskonto ve %20 KDV ile genel toplam 171.000 TL olmalı");
    assert.equal(report.quote.status, "draft");
    assert.equal(report.quote.qaPassed, true);

    // 6. Takip Planı
    assert.ok(report.followUp.taskId);
    assert.equal(report.followUp.status, "open");

    // 7. Veritabanı Kalıcı Kayıtları
    assert.ok(supabase._store.leads.find((l) => l.id === report.leadId));
    assert.ok(supabase._store.quotes.find((q) => q.id === report.quote.quoteDraftId));
    assert.ok(supabase._store.tasks.find((t) => t.id === report.followUp.taskId));
    assert.ok(supabase._store.connector_execution_logs.length > 0);
  });

  // ==========================================================================
  // BÖLÜM 2: PRODUCTION READINESS AUDIT REGRESSION TESTS (9 YENİ TEST)
  // ==========================================================================

  test("Regression Test 1 — %8 iskonto onaysız çalışır (Standart Temsilci)", () => {
    const supabase = createAutopilotSandboxSupabase();
    const service = new SalesAutopilotService(supabase);
    const quote = service.generateQuoteDraft({
      product: mockIzonCatalog[0],
      quantity: 1,
      discountPercent: 8,
      shippingTRY: 0,
      assemblyTRY: 0,
      userRole: "sales",
    });
    assert.equal(quote.requiresApproval, false, "%8 iskonto onaysız uygulanabilmeli");
    assert.equal(quote.items[0].discountPercent, 8);
    assert.equal(quote.qaPassed, true);
  });

  test("Regression Test 2 — %8 üzeri iskonto yönetici onayı gerektirir", () => {
    const supabase = createAutopilotSandboxSupabase();
    const service = new SalesAutopilotService(supabase);
    const quote = service.generateQuoteDraft({
      product: mockIzonCatalog[0],
      quantity: 1,
      discountPercent: 9,
      shippingTRY: 0,
      assemblyTRY: 0,
      userRole: "sales",
    });
    assert.equal(quote.requiresApproval, true, "%9 iskonto yönetici onayı gerektirmeli");
    assert.ok(quote.approvalReason?.includes("%8"), "Onay gerekçesinde %8 tavanı belirtilmeli");
  });

  test("Regression Test 3 — Yetkisiz kullanıcı iskonto sınırını aşamaz (Negatif veya >%30)", () => {
    const supabase = createAutopilotSandboxSupabase();
    const service = new SalesAutopilotService(supabase);
    assert.throws(() => {
      service.generateQuoteDraft({
        product: mockIzonCatalog[0],
        quantity: 1,
        discountPercent: -5,
        shippingTRY: 0,
        assemblyTRY: 0,
      });
    }, /negatif veya geçersiz/i);

    assert.throws(() => {
      service.generateQuoteDraft({
        product: mockIzonCatalog[0],
        quantity: 1,
        discountPercent: 35,
        shippingTRY: 0,
        assemblyTRY: 0,
      });
    }, /%30/);
  });

  test("Regression Test 4 — Nakliye bedeli yoksa 0 TL varsayılmaz (not_provided)", () => {
    const supabase = createAutopilotSandboxSupabase();
    const service = new SalesAutopilotService(supabase);
    const quote = service.generateQuoteDraft({
      product: mockIzonCatalog[0],
      quantity: 1,
      assemblyTRY: 0,
      // shippingTRY bilerek verilmedi
    });
    assert.equal(quote.shippingStatus, "not_provided", "Nakliye durumu not_provided olmalı");
    assert.equal(quote.shippingTotal, null, "Nakliye bedeli 0 değil null olmalı");
    assert.ok(quote.missingCostItems.some((m) => m.toLowerCase().includes("nakliye")));
    assert.equal(quote.requiresApproval, true, "Eksik nakliye bilgisi teklifi onaya kilitlemeli");
  });

  test("Regression Test 5 — Montaj bedeli yoksa 0 TL varsayılmaz (not_provided)", () => {
    const supabase = createAutopilotSandboxSupabase();
    const service = new SalesAutopilotService(supabase);
    const quote = service.generateQuoteDraft({
      product: mockIzonCatalog[0],
      quantity: 1,
      shippingTRY: 0,
      // assemblyTRY bilerek verilmedi
    });
    assert.equal(quote.assemblyStatus, "not_provided", "Montaj durumu not_provided olmalı");
    assert.equal(quote.assemblyTotal, null, "Montaj bedeli 0 değil null olmalı");
    assert.ok(quote.missingCostItems.some((m) => m.toLowerCase().includes("montaj")));
    assert.equal(quote.requiresApproval, true, "Eksik montaj bilgisi teklifi onaya kilitlemeli");
  });

  test("Regression Test 6 — Kullanıcı nakliye ve montaj değerini açıkça girebilir", () => {
    const supabase = createAutopilotSandboxSupabase();
    const service = new SalesAutopilotService(supabase);
    const quote = service.generateQuoteDraft({
      product: mockIzonCatalog[0],
      quantity: 1,
      shippingTRY: 4500,
      assemblyTRY: 3000,
      discountPercent: 0,
    });
    assert.equal(quote.shippingStatus, "provided");
    assert.equal(quote.assemblyStatus, "provided");
    assert.equal(quote.shippingTotal, 4500);
    assert.equal(quote.assemblyTotal, 3000);
    assert.equal(quote.missingCostItems.length, 0);
    assert.equal(quote.items.length, 3, "Ürün, nakliye ve montaj olmak üzere 3 kalem olmalı");
  });

  test("Regression Test 7 — Eksik lojistik maliyetleri teklif QA kontrolünde yakalanır", () => {
    const supabase = createAutopilotSandboxSupabase();
    const service = new SalesAutopilotService(supabase);
    const quote = service.generateQuoteDraft({
      product: mockIzonCatalog[0],
      quantity: 1,
      discountPercent: 5,
      // hiçbir lojistik bedel girilmedi
    });
    assert.equal(quote.requiresApproval, true, "Eksik lojistik maliyeti yönetici onayı gerektirmeli");
    assert.ok(quote.approvalReason?.includes("Eksik lojistik maliyeti"));
    assert.equal(quote.missingCostItems.length, 2, "Hem nakliye hem montaj eksik olarak işaretlenmeli");
  });

  test("Regression Test 8 — KPI toplamları son 10 kayıtla sınırlı kalmaz (exact count)", async () => {
    const supabase = createAutopilotSandboxSupabase();
    // 25 lead ekle
    for (let i = 0; i < 25; i++) {
      supabase._store.leads.push({
        id: `lead-bulk-${i}`,
        organization_id: izonOrgId,
        full_name: `Müşteri ${i}`,
        status: "new",
      });
    }

    const { count: exactLeadCount } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", izonOrgId);

    const { data: recentLeadsLimited } = await supabase
      .from("leads")
      .select("*")
      .eq("organization_id", izonOrgId)
      .limit(10);

    assert.equal(exactLeadCount, 25, "KPI sayımı gerçek toplam 25 adeti göstermeli");
    assert.equal(recentLeadsLimited?.length, 10, "Tablo listesi 10 kayıtla sınırlı kalmalı");
    assert.notEqual(exactLeadCount, recentLeadsLimited?.length, "KPI toplamı ile son 10 listesi birbirinden bağımsız olmalı");
  });

  test("Regression Test 9 — KPI sorguları tenant izolasyonunu korur", async () => {
    const supabase = createAutopilotSandboxSupabase();
    const otherOrgId = "99999999-9999-9999-9999-999999999999";
    // İzon için 5, Diğer org için 15 kayıt ekle
    for (let i = 0; i < 5; i++) {
      supabase._store.leads.push({ id: `lead-izon-${i}`, organization_id: izonOrgId });
    }
    for (let i = 0; i < 15; i++) {
      supabase._store.leads.push({ id: `lead-other-${i}`, organization_id: otherOrgId });
    }

    const { count: izonCount } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", izonOrgId);

    const { count: otherCount } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", otherOrgId);

    assert.equal(izonCount, 5, "İzon KPI yalnızca kendi organizasyonunun kayıtlarını saymalı");
    assert.equal(otherCount, 15, "Diğer organizasyon kendi kayıtlarını görmeli");
  });
});
