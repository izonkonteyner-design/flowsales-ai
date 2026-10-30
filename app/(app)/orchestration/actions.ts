"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AgentRegistryService } from "@/server/services/orchestration/agent-registry";
import { MaestroOrchestrator } from "@/server/services/orchestration/maestro";
import { DurableTaskRunner } from "@/server/services/orchestration/task-runner";
import { BusinessMemoryService } from "@/server/services/orchestration/business-memory";
import { ConnectorFrameworkService } from "@/server/services/orchestration/connector-framework";
import { getWorkerOperationalMetrics } from "@/server/services/orchestration/worker";
import type { MemoryCategory, ConnectorProviderKey } from "@/types/orchestration";

async function requireContext() {
  const context = await getWorkspaceContext();
  if (context.mode === "demo" || context.role === "viewer") {
    throw new Error("Demo ve salt okunur hesaplar orkestrasyon işlemi yapamaz.");
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase bağlantısı kurulamadı.");
  }
  return { context, supabase };
}

export async function createMaestroPlanAction(formData: FormData) {
  const { context, supabase } = await requireContext();
  const objective = String(formData.get("objective") || "").trim();
  if (!objective) throw new Error("İş hedefi boş olamaz.");

  const registry = new AgentRegistryService(supabase);
  const availableAgents = await registry.getOrSeedAgents(context.organization.id);

  const memoryService = new BusinessMemoryService(supabase);
  const businessContext = await memoryService.compileContextForPrompt(context.organization.id);

  const maestro = new MaestroOrchestrator(supabase);
  const result = await maestro.createPlan({
    organizationId: context.organization.id,
    userId: context.userId || undefined,
    objective,
    availableAgents,
    businessContext,
  });

  revalidatePath("/orchestration");
  return { success: true, planId: result.plan.id, needsClarification: result.needsClarification };
}

export async function executePlanTasksAction(formData: FormData) {
  const { context, supabase } = await requireContext();
  const planId = String(formData.get("planId") || "").trim();
  if (!planId) throw new Error("Plan kimliği zorunludur.");

  const runner = new DurableTaskRunner(supabase);
  const outcome = await runner.processPlanTasks(planId, context.organization.id);

  const maestro = new MaestroOrchestrator(supabase);
  await maestro.aggregateResults(planId);

  revalidatePath("/orchestration");
  return { success: true, outcome };
}

export async function toggleAgentStatusAction(formData: FormData) {
  const { context, supabase } = await requireContext();
  const key = String(formData.get("agentKey") || "").trim();
  const nextStatus = formData.get("status") === "active" ? "active" : "disabled";

  const registry = new AgentRegistryService(supabase);
  await registry.updateAgent(context.organization.id, key, { status: nextStatus });

  revalidatePath("/orchestration");
  return { success: true };
}

export async function addBusinessMemoryAction(formData: FormData) {
  const { context, supabase } = await requireContext();
  const title = String(formData.get("title") || "").trim();
  const content = String(formData.get("content") || "").trim();
  const category = (formData.get("category") || "operational_fact") as MemoryCategory;
  const sourceAttribution = String(formData.get("sourceAttribution") || "Kullanıcı Kaydı").trim();

  if (!title || !content) throw new Error("Başlık ve içerik zorunludur.");

  const memoryService = new BusinessMemoryService(supabase);
  await memoryService.addMemory({
    organizationId: context.organization.id,
    category,
    title,
    content,
    sourceAttribution,
    verifiedBy: context.userId || undefined,
  });

  revalidatePath("/orchestration");
  return { success: true };
}

export async function deleteBusinessMemoryAction(formData: FormData) {
  const { context, supabase } = await requireContext();
  const memoryId = String(formData.get("memoryId") || "").trim();
  if (!memoryId) throw new Error("Hafıza kimliği zorunludur.");

  const memoryService = new BusinessMemoryService(supabase);
  await memoryService.deleteMemory(context.organization.id, memoryId);

  revalidatePath("/orchestration");
  return { success: true };
}

export async function cancelTaskAction(formData: FormData) {
  const { context, supabase } = await requireContext();
  const taskId = String(formData.get("taskId") || "").trim();
  const reason = String(formData.get("reason") || "Kullanıcı tarafından iptal edildi").trim();
  if (!taskId) throw new Error("Görev kimliği zorunludur.");

  const runner = new DurableTaskRunner(supabase);
  await runner.cancelTask(taskId, context.organization.id, reason);

  revalidatePath("/orchestration");
  return { success: true };
}

export async function recoverStaleTasksAction() {
  const { context, supabase } = await requireContext();
  const runner = new DurableTaskRunner(supabase);
  const result = await runner.recoverStaleTasks(context.organization.id);

  revalidatePath("/orchestration");
  return { success: true, ...result };
}

export async function testConnectorAction(formData: FormData) {
  const { context, supabase } = await requireContext();
  const providerKey = String(formData.get("providerKey") || "") as ConnectorProviderKey;
  const actionName = String(formData.get("actionName") || "health_probe");

  const framework = new ConnectorFrameworkService(supabase);
  const result = await framework.executeConnectorOperation({
    organizationId: context.organization.id,
    providerKey,
    operation: "read",
    actionName,
    payload: { ping: true, timestamp: new Date().toISOString() },
  });

  revalidatePath("/orchestration");
  return { success: result.success, result };
}

export async function getWorkerMetricsAction() {
  const { context, supabase } = await requireContext();
  const metrics = await getWorkerOperationalMetrics(supabase, context.organization.id);
  return { success: true, metrics };
}

