import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type WorkflowTriggerType,
} from "@/types/orchestration";
import { MaestroOrchestrator } from "./maestro";
import { AgentRegistryService } from "./agent-registry";

export interface DbWorkflowRow {
  id: string;
  organization_id: string;
  title: string;
  description?: string | null;
  trigger_type: WorkflowTriggerType;
  trigger_config?: Record<string, unknown> | null;
  objective_template: string;
  is_active: boolean;
  last_run_at?: string | null;
  next_run_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrchestrationWorkflow {
  id: string;
  organizationId: string;
  title: string;
  description?: string;
  triggerType: WorkflowTriggerType;
  triggerConfig: Record<string, unknown>;
  isActive: boolean;
  objectiveTemplate: string;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export class WorkflowAutomationService {
  private readonly maestro: MaestroOrchestrator;
  private readonly registry: AgentRegistryService;

  constructor(private readonly supabase: SupabaseClient) {
    this.maestro = new MaestroOrchestrator(supabase);
    this.registry = new AgentRegistryService(supabase);
  }

  /**
   * Yeni bir otomatik iş akışı oluşturur
   */
  async createWorkflow(params: {
    organizationId: string;
    title: string;
    description?: string;
    triggerType: WorkflowTriggerType;
    triggerConfig?: Record<string, unknown>;
    objectiveTemplate: string;
  }): Promise<OrchestrationWorkflow> {
    const payload = {
      organization_id: params.organizationId,
      title: params.title.trim(),
      description: params.description?.trim() || null,
      trigger_type: params.triggerType,
      trigger_config: params.triggerConfig || {},
      objective_template: params.objectiveTemplate.trim(),
      is_active: true,
    };

    const { data, error } = await this.supabase
      .from("orchestration_workflows")
      .insert(payload)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(`Failed to create workflow: ${error?.message}`);
    }

    return this.mapRow(data);
  }

  /**
   * Organizasyonun iş akışlarını listeler
   */
  async listWorkflows(organizationId: string): Promise<OrchestrationWorkflow[]> {
    const { data, error } = await this.supabase
      .from("orchestration_workflows")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (error || !data) {
      throw new Error(`Failed to list workflows: ${error?.message}`);
    }

    return (data as DbWorkflowRow[]).map((row) => this.mapRow(row));
  }

  /**
   * Bir olay (event) tetiklendiğinde ilgili iş akışlarını bulur ve Maestro planı başlatır.
   */
  async triggerEventWorkflows(params: {
    organizationId: string;
    triggerType: WorkflowTriggerType;
    eventPayload: Record<string, unknown>;
  }): Promise<{ triggeredCount: number; planIds: string[] }> {
    const { organizationId, triggerType, eventPayload } = params;

    const { data: rawWorkflows, error } = await this.supabase
      .from("orchestration_workflows")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("trigger_type", triggerType)
      .eq("is_active", true);

    if (error || !rawWorkflows || rawWorkflows.length === 0) {
      return { triggeredCount: 0, planIds: [] };
    }

    const workflows = rawWorkflows as DbWorkflowRow[];

    const availableAgents = await this.registry.getOrSeedAgents(organizationId);
    const planIds: string[] = [];

    for (const wf of workflows) {
      // Şablonu event değişkenleriyle birleştir
      let objective = wf.objective_template;
      for (const [key, val] of Object.entries(eventPayload)) {
        objective = objective.replace(new RegExp(`{{${key}}}`, "g"), String(val));
      }

      const planResult = await this.maestro.createPlan({
        organizationId,
        objective,
        availableAgents,
        businessContext: `Olay tetiklendi: ${triggerType}`,
      });

      if (planResult.plan.id) {
        planIds.push(planResult.plan.id);
      }

      // Son çalıştırma zamanını güncelle
      await this.supabase
        .from("orchestration_workflows")
        .update({
          last_run_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", wf.id);
    }

    return { triggeredCount: workflows.length, planIds };
  }

  /**
   * Zamanlanmış (cron/scheduled) iş akışlarını tarar ve vadesi gelenleri çalıştırır.
   * Not: Serverless mimaride bu metodun periyodik olarak harici bir cron (Vercel Cron vb.)
   * tarafından çağrılması gerekir.
   */
  async processScheduledWorkflows(
    organizationId?: string
  ): Promise<{ triggeredCount: number; planIds: string[] }> {
    const now = new Date();
    let query = this.supabase
      .from("orchestration_workflows")
      .select("*")
      .eq("trigger_type", "scheduled")
      .eq("is_active", true);

    if (organizationId) {
      query = query.eq("organization_id", organizationId);
    }

    const { data: rawWorkflows, error } = await query;
    if (error || !rawWorkflows || rawWorkflows.length === 0) {
      return { triggeredCount: 0, planIds: [] };
    }

    const workflows = rawWorkflows as DbWorkflowRow[];

    // Vadesi gelenleri filtrele: next_run_at geçmiş veya hiç çalışmamış
    const dueWorkflows = workflows.filter((wf) => {
      if (!wf.next_run_at) return true;
      return new Date(wf.next_run_at).getTime() <= now.getTime();
    });

    if (dueWorkflows.length === 0) {
      return { triggeredCount: 0, planIds: [] };
    }

    const planIds: string[] = [];

    for (const wf of dueWorkflows) {
      const availableAgents = await this.registry.getOrSeedAgents(wf.organization_id);

      const planResult = await this.maestro.createPlan({
        organizationId: wf.organization_id,
        objective: wf.objective_template,
        availableAgents,
        businessContext: `Zamanlanmış periyodik operasyon: ${wf.title}`,
      });

      if (planResult.plan.id) {
        planIds.push(planResult.plan.id);
      }

      // Sonraki çalışma zamanını hesapla (Varsayılan 24 saat, veya config'deki dakika)
      const intervalMinutes = (wf.trigger_config?.interval_minutes as number) || 24 * 60;
      const nextRun = new Date(now.getTime() + intervalMinutes * 60 * 1000).toISOString();

      await this.supabase
        .from("orchestration_workflows")
        .update({
          last_run_at: now.toISOString(),
          next_run_at: nextRun,
          updated_at: now.toISOString(),
        })
        .eq("id", wf.id);
    }

    return { triggeredCount: dueWorkflows.length, planIds };
  }

  private mapRow(row: DbWorkflowRow): OrchestrationWorkflow {
    return {
      id: row.id,
      organizationId: row.organization_id,
      title: row.title,
      description: row.description || undefined,
      triggerType: row.trigger_type,
      triggerConfig: row.trigger_config || {},
      isActive: Boolean(row.is_active),
      objectiveTemplate: row.objective_template,
      lastRunAt: row.last_run_at || undefined,
      nextRunAt: row.next_run_at || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
