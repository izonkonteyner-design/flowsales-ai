import { getWorkspaceContext } from "@/server/services/workspace-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AgentRegistryService, DEFAULT_AGENT_TEMPLATES } from "@/server/services/orchestration/agent-registry";
import { BusinessMemoryService } from "@/server/services/orchestration/business-memory";
import { OrchestrationClient } from "./orchestration-client";
import type { OrchestrationPlan, OrchestrationTask } from "@/types/orchestration";

export const metadata = {
  title: "AI Operations & Maestro | FlowSales AI",
  description: "Autonomous Multi-Agent Orchestration & Operations Platform",
};

const DEMO_NOW_ISO = "2026-11-01T12:00:00.000Z";
const DEMO_PAST_ISO = "2026-11-01T11:00:00.000Z";
const DEMO_FUTURE_ISO = "2026-11-02T12:00:00.000Z";

interface DbPlanRow {
  id: string;
  organization_id: string;
  created_by?: string;
  objective: string;
  clarifications?: Array<{ question: string; answer?: string }>;
  status: OrchestrationPlan["status"];
  plan_summary?: string;
  budget_limits?: OrchestrationPlan["budgetLimits"];
  metrics?: OrchestrationPlan["metrics"];
  created_at?: string;
  updated_at?: string;
}

interface DbTaskRow {
  id: string;
  organization_id: string;
  plan_id: string;
  parent_task_id?: string | null;
  agent_id?: string | null;
  assigned_agent_key: string;
  title: string;
  description?: string;
  priority: OrchestrationTask["priority"];
  status: OrchestrationTask["status"];
  input_payload?: Record<string, unknown>;
  output_payload?: Record<string, unknown> | null;
  error_info?: OrchestrationTask["errorInfo"];
  retry_count?: number;
  max_retries?: number;
  concurrency_lock_id?: string | null;
  approval_request_id?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export default async function OrchestrationPage() {
  const context = await getWorkspaceContext();

  // Demo modu: Gerçek veritabanını sorgulamadan veya kirletmeden güvenli izole simülasyon sunar
  if (context.mode === "demo") {
    const demoAgents = DEFAULT_AGENT_TEMPLATES.map((tmpl, idx) => ({
      ...tmpl,
      id: `demo-agent-${idx + 1}`,
      organizationId: context.organization.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const demoPlans: OrchestrationPlan[] = [
      {
        id: "demo-plan-1",
        organizationId: context.organization.id,
        objective: "Kurumsal Satış Dönüşümünü Hızlandırma & Maestro Otomasyonu",
        status: "completed",
        planSummary: "Maestro tarafından 3 aşamalı orkestrasyon planı simüle edildi.",
        clarifications: [],
        budgetLimits: { maxSubtasks: 10, maxTokens: 40000, maxUsd: 0.8 },
        metrics: { totalTokens: 12400, estimatedCostUsd: 0.08, durationMs: 3800 },
        createdAt: DEMO_NOW_ISO,
        updatedAt: DEMO_NOW_ISO,
      },
    ];

    const demoTasks: OrchestrationTask[] = [
      {
        id: "demo-task-1",
        organizationId: context.organization.id,
        planId: "demo-plan-1",
        assignedAgentKey: "market_intelligence",
        title: "Pazar ve Rakip Teklif Analizi",
        priority: "high",
        status: "completed",
        inputPayload: { industry: "B2B SaaS" },
        outputPayload: { summary: "Pazar verileri incelendi, fırsatlar belirlendi." },
        retryCount: 0,
        maxRetries: 3,
        createdAt: DEMO_NOW_ISO,
      },
      {
        id: "demo-task-2",
        organizationId: context.organization.id,
        planId: "demo-plan-1",
        assignedAgentKey: "sales_agent",
        title: "Nitelikli Adaylar İçin Teklif Kurgusu",
        priority: "urgent",
        status: "completed",
        inputPayload: { leadTier: "enterprise" },
        outputPayload: { summary: "Kurumsal teklif şablonu hazırlandı." },
        retryCount: 0,
        maxRetries: 3,
        createdAt: DEMO_NOW_ISO,
      },
    ];

    const demoLeads = [
      {
        id: "demo-lead-1",
        full_name: "Borusan Lojistik",
        company: "Borusan Lojistik Dağıtım A.Ş.",
        phone: "+905321234567",
        email: "satin_alma@borusan.com",
        status: "qualified",
        city: "İzmir",
        created_at: DEMO_NOW_ISO,
      },
      {
        id: "demo-lead-2",
        full_name: "Ahmet Yılmaz",
        company: "Yılmaz İnşaat",
        phone: "+905429876543",
        email: "ahmet@yilmazinsaat.com.tr",
        status: "new",
        city: "Manisa",
        created_at: DEMO_PAST_ISO,
      },
    ];

    const demoQuotesList = [
      {
        id: "demo-quote-1",
        lead_id: "demo-lead-1",
        total_amount: 171000,
        currency: "TRY",
        status: "draft",
        created_at: DEMO_NOW_ISO,
        metadata: { itemsCount: 2, model: "21 m² Ofis Konteyneri" },
      },
    ];

    const demoFollowUpTasks = [
      {
        id: "demo-task-followup-1",
        lead_id: "demo-lead-1",
        title: "Borusan Lojistik Teklif Takip Araması",
        due_at: DEMO_FUTURE_ISO,
        priority: "high",
        status: "open",
        created_at: DEMO_NOW_ISO,
      },
    ];

    const demoKpiMetrics = {
      totalLeads: 24,
      totalQuotes: 18,
      pendingTasks: 7,
      draftQuotes: 5,
    };

    return (
      <OrchestrationClient
        initialAgents={demoAgents}
        plans={demoPlans}
        tasks={demoTasks}
        memories={[]}
        connectors={[]}
        canManage={false}
        recentLeads={demoLeads}
        recentQuotes={demoQuotesList}
        pendingTasks={demoFollowUpTasks}
        kpiMetrics={demoKpiMetrics}
      />
    );
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return (
      <div className="p-8 text-center text-slate-400">
        Supabase bağlantısı kurulamadı.
      </div>
    );
  }

  const organizationId = context.organization.id;

  // 1. Ajanları çek / ilk kez açılıyorsa varsayılan 9 şablonu yükle
  const registry = new AgentRegistryService(supabase);
  const initialAgents = await registry.getOrSeedAgents(organizationId);

  // 2. Planları çek
  const { data: plansData } = await supabase
    .from("orchestration_plans")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(10);

  const plans: OrchestrationPlan[] = ((plansData as DbPlanRow[] | null) || []).map((row: DbPlanRow) => ({
    id: row.id,
    organizationId: row.organization_id,
    createdBy: row.created_by,
    objective: row.objective,
    clarifications: row.clarifications || [],
    status: row.status,
    planSummary: row.plan_summary,
    budgetLimits: row.budget_limits || { maxSubtasks: 15, maxTokens: 60000, maxUsd: 1.0 },
    metrics: row.metrics || { totalTokens: 0, estimatedCostUsd: 0, durationMs: 0 },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  // 3. Görevleri çek
  const { data: tasksData } = await supabase
    .from("orchestration_tasks")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .limit(50);

  const tasks: OrchestrationTask[] = ((tasksData as DbTaskRow[] | null) || []).map((row: DbTaskRow) => ({
    id: row.id,
    organizationId: row.organization_id,
    planId: row.plan_id,
    parentTaskId: row.parent_task_id,
    agentId: row.agent_id,
    assignedAgentKey: row.assigned_agent_key,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    inputPayload: row.input_payload || {},
    outputPayload: row.output_payload,
    errorInfo: row.error_info,
    retryCount: row.retry_count || 0,
    maxRetries: row.max_retries || 3,
    concurrencyLockId: row.concurrency_lock_id,
    approvalRequestId: row.approval_request_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  // 4. Hafızayı çek
  const memoryService = new BusinessMemoryService(supabase);
  const memories = await memoryService.getMemories(organizationId, { limit: 20 });

  // 5. Konektörleri çek
  const { data: connectors } = await supabase
    .from("connector_definitions")
    .select("*")
    .eq("organization_id", organizationId);

  // 6. Satış Otopilotu Kokpiti için Lead, Teklif ve Takip Görevlerini Çek
  const { data: recentLeads } = await supabase
    .from("leads")
    .select("id, full_name, company, phone, email, status, city, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(10);

  const { data: recentQuotes } = await supabase
    .from("quotes")
    .select("id, lead_id, total_amount, currency, status, created_at, metadata")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(10);

  const { data: pendingTasks } = await supabase
    .from("tasks")
    .select("id, lead_id, title, due_at, priority, status, created_at")
    .eq("organization_id", organizationId)
    .order("due_at", { ascending: true })
    .limit(10);

  // 7. Gerçek KPI Toplamları (Son 10 kayıt sınırı olmadan veritabanı sayımları)
  const [
    { count: totalLeadsCount },
    { count: totalQuotesCount },
    { count: pendingTasksCount },
    { count: draftQuotesCount },
  ] = await Promise.all([
    supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabase
      .from("quotes")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "open"),
    supabase
      .from("quotes")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "draft"),
  ]);

  const kpiMetrics = {
    totalLeads: typeof totalLeadsCount === "number" ? totalLeadsCount : (recentLeads?.length || 0),
    totalQuotes: typeof totalQuotesCount === "number" ? totalQuotesCount : (recentQuotes?.length || 0),
    pendingTasks: typeof pendingTasksCount === "number" ? pendingTasksCount : (pendingTasks?.length || 0),
    draftQuotes: typeof draftQuotesCount === "number" ? draftQuotesCount : (recentQuotes?.filter(q => q.status === "draft").length || 0),
  };

  return (
    <OrchestrationClient
      initialAgents={initialAgents}
      plans={plans}
      tasks={tasks}
      memories={memories}
      connectors={connectors || []}
      canManage={context.role !== "viewer"}
      recentLeads={recentLeads || []}
      recentQuotes={recentQuotes || []}
      pendingTasks={pendingTasks || []}
      kpiMetrics={kpiMetrics}
    />
  );
}
