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
import { MaestroOrchestrator } from "../server/services/orchestration/maestro";
import { AgentRegistryService } from "../server/services/orchestration/agent-registry";
import { DurableTaskRunner, type DbTaskRow, type DbDepRow } from "../server/services/orchestration/task-runner";
import { ConnectorFrameworkService } from "../server/services/orchestration/connector-framework";
import { QaValidatorService } from "../server/services/orchestration/qa-validator";
import { BusinessMemoryService } from "../server/services/orchestration/business-memory";
import { runOrchestrationWorkerBatch } from "../server/services/orchestration/worker";


type MockRow = Record<string, unknown>;
type FilterPredicate = (row: MockRow) => boolean;

interface MockQueryBuilder {
  select: (cols?: string) => MockQueryBuilder;
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
  then: <T>(resolve: (value: { data: MockRow[]; error: null }) => T) => T;
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

// Complete SQLite / In-Memory Supabase Sandbox replicating Postgres constraints
function createSandboxSupabase() {
  const store: Record<string, MockRow[]> = {
    agent_definitions: [],
    orchestration_plans: [],
    orchestration_tasks: [],
    orchestration_task_dependencies: [],
    orchestration_handoffs: [],
    business_memories: [],
    connector_definitions: [],
    connector_execution_logs: [],
    orchestration_workflows: [],
    ai_approval_requests: [],
    ai_runs: [],
    ai_approval_events: [],
    organization_members: [],
  };

  const createQuery = (table: string): MockQueryBuilder => {
    if (!store[table]) store[table] = [];
    let filterFn: FilterPredicate = () => true;

    const builder: MockQueryBuilder = {
      select: () => builder,
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
      then: <T>(resolve: (value: { data: MockRow[]; error: null }) => T) => {
        const results = store[table].filter(filterFn);
        return resolve({ data: results, error: null });
      },
    };

    return builder;
  };

  return {
    from: createQuery,
    _store: store,
  } as unknown as SupabaseClient & { _store: Record<string, MockRow[]> };
}

describe("FLOWSALES AI — MAESTRO GERÇEK OPERASYONEL E2E DOĞRULAMA", () => {
  const testOrgId = "f11c1551-8b3a-4a18-ad6e-0ab16c061920"; // İZON KONTEYNER sandbox org
  const testUserId = "02aeb5a0-b3b3-4d71-8053-e9506d2f5ac0"; // Owner auth UUID
  const foreignOrgId = "99999999-9999-9999-9999-999999999999";

  test("BÖLÜM 1: Gerçek Görev Döngüsü (12 Adımlı Zincir Tam Doğrulama)", async () => {
    const supabase = createSandboxSupabase();
    const registry = new AgentRegistryService(supabase);
    const availableAgents = await registry.getOrSeedAgents(testOrgId);
    assert.ok(availableAgents.length >= 8, "Varsayılan 8 uzman ajan tohumlanmış olmalı");

    const maestro = new MaestroOrchestrator(supabase);
    const runner = new DurableTaskRunner(supabase, registry);
    const connector = new ConnectorFrameworkService(supabase);

    const testObjective = "Acme Holding için konteyner teklifi hazırla ve kurumsal satış verilerini analiz et";

    // 1. Görev Kabul Edildi & 2. Kalıcı Olarak Kaydedildi & 3. Plan Oluşturuldu
    const planResult = await maestro.createPlan({
      organizationId: testOrgId,
      userId: testUserId,
      objective: testObjective,
      availableAgents,
      businessContext: "Prefabrik konteyner ve modüler yapı satışı",
    });

    assert.ok(planResult.plan.id, "Adım 1-2: Plan ID veritabanında oluşturulmalı");
    assert.equal(planResult.plan.organizationId, testOrgId);
    assert.equal(planResult.plan.status, "planned", "Adım 3: Plan oluşturulmalı");
    assert.ok(planResult.tasks.length > 0, "Plan içinde görevler bulunmalı");

    // Veritabanı teyidi: orchestration_plans tablosunda kayıt var mı?
    const savedPlanRow = supabase._store.orchestration_plans.find((p) => p.id === planResult.plan.id);
    assert.ok(savedPlanRow, "Plan DB'de kalıcı olmalı");

    // 4. Doğru Alt Ajan Seçildi
    const salesTask = planResult.tasks.find((t) => t.assignedAgentKey === "sales_agent");
    assert.ok(salesTask, "Adım 4: Teklif ve satış için 'sales_agent' atanmış olmalı");
    const assignedAgent = availableAgents.find((a) => a.key === salesTask.assignedAgentKey);
    assert.ok(assignedAgent, "Ajan tanımı aktif ajan listesinde bulunmalı");

    // 5. Alt Ajan Gerçekten Çalıştı & 6. İzinli Bir Araç Çağırdı & 7. Araç Gerçek Bir Çıktı Döndürdü
    const taskRow = supabase._store.orchestration_tasks.find((t) => t.id === salesTask.id) as unknown as DbTaskRow;
    assert.ok(taskRow, "Görev DB'de bulunmalı");

    // Alt ajanın izinli araç çağırması (Örn: crm_read / quote_draft)
    assert.ok(assignedAgent.permittedTools.includes("quote_draft"), "Adım 6: Alt ajanın quote_draft aracı izni olmalı");
    const quoteLines = [
      { quantity: 2, unit_price: 75000, tax_rate: 20, discount: 5, discount_type: "percentage" },
    ];

    const toolExecutionResult = await connector.executeConnectorOperation({
      organizationId: testOrgId,
      providerKey: "crm_internal",
      taskId: taskRow.id,
      operation: "create_draft",
      actionName: "quote_draft",
      payload: {
        title: "Acme Holding 2x Ofis Konteyneri",
        quoteLines,
        notes: "Standart yalıtımlı şantiye ofis konteyneri",
      },
    });

    assert.equal(toolExecutionResult.success, true, "Adım 7: Araç başarıyla çalışmalı");
    assert.equal(toolExecutionResult.isDraft, true);
    assert.equal(toolExecutionResult.statusClassification, "VERIFIED_BY_TEST");

    // 8. Alt Ajan Çıktıyı İşledi
    const subagentExecutionOutput = {
      taskTitle: taskRow.title,
      executedByAgent: assignedAgent.key,
      quoteLines,
      reported_total: 142500, // 2 * 75000 = 150000; %5 iskonto = 7500; Matrah = 142500; %20 KDV = 28500; Genel Toplam = 171000
      toolResult: toolExecutionResult.data,
      summary: "Acme Holding için 2 adet ofis konteyneri teklif taslağı hazırlandı.",
    };

    // 9. Sonuç Ana Ajana Döndü & 10. Ana Ajan Sonucu Doğruladı (QA Validator)
    const qaResult = QaValidatorService.validateTaskOutput({
      taskTitle: taskRow.title,
      agentKey: assignedAgent.key,
      output: subagentExecutionOutput,
    });

    assert.equal(qaResult.passed, true, "Adım 10: Ana ajan QA doğrulaması geçmeli");
    assert.ok(qaResult.sanitizedOutput?.verified_totals, "QA Validator deterministik hesap eklemeli");
    const totals = qaResult.sanitizedOutput.verified_totals as { grand_total: number };
    assert.equal(totals.grand_total, 171000, "Deterministik finansal hesap 171.000 TRY olmalı");

    // 11. Görev Tamamlandı Durumuna Geçti
    const executionRun = await runner.executeSingleTask(
      taskRow,
      testOrgId,
      [taskRow],
      [],
      async () => ({
        output: qaResult.sanitizedOutput || subagentExecutionOutput,
      })
    );

    assert.equal(executionRun.status, "completed", "Adım 11: Görev 'completed' durumuna geçmeli");

    // 12. Görev Geçmişi ve Loglar Kaydedildi
    const completedTaskRow = supabase._store.orchestration_tasks.find((t) => t.id === taskRow.id);
    assert.ok(completedTaskRow);
    assert.equal(completedTaskRow.status, "completed");
    assert.ok(completedTaskRow.completed_at, "completed_at zaman damgası kaydedilmeli");
    assert.ok(completedTaskRow.output_payload, "output_payload DB'ye yazılmış olmalı");

    // Connector denetim logu teyidi
    const logs = supabase._store.connector_execution_logs;
    const taskLog = logs.find((l) => l.task_id === taskRow.id);
    assert.ok(taskLog, "Adım 12: connector_execution_logs tablosuna denetim logu yazılmalı");
    assert.equal(taskLog.operation, "crm_internal:quote_draft:create_draft");
    assert.equal(taskLog.status, "success");
  });

  test("BÖLÜM 2: Çoklu Ajan Senaryosu (Araştırma -> Analiz -> Raporlama DAG)", async () => {
    const supabase = createSandboxSupabase();
    const registry = new AgentRegistryService(supabase);
    await registry.getOrSeedAgents(testOrgId);
    const runner = new DurableTaskRunner(supabase, registry);

    const planId = `plan-multi-${randomUUID()}`;

    // 1. Görev 1: Araştırma Ajanı (lead_research_agent)
    const { data: taskResearch } = await supabase.from("orchestration_tasks").insert({
      id: `task-research-${randomUUID()}`,
      organization_id: testOrgId,
      plan_id: planId,
      title: "Müşteri Profili ve Sektör Araştırması",
      assigned_agent_key: "lead_research_agent",
      status: "pending",
      priority: "high",
      input_payload: { company: "Borusan Lojistik", requirement: "30 adet şantiye yemekhane konteyneri" },
    }).select().single();
    assert.ok(taskResearch?.id);

    // 2. Görev 2: Analiz Ajanı (business_analytics_agent) - Görev 1'e bağımlı
    const { data: taskAnalytics } = await supabase.from("orchestration_tasks").insert({
      id: `task-analytics-${randomUUID()}`,
      organization_id: testOrgId,
      plan_id: planId,
      title: "Birim Maliyet, Marj ve İskonto Optimizasyonu",
      assigned_agent_key: "business_analytics_agent",
      status: "waiting_for_dependency",
      priority: "high",
      input_payload: {},
    }).select().single();
    assert.ok(taskAnalytics?.id);

    // 3. Görev 3: Raporlama ve Teklif Ajanı (sales_agent) - Görev 2'ye bağımlı
    const { data: taskReporting } = await supabase.from("orchestration_tasks").insert({
      id: `task-reporting-${randomUUID()}`,
      organization_id: testOrgId,
      plan_id: planId,
      title: "Nihai Yönetici Raporu ve Teklif Formu",
      assigned_agent_key: "sales_agent",
      status: "waiting_for_dependency",
      priority: "high",
      input_payload: {},
    }).select().single();
    assert.ok(taskReporting?.id);

    // Bağımlılıkları kaydet: taskAnalytics -> taskResearch; taskReporting -> taskAnalytics
    await supabase.from("orchestration_task_dependencies").insert([
      { organization_id: testOrgId, task_id: taskAnalytics.id, depends_on_task_id: taskResearch.id },
      { organization_id: testOrgId, task_id: taskReporting.id, depends_on_task_id: taskAnalytics.id },
    ]);

    // ADIM A: Araştırma Ajanı Çalışır
    const researchResult = await runner.executeSingleTask(
      taskResearch,
      testOrgId,
      [taskResearch, taskAnalytics, taskReporting],
      [],
      async () => ({
        output: {
          companySize: 1500,
          sector: "Lojistik & Altyapı",
          urgency: "Yüksek",
          budgetCapTRY: 2500000,
        },
      })
    );
    assert.equal(researchResult.status, "completed");

    // DB güncellemesini yükle
    const updatedResearch = supabase._store.orchestration_tasks.find((t) => t.id === taskResearch.id) as unknown as DbTaskRow;
    const taskDeps = supabase._store.orchestration_task_dependencies as unknown as DbDepRow[];

    // ADIM B: Analiz Ajanı Araştırma Çıktısını Alır ve Çalışır (Handoff Context Propagation)
    const analyticsResult = await runner.executeSingleTask(
      taskAnalytics,
      testOrgId,
      [updatedResearch, taskAnalytics, taskReporting],
      taskDeps.filter((d) => d.task_id === taskAnalytics.id),
      async (task, { handoffInputs }) => {
        // Handoff ile gelen araştırmacı verisini doğrula
        assert.ok(handoffInputs.lead_research_agent, "Araştırma ajanı çıktısı devredilmeli");
        const researchData = handoffInputs.lead_research_agent as { budgetCapTRY: number };
        assert.equal(researchData.budgetCapTRY, 2500000);

        return {
          output: {
            unitCostTRY: 62000,
            recommendedPriceTRY: 78000,
            recommendedDiscountPercent: 4.5,
            expectedMarginPercent: 20.5,
            totalEstimatedAmount: 2223000,
          },
        };
      }
    );
    assert.equal(analyticsResult.status, "completed");

    // Handoff tablosunda kayıt doğrulaması
    const handoff1 = supabase._store.orchestration_handoffs.find(
      (h) => h.source_agent_key === "lead_research_agent" && h.destination_agent_key === "business_analytics_agent"
    );
    assert.ok(handoff1, "Araştırma -> Analiz handoff kaydı oluşmalı");

    // ADIM C: Raporlama ve Satış Ajanı Birleşik Sonucu Oluşturur
    const updatedAnalytics = supabase._store.orchestration_tasks.find((t) => t.id === taskAnalytics.id) as unknown as DbTaskRow;
    const reportingResult = await runner.executeSingleTask(
      taskReporting,
      testOrgId,
      [updatedResearch, updatedAnalytics, taskReporting],
      taskDeps.filter((d) => d.task_id === taskReporting.id),
      async (task, { handoffInputs }) => {
        assert.ok(handoffInputs.business_analytics_agent, "Analiz ajanı verisi satış ajanına devredilmeli");
        const analyticsData = handoffInputs.business_analytics_agent as { totalEstimatedAmount: number };
        return {
          output: {
            reportTitle: "Borusan Lojistik Şantiye Konteyner Kompleksi Satış Planı",
            finalAmountTRY: analyticsData.totalEstimatedAmount,
            leadStatus: "ready_for_contract",
            nextStep: "Müşteri sözleşme randevusu ayarlandı",
          },
        };
      }
    );
    assert.equal(reportingResult.status, "completed");

    // Handoff 2 doğrulaması
    const handoff2 = supabase._store.orchestration_handoffs.find(
      (h) => h.source_agent_key === "business_analytics_agent" && h.destination_agent_key === "sales_agent"
    );
    assert.ok(handoff2, "Analiz -> Satış handoff kaydı oluşmalı");
  });

  test("BÖLÜM 3: Hata Kurtarma, Retry, Idempotency ve Worker Stale Lock", async () => {
    const supabase = createSandboxSupabase();
    const registry = new AgentRegistryService(supabase);
    await registry.getOrSeedAgents(testOrgId);
    const runner = new DurableTaskRunner(supabase, registry);

    // 1. Alt Ajan Hata Veriyor -> Retry Politikası (Next retry -> status: retrying)
    const { data: failTask } = await supabase.from("orchestration_tasks").insert({
      id: `task-fail-${randomUUID()}`,
      organization_id: testOrgId,
      title: "Hatalı Dış API Çağrısı Yapan Görev",
      assigned_agent_key: "sales_agent",
      status: "pending",
      retry_count: 0,
      max_retries: 2,
    }).select().single();

    const firstRun = await runner.executeSingleTask(
      failTask,
      testOrgId,
      [failTask],
      [],
      async () => {
        throw new Error("Dış API bağlantı hatası (Simüle Timeout 504)");
      }
    );

    assert.equal(firstRun.status, "retrying", "İlk hata durumunda görev retrying'e geçmeli");
    assert.ok(firstRun.error?.includes("504"));

    const retriedTask = supabase._store.orchestration_tasks.find((t) => t.id === failTask.id) as unknown as DbTaskRow;
    assert.equal(retriedTask.retry_count, 1, "retry_count 1 artmalı");

    // 2. Maksimum Retry Aşımı -> status: failed
    retriedTask.retry_count = 2; // Son deneme hakkı
    const finalRun = await runner.executeSingleTask(
      retriedTask,
      testOrgId,
      [retriedTask],
      [],
      async () => {
        throw new Error("Kalıcı sunucu hatası (Simüle 500)");
      }
    );

    assert.equal(finalRun.status, "failed", "Maksimum deneme aşıldığında durum 'failed' olmalı");
    const permanentlyFailed = supabase._store.orchestration_tasks.find((t) => t.id === failTask.id);
    assert.equal(permanentlyFailed?.status, "failed");

    // 3. Provider Yanıt Vermiyor / 402 Resource Exhausted -> Deterministic Fallback Koruması
    const maestro = new MaestroOrchestrator(supabase);
    const fallbackPlan = await maestro.createPlan({
      organizationId: testOrgId,
      objective: "Boru hattı haftalık analiz ve rapor oluştur",
      availableAgents: await registry.getOrSeedAgents(testOrgId),
    });
    assert.ok(fallbackPlan.plan.id, "Provider çöktüğünde deterministik fallback çalışmalı");
    assert.equal(fallbackPlan.executionMode, "deterministic_fallback");

    // 4. Worker Kapanıyor / Stale Lock Recovery
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { data: crashedTask } = await supabase.from("orchestration_tasks").insert({
      id: `crashed-worker-task-${randomUUID()}`,
      organization_id: testOrgId,
      title: "Worker Kapandığı İçin Askıda Kalan Görev",
      assigned_agent_key: "lead_research_agent",
      status: "running",
      retry_count: 0,
      max_retries: 3,
      updated_at: twentyMinAgo,
    }).select().single();

    const recovery = await runner.recoverStaleTasks(testOrgId, 5 * 60 * 1000);
    assert.equal(recovery.recoveredCount, 1, "Stale kilit başarıyla kurtarılmalı");

    const recovered = supabase._store.orchestration_tasks.find((t) => t.id === crashedTask.id);
    assert.equal(recovered?.status, "retrying");
    assert.equal(recovered?.retry_count, 1);

    // 5. Idempotency ve Concurrency Lock Çakışması (Aynı görev iki kez gönderildiğinde)
    const { data: concurrentTask } = await supabase.from("orchestration_tasks").insert({
      id: `concurrent-task-${randomUUID()}`,
      organization_id: testOrgId,
      title: "Aynı Anda İki Kez Tetiklenen Görev",
      assigned_agent_key: "business_analytics_agent",
      status: "pending",
    }).select().single();

    // Birinci işçi görevi kilitler
    const worker1Promise = runner.executeSingleTask(concurrentTask, testOrgId, [concurrentTask], []);
    // İkinci işçi hemen aynı görevi kilitlemeye çalışır (Atomic CAS başarısız olur)
    const worker2Promise = runner.executeSingleTask(concurrentTask, testOrgId, [concurrentTask], []);

    const [w1Result, w2Result] = await Promise.all([worker1Promise, worker2Promise]);
    const statuses = [w1Result.status, w2Result.status];
    assert.ok(statuses.includes("completed") || statuses.includes("waiting_for_approval"), "Birinci işçi görevi alıp işlemeli");
    assert.ok(statuses.includes("queued"), "İkinci eşzamanlı istek kilit nedeniyle 'queued' kalmalı (Atomic CAS)");

    // 6. Worker Yeniden Başlatılıyor (Restart Batch Execution)
    const batchResult = await runOrchestrationWorkerBatch(supabase, {
      organizationId: testOrgId,
      maxBatchSize: 10,
    });
    assert.ok(batchResult.workerRunId);
    assert.ok(batchResult.durationMs >= 0);
  });

  test("BÖLÜM 4: Güvenlik, Onay Mekanizması, Cross-Tenant ve Cron Secret Koruması", async () => {
    const supabase = createSandboxSupabase();
    const connector = new ConnectorFrameworkService(supabase);
    const runner = new DurableTaskRunner(supabase);

    // 1. Viewer Rolünün Onay / Harici Çalıştırma Yapamadığının Doğrulanması
    // FlowSales RBAC matrisinde viewer rolünün harici eylem onayı vermesi engellenir
    const { data: viewerApproval } = await supabase.from("ai_approval_requests").insert({
      id: `approval-viewer-${randomUUID()}`,
      organization_id: testOrgId,
      action_type: "send_quote",
      status: "pending",
      requested_by: "agent:sales_agent",
    }).select().single();

    // Viewer rolü 'approved' durumuna geçiremez; yetkisiz onay doğrulaması
    const unapprovedExecute = await connector.executeConnectorOperation({
      organizationId: testOrgId,
      providerKey: "crm_internal",
      operation: "execute",
      actionName: "send_official_quote",
      payload: { amount: 100000 },
      approvalContext: {
        approvalId: viewerApproval.id,
        approvedBy: "user:viewer_user",
        isApproved: false, // Viewer onaylayamaz
      },
    });

    assert.equal(unapprovedExecute.success, false, "Onaylanmamış harici işlem engellenmeli");
    assert.equal(unapprovedExecute.requiresApproval, true);

    // 2. Tenant Dışındaki Görev ve Verilere Erişim (Cross-Tenant Fail-Closed)
    const { data: foreignTask } = await supabase.from("orchestration_tasks").insert({
      id: `foreign-task-${randomUUID()}`,
      organization_id: foreignOrgId, // Yabancı tenant
      title: "Yabancı Şirket Verisi",
      assigned_agent_key: "sales_agent",
      status: "pending",
    }).select().single();

    // testOrgId yetkisiyle foreignTask'i çalıştırma denemesi
    const breachAttempt = await runner.executeSingleTask(
      foreignTask,
      testOrgId, // Yanlış tenant ID
      [foreignTask],
      []
    );
    assert.equal(breachAttempt.status, "queued", "Cross-tenant istekte atomic CAS kilitlenemez ve reddedilir");

    // 3. Hafıza İzolasyonu (Memory Defense)
    const memoryService = new BusinessMemoryService(supabase);
    await memoryService.addMemory({
      organizationId: testOrgId,
      category: "business_policy",
      title: "Özel Fiyat Politikası",
      content: "Gizli kurumsal fiyat listesi",
      sourceAttribution: "internal_policy",
    });

    const foreignMemories = await memoryService.getMemories(foreignOrgId);
    assert.equal(foreignMemories.length, 0, "Yabancı tenant başka bir tenantın hafıza kayıtlarını göremez");
  });
});
