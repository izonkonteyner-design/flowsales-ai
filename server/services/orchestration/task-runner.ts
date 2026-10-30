import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  type OrchestrationTask,
  type OrchestrationTaskStatus,
  type AgentDefinition,
} from "@/types/orchestration";
import { AgentRegistryService } from "./agent-registry";

export interface DbTaskRow {
  id: string;
  organization_id: string;
  plan_id: string;
  parent_task_id?: string | null;
  agent_id?: string | null;
  assigned_agent_key: string;
  title: string;
  description?: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  status: OrchestrationTaskStatus;
  input_payload?: Record<string, unknown> | null;
  output_payload?: Record<string, unknown> | null;
  retry_count?: number | null;
  max_retries?: number | null;
  started_at?: string | null;
  completed_at?: string | null;
  error_info?: Record<string, unknown> | null;
  approval_request_id?: string | null;
  concurrency_lock_id?: string | null;
}

export interface DbDepRow {
  id?: string;
  organization_id: string;
  task_id: string;
  depends_on_task_id: string;
}

export type TaskExecutionHandler = (task: OrchestrationTask, context: {
  handoffInputs: Record<string, unknown>;
  agent: AgentDefinition;
}) => Promise<{
  output: Record<string, unknown>;
  requiresApproval?: boolean;
  approvalData?: {
    summary: string;
    riskLevel: "low" | "medium" | "high";
    actions: unknown[];
  };
}>;

export class DurableTaskRunner {
  private readonly registry: AgentRegistryService;

  constructor(
    private readonly supabase: SupabaseClient,
    registry?: AgentRegistryService
  ) {
    this.registry = registry || new AgentRegistryService(supabase);
  }

  /**
   * Bir planın yürütülmeye hazır görevlerini tarar, bağımlılıkları kontrol eder ve çalıştırır.
   */
  async processPlanTasks(
    planId: string,
    organizationId: string,
    customHandler?: TaskExecutionHandler
  ): Promise<{
    processedCount: number;
    completedCount: number;
    waitingApprovalCount: number;
    failedCount: number;
  }> {
    // 1. Plandaki tüm görevleri ve bağımlılıkları çek
    const { data: rawTasks, error: tasksError } = await this.supabase
      .from("orchestration_tasks")
      .select("*")
      .eq("plan_id", planId)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true });

    if (tasksError || !rawTasks) {
      throw new Error(`Failed to load tasks for plan ${planId}: ${tasksError?.message}`);
    }

    const tasks = rawTasks as DbTaskRow[];

    const { data: rawDeps, error: depsError } = await this.supabase
      .from("orchestration_task_dependencies")
      .select("*")
      .eq("organization_id", organizationId);

    if (depsError) {
      throw new Error(`Failed to load dependencies: ${depsError.message}`);
    }

    const deps = (rawDeps || []) as DbDepRow[];

    let processedCount = 0;
    let completedCount = 0;
    let waitingApprovalCount = 0;
    let failedCount = 0;

    for (const taskRow of tasks) {
      // Sadece çalışmaya uygun durumlardakileri işle
      if (!["pending", "queued", "waiting_for_dependency", "retrying"].includes(taskRow.status)) {
        continue;
      }

      // Bağımlılık kontrolü
      const taskDeps = deps.filter((d) => d.task_id === taskRow.id);
      const unsatisfiedDeps = taskDeps.filter((d) => {
        const prereq = tasks.find((t) => t.id === d.depends_on_task_id);
        return !prereq || prereq.status !== "completed";
      });

      if (unsatisfiedDeps.length > 0) {
        if (taskRow.status !== "waiting_for_dependency") {
          await this.transitionStatus(taskRow.id, organizationId, "waiting_for_dependency");
        }
        continue;
      }

      // Görevi kilitle ve çalıştır
      const result = await this.executeSingleTask(
        taskRow,
        organizationId,
        tasks,
        taskDeps,
        customHandler
      );

      processedCount++;
      if (result.status === "completed") completedCount++;
      if (result.status === "waiting_for_approval") waitingApprovalCount++;
      if (result.status === "failed") failedCount++;
    }

    return {
      processedCount,
      completedCount,
      waitingApprovalCount,
      failedCount,
    };
  }

  /**
   * Tekil bir görevi kilit mekanizması ve hata kurtarma ile yürütür.
   */
  async executeSingleTask(
    taskRow: DbTaskRow,
    organizationId: string,
    allTasks: DbTaskRow[],
    taskDeps: DbDepRow[],
    customHandler?: TaskExecutionHandler
  ): Promise<{ status: OrchestrationTaskStatus; output?: Record<string, unknown>; error?: string }> {
    const lockId = randomUUID();

    // Concurrency Lock: Atomic Compare-And-Swap (CAS) claim.
    // Sadece 'pending', 'queued' veya 'retrying' durumundaki görevleri kilitler.
    const { data: locked, error: lockError } = await this.supabase
      .from("orchestration_tasks")
      .update({
        status: "running",
        concurrency_lock_id: lockId,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskRow.id)
      .eq("organization_id", organizationId)
      .in("status", ["pending", "queued", "retrying"])
      .select("*")
      .maybeSingle();

    if (lockError || !locked) {
      return { status: "queued", error: "Görev başka bir worker tarafından kilitlendi veya uygun durumda değil." };
    }

    // Ajanı getir ve izinleri doğrula
    const agent = await this.registry.getAgentByKey(organizationId, taskRow.assigned_agent_key);
    if (!agent) {
      await this.markFailed(taskRow.id, organizationId, `Atanan ajan bulunamadı: ${taskRow.assigned_agent_key}`);
      return { status: "failed", error: "Agent not found" };
    }

    // Bağımlılıklardan gelen verileri topla (Context Propagation / Handoff)
    const handoffInputs: Record<string, unknown> = {};
    for (const dep of taskDeps) {
      const prereqTask = allTasks.find((t) => t.id === dep.depends_on_task_id);
      if (prereqTask && prereqTask.output_payload) {
        handoffInputs[prereqTask.assigned_agent_key] = prereqTask.output_payload;

        // Structured Handoff kaydı oluştur
        await this.supabase.from("orchestration_handoffs").insert({
          organization_id: organizationId,
          plan_id: taskRow.plan_id,
          source_task_id: prereqTask.id,
          destination_task_id: taskRow.id,
          source_agent_key: prereqTask.assigned_agent_key,
          destination_agent_key: taskRow.assigned_agent_key,
          handoff_purpose: `Veri aktarımı: ${prereqTask.title} -> ${taskRow.title}`,
          shared_context: prereqTask.output_payload,
          status: "accepted",
        });
      }
    }

    try {
      const taskObject: OrchestrationTask = {
        id: taskRow.id,
        organizationId,
        planId: taskRow.plan_id,
        parentTaskId: taskRow.parent_task_id || undefined,
        agentId: taskRow.agent_id || undefined,
        assignedAgentKey: taskRow.assigned_agent_key,
        title: taskRow.title,
        description: taskRow.description || undefined,
        priority: taskRow.priority,
        status: "running",
        inputPayload: taskRow.input_payload || {},
        retryCount: taskRow.retry_count || 0,
        maxRetries: taskRow.max_retries || 3,
        startedAt: new Date().toISOString(),
      };

      let executionResult: {
        output: Record<string, unknown>;
        requiresApproval?: boolean;
        approvalData?: {
          summary: string;
          riskLevel: "low" | "medium" | "high";
          actions: unknown[];
        };
      };

      if (customHandler) {
        executionResult = await customHandler(taskObject, { handoffInputs, agent });
      } else {
        // Varsayılan ajan çalıştırma lojiği
        executionResult = await this.defaultAgentExecutor(taskObject, agent, handoffInputs);
      }

      // İnsan Onayı Gerekiyorsa: Native AI Run deseniyle waiting_for_approval durumuna geçir
      if (executionResult.requiresApproval && executionResult.approvalData) {
        // Gerçek kullanıcı kimliğini belirle: orchestration_plans.created_by
        let actorId: string | null = null;
        if (taskRow.plan_id) {
          const { data: planData } = await this.supabase
            .from("orchestration_plans")
            .select("created_by")
            .eq("id", taskRow.plan_id)
            .maybeSingle();
          if (planData && typeof planData === "object" && "created_by" in planData && (planData as { created_by?: string | null }).created_by) {
            actorId = (planData as { created_by: string }).created_by;
          }
        }

        // Eğer plan created_by yoksa (sistem/cron tetiklemesi), workspace yöneticisini bul
        if (!actorId) {
          const { data: adminMember } = await this.supabase
            .from("organization_members")
            .select("user_id")
            .eq("organization_id", organizationId)
            .in("role", ["owner", "admin"])
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (adminMember && typeof adminMember === "object" && "user_id" in adminMember && (adminMember as { user_id?: string | null }).user_id) {
            actorId = (adminMember as { user_id: string }).user_id;
          }
        }

        const effectiveActorId = actorId || organizationId;

        // 1. Native AI Run oturum kaydı oluştur (NOT NULL run_id ve actor_id tam karşılanır)
        const runId = randomUUID();
        await this.supabase
          .from("ai_runs")
          .insert({
            id: runId,
            organization_id: organizationId,
            actor_id: effectiveActorId,
            capability: "next_best_action",
            status: "completed",
            decision: "approval_required",
            approval_required: true,
            provider: agent?.provider || "gemini",
            model: agent?.model || "gemini-3.5-flash-lite",
            output: executionResult.output || {},
          });

        // 2. ai_approval_requests oluştur ve run_id / requested_by bağla
        const approvalId = randomUUID();
        const { data: approvalRow } = await this.supabase
          .from("ai_approval_requests")
          .insert({
            id: approvalId,
            organization_id: organizationId,
            run_id: runId,
            requested_by: effectiveActorId,
            capability: "next_best_action",
            summary: executionResult.approvalData.summary,
            risk_level: executionResult.approvalData.riskLevel,
            actions: executionResult.approvalData.actions,
            status: "pending",
          })
          .select("id")
          .maybeSingle();

        const finalApprovalId = approvalRow?.id || approvalId;

        // 3. Atomik denetim kaydı oluştur (ai_approval_events)
        await this.supabase
          .from("ai_approval_events")
          .insert({
            organization_id: organizationId,
            approval_id: finalApprovalId,
            actor_id: effectiveActorId,
            event_type: "created",
            metadata: { task_id: taskRow.id, plan_id: taskRow.plan_id },
          });

        // 4. Görevi waiting_for_approval durumuna geçir ve onay kaydını ilişkilendir
        await this.supabase
          .from("orchestration_tasks")
          .update({
            status: "waiting_for_approval",
            output_payload: executionResult.output,
            approval_request_id: finalApprovalId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", taskRow.id)
          .eq("concurrency_lock_id", lockId);

        return { status: "waiting_for_approval", output: executionResult.output };
      }

      // Başarılı tamamlandı
      await this.supabase
        .from("orchestration_tasks")
        .update({
          status: "completed",
          output_payload: executionResult.output,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", taskRow.id)
        .eq("concurrency_lock_id", lockId);

      return { status: "completed", output: executionResult.output };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // Hata durumunda yeniden deneme (retry) politikası
      const nextRetryCount = (taskRow.retry_count || 0) + 1;
      const maxRetries = taskRow.max_retries || 3;

      if (nextRetryCount <= maxRetries) {
        await this.supabase
          .from("orchestration_tasks")
          .update({
            status: "retrying",
            retry_count: nextRetryCount,
            error_info: { message: errMsg, timestamp: new Date().toISOString() },
            updated_at: new Date().toISOString(),
          })
          .eq("id", taskRow.id)
          .eq("concurrency_lock_id", lockId);

        return { status: "retrying", error: errMsg };
      } else {
        await this.supabase
          .from("orchestration_tasks")
          .update({
            status: "failed",
            retry_count: nextRetryCount,
            error_info: { message: errMsg, timestamp: new Date().toISOString() },
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", taskRow.id)
          .eq("concurrency_lock_id", lockId);

        return { status: "failed", error: errMsg };
      }
    }
  }

  /**
   * Standart ajan çalıştırma simülasyonu / bağdaştırıcısı
   */
  private async defaultAgentExecutor(
    task: OrchestrationTask,
    agent: AgentDefinition,
    handoffInputs: Record<string, unknown>
  ): Promise<{
    output: Record<string, unknown>;
    requiresApproval?: boolean;
    approvalData?: {
      summary: string;
      riskLevel: "low" | "medium" | "high";
      actions: unknown[];
    };
  }> {
    const isExternal =
      task.title.toLowerCase().includes("gönder") ||
      task.title.toLowerCase().includes("paylaş") ||
      task.title.toLowerCase().includes("onay");

    const requiresApproval =
      isExternal && agent.permissionProfile.requiresApprovalForExternal;

    const output: Record<string, unknown> = {
      taskTitle: task.title,
      executedByAgent: agent.key,
      summary: `${agent.name} görevi başarıyla icra etti. Girdi parametreleri ve bağımlılık verileri işlendi.`,
      producedAt: new Date().toISOString(),
      handoffKeysReceived: Object.keys(handoffInputs),
    };

    if (requiresApproval) {
      return {
        output,
        requiresApproval: true,
        approvalData: {
          summary: `${task.title} için yönetici onayı bekleniyor.`,
          riskLevel: "medium",
          actions: [
            {
              type: "external_communication",
              title: task.title,
              agentKey: agent.key,
              payload: output,
            },
          ],
        },
      };
    }

    return { output };
  }

  private async transitionStatus(taskId: string, orgId: string, status: OrchestrationTaskStatus): Promise<void> {
    await this.supabase
      .from("orchestration_tasks")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", taskId)
      .eq("organization_id", orgId);
  }

  private async markFailed(taskId: string, orgId: string, reason: string): Promise<void> {
    await this.supabase
      .from("orchestration_tasks")
      .update({
        status: "failed",
        error_info: { message: reason },
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId)
      .eq("organization_id", orgId);
  }

  /**
   * Süresi dolmuş kilitleri (abandoned locks / worker crash) tespit eder ve kurtarır.
   */
  async recoverStaleTasks(
    organizationId: string,
    leaseTimeoutMs: number = 5 * 60 * 1000
  ): Promise<{ recoveredCount: number; failedCount: number }> {
    const cutoff = new Date(Date.now() - leaseTimeoutMs).toISOString();

    const { data: rawStale, error } = await this.supabase
      .from("orchestration_tasks")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("status", "running")
      .lt("updated_at", cutoff);

    if (error || !rawStale || rawStale.length === 0) {
      return { recoveredCount: 0, failedCount: 0 };
    }

    const staleTasks = rawStale as DbTaskRow[];

    let recoveredCount = 0;
    let failedCount = 0;

    for (const task of staleTasks) {
      const nextRetry = (task.retry_count || 0) + 1;
      const maxRetries = task.max_retries || 3;

      if (nextRetry <= maxRetries) {
        await this.supabase
          .from("orchestration_tasks")
          .update({
            status: "retrying",
            retry_count: nextRetry,
            concurrency_lock_id: null,
            error_info: {
              message: "Task execution lock expired (worker crash recovery).",
              recoveredAt: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", task.id)
          .eq("organization_id", organizationId);
        recoveredCount++;
      } else {
        await this.supabase
          .from("orchestration_tasks")
          .update({
            status: "failed",
            concurrency_lock_id: null,
            error_info: {
              message: "Task failed: exceeded maximum retries after worker crash.",
              failedAt: new Date().toISOString(),
            },
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", task.id)
          .eq("organization_id", organizationId);
        failedCount++;
      }
    }

    return { recoveredCount, failedCount };
  }

  /**
   * Bir görevi güvenli bir şekilde iptal eder.
   */
  async cancelTask(taskId: string, organizationId: string, reason?: string): Promise<boolean> {
    const { error } = await this.supabase
      .from("orchestration_tasks")
      .update({
        status: "cancelled",
        error_info: { message: reason || "User cancelled task" },
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId)
      .eq("organization_id", organizationId);

    return !error;
  }
}
