import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { AgentRegistryService } from "../server/services/orchestration/agent-registry";
import { DurableTaskRunner } from "../server/services/orchestration/task-runner";
import { BusinessMemoryService } from "../server/services/orchestration/business-memory";
import { ConnectorFrameworkService } from "../server/services/orchestration/connector-framework";
import { QaValidatorService } from "../server/services/orchestration/qa-validator";
import { runOrchestrationWorkerBatch } from "../server/services/orchestration/worker";
import { validateCustomerWindow } from "../lib/utils/customer-window";

type MockRow = Record<string, unknown>;
type FilterPredicate = (row: MockRow) => boolean;

interface MockQueryBuilder {
  select: (cols?: string) => MockQueryBuilder;
  insert: (rows: MockRow | MockRow[]) => {
    select: () => {
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

// In-Memory Supabase Mock for E2E Orchestration Verification
function createE2EMockSupabase() {
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
          id: r.id || `mock-${Math.random().toString(36).substring(2, 9)}`,
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
        let updateFilter: FilterPredicate = () => true;
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
            const targets = store[table].filter(updateFilter);
            if (targets.length === 0) return { data: null, error: { message: "Not found" } };
            Object.assign(targets[0], patch);
            return { data: targets[0], error: null };
          },
          maybeSingle: async () => {
            const targets = store[table].filter(updateFilter);
            if (targets.length === 0) return { data: null, error: null };
            Object.assign(targets[0], patch);
            return { data: targets[0], error: null };
          },
          then: <T>(resolve: (value: { data: MockRow[]; error: null }) => T) => {
            const targets = store[table].filter(updateFilter);
            for (const t of targets) Object.assign(t, patch);
            return resolve({ data: targets, error: null });
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
      limit: () => builder,
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

describe("FlowSales AI — Autonomous Operations End-to-End Workflow Verification", () => {
  const orgA = "org-enterprise-alpha";
  const orgB = "org-competitor-beta";

  test("Workflow 1: Lead Qualification & Autonomous Agent Handoff", async () => {
    const supabase = createE2EMockSupabase();
    const registry = new AgentRegistryService(supabase);
    await registry.getOrSeedAgents(orgA);

    const runner = new DurableTaskRunner(supabase);

    // 1. Görev oluşturulur: Müşteri adayı nitelendirme
    const { data: leadTask } = await supabase.from("orchestration_tasks").insert({
      organization_id: orgA,
      title: "Gelen Kurumsal Talebi İncele ve Nitelendir",
      assigned_agent_key: "lead_research_agent",
      status: "pending",
      input_context: {
        company: "Acme Logistics",
        employee_count: 250,
        budget_range: "50.000 - 100.000 TRY",
        inbound_message: "Depo operasyonlarımız için çok kanallı WhatsApp ve CRM entegrasyonu arıyoruz.",
      },
    }).select().single();

    assert.ok(leadTask?.id);

    // 2. Ajan görevi yürütür
    const execResult = await runner.executeSingleTask(leadTask, orgA, [leadTask], []);
    assert.equal(execResult.status, "completed");

    // 3. Satış Temsilcisi için sonraki görev ve yapılandırılmış handoff oluşturulur
    const { data: salesTask } = await supabase.from("orchestration_tasks").insert({
      organization_id: orgA,
      title: "Kurumsal Satış Teklifi Hazırla",
      assigned_agent_key: "sales_agent",
      status: "pending",
    }).select().single();

    const { data: handoff } = await supabase.from("orchestration_handoffs").insert({
      organization_id: orgA,
      source_task_id: leadTask.id,
      destination_task_id: salesTask.id,
      source_agent_key: "lead_research_agent",
      destination_agent_key: "sales_agent",
      handoff_purpose: "Acme Logistics 250 çalışanlı yüksek potansiyelli lead. Bütçe 50k+ TRY.",
      shared_context: {
        leadScore: 92,
        recommendedAction: "Teklif hazırlama ve Zoom randevusu",
      },
      status: "accepted",
    }).select().single();

    assert.ok(handoff?.id);
    assert.equal(handoff.source_agent_key, "lead_research_agent");
    assert.equal(handoff.destination_agent_key, "sales_agent");
    assert.equal(handoff.shared_context.leadScore, 92);
  });

  test("Workflow 2: Deterministic Quote Math & Human Approval Enforcement", async () => {
    const supabase = createE2EMockSupabase();
    const connector = new ConnectorFrameworkService(supabase);

    // 1. Teklif kalemleri: 2 adet x 2500 TRY, %20 KDV, %10 iskonto
    // 2 * 2500 = 5000 Gross. %10 İskonto = 500. Matrah = 4500. %20 KDV = 900. Genel Toplam = 5400.
    const quoteLines = [
      {
        quantity: 2,
        unit_price: 2500,
        tax_rate: 20,
        discount: 10,
        discount_type: "percentage" as const,
      },
    ];

    // 2. QA Validator ile deterministik finansal hesap denetimi
    const qaResult = QaValidatorService.validateTaskOutput({
      taskTitle: "Kurumsal CRM Teklifi Hazırla",
      agentKey: "sales_agent",
      output: {
        quoteLines,
        summary: "FlowSales Kurumsal Lisans ve Kurulum Paketi",
      },
    });

    assert.equal(qaResult.passed, true);
    assert.ok(qaResult.sanitizedOutput?.verified_totals);
    const totals = qaResult.sanitizedOutput.verified_totals as { grand_total: number };
    assert.equal(totals.grand_total, 5400);

    // 3. Onaysız harici çalıştırma denemesi (Fail-Closed)
    const unauthorizedDispatch = await connector.executeConnectorOperation({
      organizationId: orgA,
      providerKey: "crm_internal",
      operation: "execute",
      actionName: "send_official_quote",
      payload: { grandTotal: 5400, customerEmail: "finance@acme.test" },
    });

    assert.equal(unauthorizedDispatch.success, false);
    assert.equal(unauthorizedDispatch.requiresApproval, true);
    assert.ok(unauthorizedDispatch.error?.includes("onay referansı"));

    // 4. İnsan onayı kaydı veritabanına eklenir
    const { data: approval } = await supabase.from("ai_approval_requests").insert({
      organization_id: orgA,
      action_type: "send_quote",
      status: "approved",
      requested_by: "agent:sales_agent",
      approved_by: "user:cagatay",
    }).select().single();

    assert.ok(approval?.id);

    // 5. Onaylı çalıştırma işlemi başarılı olur
    const authorizedDispatch = await connector.executeConnectorOperation({
      organizationId: orgA,
      providerKey: "crm_internal",
      operation: "execute",
      actionName: "send_official_quote",
      payload: { grandTotal: 5400, customerEmail: "finance@acme.test" },
      approvalContext: {
        approvalId: approval.id,
        approvedBy: "user:cagatay",
        isApproved: true,
      },
    });

    assert.equal(authorizedDispatch.success, true);
    assert.equal(authorizedDispatch.statusClassification, "VERIFIED_BY_TEST");
  });

  test("Workflow 3: WhatsApp Support, 24h Customer Window & Draft Safeguards", async () => {
    const supabase = createE2EMockSupabase();
    const connector = new ConnectorFrameworkService(supabase);

    // 1. 24 saatlik müşteri penceresi geçerlilik testi
    const recentTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 saat önce
    const expiredTime = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(); // 26 saat önce

    const validWindow = validateCustomerWindow(recentTime);
    assert.equal(validWindow.allowed, true);

    const expiredWindow = validateCustomerWindow(expiredTime);
    assert.equal(expiredWindow.allowed, false);
    assert.equal(expiredWindow.reason, "expired");

    // 2. Müşteri destek ajanı taslak yanıt oluşturur (Draft Mode)
    const draftResult = await connector.executeConnectorOperation({
      organizationId: orgA,
      providerKey: "whatsapp",
      operation: "create_draft",
      actionName: "reply_support_ticket",
      payload: {
        customerPhone: "+905551234567",
        text: "Merhaba, talebinizi aldık. Destek ekibimiz inceliyor.",
      },
    });

    assert.equal(draftResult.success, true);
    assert.equal(draftResult.isDraft, true);

    // 3. Denetim logu (Audit Trail) doğrulanır
    const logs = supabase._store.connector_execution_logs;
    assert.ok(logs.length > 0);
    assert.equal(logs[logs.length - 1].operation, "whatsapp:reply_support_ticket:create_draft");
    assert.equal(logs[logs.length - 1].status, "success");
  });

  test("Workflow 4: Scheduled Follow-up & Durable Background Cron Worker", async () => {
    const supabase = createE2EMockSupabase();
    const registry = new AgentRegistryService(supabase);
    await registry.getOrSeedAgents(orgA);

    // 1. Arka planda çalışacak bekleyen görevler eklenir
    await supabase.from("orchestration_tasks").insert([
      {
        id: "task-cron-1",
        organization_id: orgA,
        title: "Pazartesi Müşteri Takip Raporu",
        assigned_agent_key: "business_analytics_agent",
        status: "pending",
      },
      {
        id: "task-cron-2",
        organization_id: orgA,
        title: "Sosyal Medya Haftalık İnceleme",
        assigned_agent_key: "social_media_agent",
        status: "pending",
      },
    ]);

    // 2. Background worker batch tetiklenir
    const batchResult = await runOrchestrationWorkerBatch(supabase, {
      maxBatchSize: 10,
      leaseTimeoutMs: 5 * 60 * 1000,
    });

    assert.ok(batchResult.workerRunId);
    assert.equal(batchResult.claimedCount, 2);
    assert.equal(batchResult.completedCount, 2);
    assert.equal(batchResult.failedCount, 0);

    // 3. Görev durumlarının veritabanında "completed" olduğu doğrulanır
    const task1 = supabase._store.orchestration_tasks.find((t) => t.id === "task-cron-1");
    const task2 = supabase._store.orchestration_tasks.find((t) => t.id === "task-cron-2");
    assert.ok(task1);
    assert.ok(task2);
    assert.equal(task1.status, "completed");
    assert.equal(task2.status, "completed");
  });

  test("Workflow 5: Stale Lease Recovery & Crash Resilience", async () => {
    const supabase = createE2EMockSupabase();
    const runner = new DurableTaskRunner(supabase);

    // 1. Çökmüş bir işçi tarafından 15 dakika önce 'running' durumunda bırakılmış bayat görev
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    await supabase.from("orchestration_tasks").insert({
      id: "crashed-task-1",
      organization_id: orgA,
      title: "Veri Madenciliği Görevi (İşçi çöktü)",
      assigned_agent_key: "lead_research_agent",
      status: "running",
      retry_count: 0,
      max_retries: 3,
      updated_at: fifteenMinAgo,
    });

    // 2. Stale task kurtarma döngüsü çalıştırılır
    const recoveryResult = await runner.recoverStaleTasks(orgA, 5 * 60 * 1000);
    assert.equal(recoveryResult.recoveredCount, 1);

    // 3. Görevin tekrar deneme (retrying) durumuna alındığı ve retry_count'un arttığı doğrulanır
    const recoveredTask = supabase._store.orchestration_tasks.find((t) => t.id === "crashed-task-1");
    assert.ok(recoveredTask);
    assert.equal(recoveredTask.status, "retrying");
    assert.equal(recoveredTask.retry_count, 1);
  });

  test("Workflow 6: Strict Cross-Tenant Isolation & Memory Defense", async () => {
    const supabase = createE2EMockSupabase();
    const memoryService = new BusinessMemoryService(supabase);
    const runner = new DurableTaskRunner(supabase);

    // 1. Org A özel bir işletme kuralı / hafızası kaydeder
    await memoryService.addMemory({
      organizationId: orgA,
      category: "business_policy",
      title: "Kurumsal Gizli İskonto Politikası",
      content: "Yalnızca Fortune 500 firmalarına %25 gizli iskonto uygulanabilir.",
      sourceAttribution: "internal_policy_doc",
      confidence: 1.0,
    });

    // 2. Org B hafızaları sorguladığında Org A'nın verilerine ASLA erişemez
    const orgBMemories = await memoryService.getMemories(orgB);
    assert.equal(orgBMemories.length, 0);

    const orgBCompiledPrompt = await memoryService.compileContextForPrompt(orgB);
    assert.equal(orgBCompiledPrompt, "");

    // 3. Org B, Org A'ya ait bir görevi çalıştırmayı / sahiplenmeyi dener
    const { data: orgAPrivateTask } = await supabase.from("orchestration_tasks").insert({
      id: "org-a-private-task",
      organization_id: orgA,
      title: "Gizli Birleşme Analizi",
      assigned_agent_key: "business_analytics_agent",
      status: "pending",
    }).select().single();

    // Org B ile Org A'nın görevini çalıştırma denemesi (Fail-Closed)
    const crossTenantExec = await runner.executeSingleTask(
      orgAPrivateTask,
      orgB, // tenant mismatch
      [orgAPrivateTask],
      []
    );

    // Atomic CAS kilidi organization_id eşleşmediği için 0 satır günceller ve görevi sahiplenmeyi reddeder
    assert.equal(crossTenantExec.status, "queued");
  });
});
