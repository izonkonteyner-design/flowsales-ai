import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DurableTaskRunner, type DbTaskRow, type DbDepRow } from "./task-runner";
import { WorkflowAutomationService } from "./workflow-automation";
import { AgentRegistryService } from "./agent-registry";

export interface WorkerBatchOptions {
  maxBatchSize?: number;
  leaseTimeoutMs?: number;
  organizationId?: string;
}

export interface WorkerBatchResult {
  workerRunId: string;
  claimedCount: number;
  completedCount: number;
  waitingApprovalCount: number;
  recoveredCount: number;
  failedCount: number;
  scheduledWorkflowsTriggered: number;
  durationMs: number;
  timestamp: string;
}

export interface WorkerOperationalMetrics {
  organizationId: string;
  queuedTasksCount: number;
  runningTasksCount: number;
  staleTasksCount: number;
  failedTasksCount: number;
  completedTasksCount: number;
  waitingApprovalTasksCount: number;
  activeAgentsCount: number;
  lastWorkerRunTimestamp: string | null;
}

/**
 * Merkezi arka plan işçi fonksiyonu (Durable Background Worker Batch).
 * Cron veya sürekli worker süreci tarafından tetiklenir.
 */
export async function runOrchestrationWorkerBatch(
  supabase: SupabaseClient,
  options: WorkerBatchOptions = {}
): Promise<WorkerBatchResult> {
  const startTime = Date.now();
  const workerRunId = `worker-run-${randomUUID()}`;
  const maxBatchSize = options.maxBatchSize || 10;
  const leaseTimeoutMs = options.leaseTimeoutMs || 5 * 60 * 1000;

  const runner = new DurableTaskRunner(supabase);
  const workflowService = new WorkflowAutomationService(supabase);

  let recoveredCount = 0;
  let failedRecoveryCount = 0;

  // 1. Askıda kalan kilitleri kurtar (Crash / Abandoned Lock Recovery)
  if (options.organizationId) {
    const recovery = await runner.recoverStaleTasks(options.organizationId, leaseTimeoutMs);
    recoveredCount = recovery.recoveredCount;
    failedRecoveryCount = recovery.failedCount;
  } else {
    // Tüm organizasyonlar için genel tarama
    const cutoff = new Date(Date.now() - leaseTimeoutMs).toISOString();
    const { data: rawStale } = await supabase
      .from("orchestration_tasks")
      .select("id, organization_id, retry_count, max_retries")
      .eq("status", "running")
      .lt("updated_at", cutoff)
      .limit(maxBatchSize);

    const staleTasks = rawStale as Array<{ organization_id: string }> | null;
    if (staleTasks && staleTasks.length > 0) {
      for (const st of staleTasks) {
        const rec = await runner.recoverStaleTasks(st.organization_id, leaseTimeoutMs);
        recoveredCount += rec.recoveredCount;
        failedRecoveryCount += rec.failedCount;
      }
    }
  }

  // 2. Yürütülmeyi bekleyen görevleri seç (Bounded Batch Selection)
  let query = supabase
    .from("orchestration_tasks")
    .select("*")
    .in("status", ["pending", "queued", "waiting_for_dependency", "retrying"])
    .order("priority", { ascending: false }) // urgent -> high -> medium -> low
    .order("created_at", { ascending: true })
    .limit(maxBatchSize);

  if (options.organizationId) {
    query = query.eq("organization_id", options.organizationId);
  }

  const { data: rawEligible, error: selectErr } = await query;
  if (selectErr || !rawEligible) {
    return {
      workerRunId,
      claimedCount: 0,
      completedCount: 0,
      waitingApprovalCount: 0,
      recoveredCount,
      failedCount: failedRecoveryCount,
      scheduledWorkflowsTriggered: 0,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  const eligibleTasks = rawEligible as DbTaskRow[];

  let claimedCount = 0;
  let completedCount = 0;
  let waitingApprovalCount = 0;
  let failedCount = failedRecoveryCount;

  // 3. Görev bağımlılıklarını çek
  const { data: rawDeps } = await supabase.from("orchestration_task_dependencies").select("*");
  const allDeps = (rawDeps || []) as DbDepRow[];

  // 4. Her görevi bağımlılık ve atomik CAS kontrolüyle yürüt
  for (const taskRow of eligibleTasks) {
    // İlgili plandaki diğer görevleri çek (bağımlılık doğrulaması için)
    const { data: rawPlanTasks } = await supabase
      .from("orchestration_tasks")
      .select("id, status, assigned_agent_key, output_payload")
      .eq("plan_id", taskRow.plan_id)
      .eq("organization_id", taskRow.organization_id);

    const planTasks = (rawPlanTasks || []) as DbTaskRow[];

    const taskDeps = allDeps.filter((d) => d.task_id === taskRow.id);
    const unsatisfiedDeps = taskDeps.filter((d) => {
      const prereq = planTasks.find((t) => t.id === d.depends_on_task_id);
      return !prereq || prereq.status !== "completed";
    });

    if (unsatisfiedDeps.length > 0) {
      if (taskRow.status !== "waiting_for_dependency") {
        await supabase
          .from("orchestration_tasks")
          .update({ status: "waiting_for_dependency", updated_at: new Date().toISOString() })
          .eq("id", taskRow.id)
          .eq("organization_id", taskRow.organization_id);
      }
      continue;
    }

    // Görevi tekil olarak yürüt (executeSingleTask içinde atomic CAS kilidi mevcuttur)
    const result = await runner.executeSingleTask(
      taskRow,
      taskRow.organization_id,
      planTasks,
      taskDeps
    );

    if (result.status !== "queued") {
      claimedCount++;
    }
    if (result.status === "completed") completedCount++;
    if (result.status === "waiting_for_approval") waitingApprovalCount++;
    if (result.status === "failed") failedCount++;
  }

  // 5. Zamanlanmış iş akışlarını kontrol et (Due cron workflows)
  let scheduledWorkflowsTriggered = 0;
  try {
    const scheduledRes = await workflowService.processScheduledWorkflows(options.organizationId);
    scheduledWorkflowsTriggered = scheduledRes.triggeredCount;
  } catch {
    // İş akışı hatası genel batch'i çökertmez
  }

  return {
    workerRunId,
    claimedCount,
    completedCount,
    waitingApprovalCount,
    recoveredCount,
    failedCount,
    scheduledWorkflowsTriggered,
    durationMs: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Operasyonel görünürlük ve sağlık metriklerini hesaplar.
 */
export async function getWorkerOperationalMetrics(
  supabase: SupabaseClient,
  organizationId: string
): Promise<WorkerOperationalMetrics> {
  const { data: rawTasks } = await supabase
    .from("orchestration_tasks")
    .select("status, updated_at")
    .eq("organization_id", organizationId);

  const tasks = rawTasks as Array<{ status: string; updated_at?: string | null }> | null;

  const registry = new AgentRegistryService(supabase);
  const agents = await registry.getOrSeedAgents(organizationId);

  const now = Date.now();
  const fiveMinAgo = new Date(now - 5 * 60 * 1000).toISOString();

  let queued = 0;
  let running = 0;
  let stale = 0;
  let failed = 0;
  let completed = 0;
  let waitingApproval = 0;

  for (const t of tasks || []) {
    if (["pending", "queued", "waiting_for_dependency", "retrying"].includes(t.status)) queued++;
    if (t.status === "running") {
      running++;
      if (t.updated_at && t.updated_at < fiveMinAgo) {
        stale++;
      }
    }
    if (t.status === "failed") failed++;
    if (t.status === "completed") completed++;
    if (t.status === "waiting_for_approval") waitingApproval++;
  }

  const activeAgents = agents.filter((a) => a.status === "active").length;

  return {
    organizationId,
    queuedTasksCount: queued,
    runningTasksCount: running,
    staleTasksCount: stale,
    failedTasksCount: failed,
    completedTasksCount: completed,
    waitingApprovalTasksCount: waitingApproval,
    activeAgentsCount: activeAgents,
    lastWorkerRunTimestamp: new Date().toISOString(),
  };
}
