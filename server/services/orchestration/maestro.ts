import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AgentDefinition,
  OrchestrationPlan,
  OrchestrationTask,
  TaskPriority,
} from "@/types/orchestration";

export const plannedTaskSchema = z.object({
  assignedAgentKey: z.string(),
  title: z.string(),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  dependsOnTaskIndices: z.array(z.number().int()).default([]),
  inputPayload: z.record(z.string(), z.unknown()).default({}),
  requiresApproval: z.boolean().default(false),
});
export type PlannedTask = z.infer<typeof plannedTaskSchema>;

export const maestroPlanOutputSchema = z.object({
  summary: z.string(),
  needsClarification: z.boolean(),
  clarifyingQuestions: z.array(z.string()).default([]),
  tasks: z.array(plannedTaskSchema).default([]),
  estimatedTokens: z.number().default(2000),
  estimatedCostUsd: z.number().default(0.01),
});
export type MaestroPlanOutput = z.infer<typeof maestroPlanOutputSchema>;

export class MaestroOrchestrator {
  private genAi?: GoogleGenAI;
  private readonly model: string;

  constructor(private readonly supabase: SupabaseClient, options?: { apiKey?: string; model?: string }) {
    const apiKey = options?.apiKey || process.env.GEMINI_API_KEY?.trim();
    if (apiKey) {
      this.genAi = new GoogleGenAI({ apiKey });
    }
    this.model = options?.model || process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
  }

  /**
   * Doğal dilde verilen hedefi analiz eder, gerekiyorsa netleştirme sorusu üretir,
   * DAG bağımlılıklarıyla yapılandırılmış bir görev planı çıkartır.
   */
  async createPlan(params: {
    organizationId: string;
    userId?: string;
    objective: string;
    availableAgents: AgentDefinition[];
    businessContext?: string;
  }): Promise<{
    plan: OrchestrationPlan;
    tasks: OrchestrationTask[];
    needsClarification: boolean;
    clarifyingQuestions: string[];
    executionMode: "gemini_live" | "deterministic_fallback";
  }> {
    const { organizationId, userId, objective, availableAgents, businessContext } = params;

    // AI ile veya kural tabanlı deterministik planlama
    let planOutput: MaestroPlanOutput;
    let executionMode: "gemini_live" | "deterministic_fallback" = "deterministic_fallback";

    try {
      if (this.genAi && objective.trim().length > 5) {
        planOutput = await this.generateAiPlan(objective, availableAgents, businessContext);
        executionMode = "gemini_live";
      } else {
        planOutput = this.generateDeterministicPlan(objective, availableAgents);
      }
    } catch {
      planOutput = this.generateDeterministicPlan(objective, availableAgents);
      executionMode = "deterministic_fallback";
    }

    // Bütçe ve tavan limit kontrolü
    if (planOutput.tasks.length > 15) {
      planOutput.tasks = planOutput.tasks.slice(0, 15);
    }

    // Halüsinasyon / Bilinmeyen Ajan Koruması (Hallucination Guard)
    const validAgentKeys = new Set(availableAgents.map((a) => a.key));
    for (const t of planOutput.tasks) {
      if (!validAgentKeys.has(t.assignedAgentKey)) {
        // Bilinmeyen veya uydurulan ajan anahtarını güvenli varsayılana eşle
        t.assignedAgentKey = availableAgents.find((a) => a.status === "active")?.key || "sales_agent";
      }
    }

    // Bağımlılık döngü kontrolü (DAG cycle detection)
    this.validateDagAcyclic(planOutput.tasks);

    // 1. orchestration_plans tablosuna kaydet
    const planRow = {
      organization_id: organizationId,
      created_by: userId || null,
      objective: objective.trim(),
      clarifications: planOutput.clarifyingQuestions.map((q) => ({ question: q })),
      status: planOutput.needsClarification ? "draft" : "planned",
      plan_summary: planOutput.summary,
      budget_limits: {
        max_subtasks: 15,
        max_tokens: 60000,
        max_usd: 1.0,
      },
      metrics: {
        total_tokens: planOutput.estimatedTokens,
        estimated_cost_usd: planOutput.estimatedCostUsd,
        duration_ms: 0,
        execution_mode: executionMode,
      },
    };

    const { data: savedPlan, error: planError } = await this.supabase
      .from("orchestration_plans")
      .insert(planRow)
      .select("*")
      .single();

    if (planError || !savedPlan) {
      throw new Error(`Failed to save orchestration plan: ${planError?.message}`);
    }

    const createdPlan: OrchestrationPlan = {
      id: savedPlan.id,
      organizationId: savedPlan.organization_id,
      createdBy: savedPlan.created_by,
      objective: savedPlan.objective,
      clarifications: savedPlan.clarifications || [],
      status: savedPlan.status,
      planSummary: savedPlan.plan_summary,
      budgetLimits: savedPlan.budget_limits,
      metrics: savedPlan.metrics,
      createdAt: savedPlan.created_at,
      updatedAt: savedPlan.updated_at,
    };

    if (planOutput.needsClarification || planOutput.tasks.length === 0) {
      return {
        plan: createdPlan,
        tasks: [],
        needsClarification: true,
        clarifyingQuestions: planOutput.clarifyingQuestions,
        executionMode,
      };
    }

    // 2. Görevleri ve bağımlılıkları kaydet
    const createdTasks: OrchestrationTask[] = [];
    const taskRows = planOutput.tasks.map((t) => {
      const matchingAgent = availableAgents.find((a) => a.key === t.assignedAgentKey);
      return {
        organization_id: organizationId,
        plan_id: savedPlan.id,
        agent_id: matchingAgent?.id || null,
        assigned_agent_key: t.assignedAgentKey,
        title: t.title,
        description: t.description || "",
        priority: t.priority as TaskPriority,
        status: "pending",
        input_payload: t.inputPayload,
        max_retries: 3,
      };
    });

    const { data: savedTasks, error: tasksError } = await this.supabase
      .from("orchestration_tasks")
      .insert(taskRows)
      .select("*");

    if (tasksError || !savedTasks) {
      throw new Error(`Failed to save orchestration tasks: ${tasksError?.message}`);
    }

    for (const r of savedTasks) {
      createdTasks.push({
        id: r.id,
        organizationId: r.organization_id,
        planId: r.plan_id,
        parentTaskId: r.parent_task_id,
        agentId: r.agent_id,
        assignedAgentKey: r.assigned_agent_key,
        title: r.title,
        description: r.description,
        priority: r.priority,
        status: r.status,
        inputPayload: r.input_payload || {},
        outputPayload: r.output_payload,
        errorInfo: r.error_info,
        retryCount: r.retry_count,
        maxRetries: r.max_retries,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      });
    }

    // Bağımlılıkları kaydet (orchestration_task_dependencies)
    const dependenciesToInsert: Array<{
      organization_id: string;
      task_id: string;
      depends_on_task_id: string;
      dependency_type: string;
    }> = [];

    planOutput.tasks.forEach((plannedTask, targetIdx) => {
      const targetSaved = savedTasks[targetIdx];
      if (!targetSaved) return;

      for (const depIdx of plannedTask.dependsOnTaskIndices) {
        const sourceSaved = savedTasks[depIdx];
        if (sourceSaved) {
          dependenciesToInsert.push({
            organization_id: organizationId,
            task_id: targetSaved.id,
            depends_on_task_id: sourceSaved.id,
            dependency_type: "finish_to_start",
          });
        }
      }
    });

    if (dependenciesToInsert.length > 0) {
      await this.supabase.from("orchestration_task_dependencies").insert(dependenciesToInsert);
    }

    return {
      plan: createdPlan,
      tasks: createdTasks,
      needsClarification: false,
      clarifyingQuestions: [],
      executionMode,
    };
  }

  /**
   * Gemini 3.5 structured output kullanarak orkestrasyon planı üretir.
   */
  private async generateAiPlan(
    objective: string,
    availableAgents: AgentDefinition[],
    businessContext?: string
  ): Promise<MaestroPlanOutput> {
    if (!this.genAi) {
      throw new Error("Gemini AI client not initialized.");
    }

    const agentDirectory = availableAgents
      .map((a) => `- [${a.key}] ${a.name} (${a.department}): ${a.description}. İzinler: CRM=${a.permissionProfile.canReadCrm}, Harici Onay=${a.permissionProfile.requiresApprovalForExternal}`)
      .join("\n");

    const systemPrompt = `Sen FlowSales AI Maestro'susun (Merkezi Çoklu Ajan Koordinatörü).
Amacın, kullanıcının iş hedefini analiz edip en uygun uzman ajanları görevlendiren, bağımlılıkları belirlenmiş bir iş planı oluşturmaktır.

MEVCUT AJANLAR:
${agentDirectory}

KURALLAR:
1. Eğer hedef çok belirsizse veya kritik bilgi eksikse (örn. "satış yap" gibi), needsClarification: true yap ve açıklayıcı soru sor.
2. Hedef net ise, en az 2 en fazla 6 ardışık veya paralel alt görev oluştur.
3. Görev bağımlılıklarını \`dependsOnTaskIndices\` dizisiyle (0-indeksli) belirt. Kesinlikle döngü (cycle) olmamalıdır!
4. Her görevi sadece uzmanlık alanına giren doğru ajana ata.
5. Harici iletişim, e-posta gönderimi veya ödeme/teklif onay gerektiriyorsa \`requiresApproval: true\` olarak işaretle.
6. Yanıtını kesinlikle belirtilen JSON formatında ver.`;

    const userPrompt = `İŞ HEDEFİ:
"${objective}"

İŞLETME BAĞLAMI / POLİTİKALAR:
${businessContext || "Standart B2B Satış Operasyonları."}

Lütfen bu hedef için Maestro planını oluştur.`;

    const response = await this.genAi.models.generateContent({
      model: this.model,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error("Empty response from Maestro Gemini.");
    }

    const parsed = JSON.parse(text);
    return maestroPlanOutputSchema.parse(parsed);
  }

  /**
   * AI erişimi yokken veya hızlı testlerde deterministik yedek planlayıcı.
   */
  private generateDeterministicPlan(
    objective: string,
    availableAgents: AgentDefinition[] = []
  ): MaestroPlanOutput {
    void availableAgents;
    const lower = objective.toLowerCase();

    if (objective.trim().length < 6) {
      return {
        summary: "Hedef çok kısa veya eksik.",
        needsClarification: true,
        clarifyingQuestions: ["Hangi müşteri veya kampanya üzerinde çalışmamızı istersiniz?"],
        tasks: [],
        estimatedTokens: 200,
        estimatedCostUsd: 0.001,
      };
    }

    // Satış / Teklif hedefi
    if (lower.includes("satış") || lower.includes("teklif") || lower.includes("fiyat") || lower.includes("lead")) {
      return {
        summary: "Satış fırsatı analizi, teklif hazırlığı ve kalite denetimi planlandı.",
        needsClarification: false,
        clarifyingQuestions: [],
        tasks: [
          {
            assignedAgentKey: "lead_research_agent",
            title: "Aday Firma ve İhtiyaç Analizi",
            description: "Adayın CRM geçmişini ve sektör verilerini derle.",
            priority: "high",
            dependsOnTaskIndices: [],
            inputPayload: { objective },
            requiresApproval: false,
          },
          {
            assignedAgentKey: "sales_agent",
            title: "Teklif Stratejisi ve Eylem Taslağı",
            description: "Aday için en uygun ürün karması ve fiyatlama taslağını oluştur.",
            priority: "high",
            dependsOnTaskIndices: [0],
            inputPayload: { objective },
            requiresApproval: true,
          },
          {
            assignedAgentKey: "qa_agent",
            title: "Teklif ve Politika Uygunluk Denetimi",
            description: "Oluşturulan teklifin kar marjı ve şirket kurallarına uygunluğunu doğrula.",
            priority: "medium",
            dependsOnTaskIndices: [1],
            inputPayload: {},
            requiresApproval: false,
          },
        ],
        estimatedTokens: 3500,
        estimatedCostUsd: 0.015,
      };
    }

    // Sosyal Medya / İçerik hedefi
    if (lower.includes("sosyal") || lower.includes("içerik") || lower.includes("post") || lower.includes("paylaşım")) {
      return {
        summary: "İçerik üretimi, sosyal medya zamanlaması ve yönetici onayı planlandı.",
        needsClarification: false,
        clarifyingQuestions: [],
        tasks: [
          {
            assignedAgentKey: "content_creator_agent",
            title: "Etkileşim Odaklı Metin Taslağı",
            description: "Hedef kitle için mesaj ve görsel kurgusunu yaz.",
            priority: "medium",
            dependsOnTaskIndices: [],
            inputPayload: { objective },
            requiresApproval: false,
          },
          {
            assignedAgentKey: "social_media_agent",
            title: "Sosyal Medya Zamanlama ve Kanal Formatlama",
            description: "Instagram ve LinkedIn formatlarına uyarlayıp yayın takvimine ekle.",
            priority: "medium",
            dependsOnTaskIndices: [0],
            inputPayload: {},
            requiresApproval: true,
          },
        ],
        estimatedTokens: 2500,
        estimatedCostUsd: 0.01,
      };
    }

    // Genel Operasyon / Analitik hedefi
    return {
      summary: "İş analitiği, araştırma ve stratejik değerlendirme planı oluşturuldu.",
      needsClarification: false,
      clarifyingQuestions: [],
      tasks: [
        {
          assignedAgentKey: "business_analytics_agent",
          title: "Mevcut Durum ve Metrik Değerlendirmesi",
          description: "Hedefle ilgili güncel KPI ve CRM verilerini analiz et.",
          priority: "medium",
          dependsOnTaskIndices: [],
          inputPayload: { objective },
          requiresApproval: false,
        },
        {
          assignedAgentKey: "sales_agent",
          title: "Operasyonel İyileştirme ve Sonraki Adım Tasarımı",
          description: "Analitik bulgulara göre aksiyon planı hazırla.",
          priority: "medium",
          dependsOnTaskIndices: [0],
          inputPayload: {},
          requiresApproval: true,
        },
      ],
      estimatedTokens: 3000,
      estimatedCostUsd: 0.012,
    };
  }

  /**
   * Plan görevleri arasında döngüsel bağımlılık (cycle) olmadığını doğrular (Topological Sort).
   */
  private validateDagAcyclic(tasks: PlannedTask[]): void {
    const n = tasks.length;
    const inDegree = new Array(n).fill(0);
    const adj: number[][] = Array.from({ length: n }, () => []);

    for (let i = 0; i < n; i++) {
      for (const dep of tasks[i].dependsOnTaskIndices) {
        if (dep < 0 || dep >= n) {
          throw new Error(`Invalid dependency index ${dep} for task ${i}`);
        }
        if (dep === i) {
          throw new Error(`Self-dependency detected for task ${i}`);
        }
        adj[dep].push(i);
        inDegree[i]++;
      }
    }

    const queue: number[] = [];
    for (let i = 0; i < n; i++) {
      if (inDegree[i] === 0) queue.push(i);
    }

    let visitedCount = 0;
    while (queue.length > 0) {
      const u = queue.shift()!;
      visitedCount++;

      for (const v of adj[u]) {
        inDegree[v]--;
        if (inDegree[v] === 0) {
          queue.push(v);
        }
      }
    }

    if (visitedCount !== n) {
      throw new Error("Cyclic dependency detected in task plan. A DAG is required.");
    }
  }

  /**
   * Tamamlanan görev sonuçlarını toplayıp kullanıcı için nihai sentez raporu üretir.
   */
  async aggregateResults(planId: string): Promise<{
    summary: string;
    completedTasksCount: number;
    failedTasksCount: number;
    outcomes: Array<{ title: string; agent: string; output: unknown }>;
  }> {
    const { data: tasks, error } = await this.supabase
      .from("orchestration_tasks")
      .select("*")
      .eq("plan_id", planId);

    if (error || !tasks) {
      throw new Error(`Failed to load tasks for aggregation: ${error?.message}`);
    }

    interface AggregatedTaskRow {
      title: string;
      status: string;
      assigned_agent_key: string;
      output_payload?: Record<string, unknown> | null;
    }
    const taskRows = (tasks as AggregatedTaskRow[]) || [];
    const completed = taskRows.filter((t) => t.status === "completed");
    const failed = taskRows.filter((t) => t.status === "failed");

    const outcomes = completed.map((t) => ({
      title: t.title,
      agent: t.assigned_agent_key,
      output: t.output_payload,
    }));

    const summary = `Maestro Orkestrasyonu Tamamlandı: Toplam ${tasks.length} görevden ${completed.length} adedi başarıyla sonuçlandırıldı, ${failed.length} adedi başarısız oldu.`;

    // Plan durumunu completed olarak güncelle
    await this.supabase
      .from("orchestration_plans")
      .update({
        status: failed.length > 0 && completed.length === 0 ? "failed" : "completed",
        plan_summary: summary,
        updated_at: new Date().toISOString(),
      })
      .eq("id", planId);

    return {
      summary,
      completedTasksCount: completed.length,
      failedTasksCount: failed.length,
      outcomes,
    };
  }
}
