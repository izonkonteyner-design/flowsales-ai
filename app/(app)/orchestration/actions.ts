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
import type { TrustedProduct } from "@/server/services/sales-tools/product-catalog-domain";

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

export async function runSalesAutopilotAction(formData: FormData) {
  const { context, supabase } = await requireContext();

  const fullName = String(formData.get("fullName") || "").trim();
  if (!fullName) throw new Error("Müşteri adı soyadı zorunludur.");

  const company = String(formData.get("company") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const city = String(formData.get("city") || "İzmir").trim();
  const budgetTRY = formData.get("budgetTRY") ? Number(formData.get("budgetTRY")) : undefined;
  const requestedM2 = formData.get("requestedM2") ? Number(formData.get("requestedM2")) : 21;
  const roomCount = String(formData.get("roomCount") || "1+1").trim();
  const containerType = (formData.get("containerType") || "ofis") as "ofis" | "yasam" | "santiye" | "ozel";
  const quantity = formData.get("quantity") ? Number(formData.get("quantity")) : 1;
  const discountPercent = formData.get("discountPercent") ? Number(formData.get("discountPercent")) : 5;
  const shippingTRY =
    formData.get("shippingTRY") !== null && formData.get("shippingTRY") !== ""
      ? Number(formData.get("shippingTRY"))
      : undefined;
  const assemblyTRY =
    formData.get("assemblyTRY") !== null && formData.get("assemblyTRY") !== ""
      ? Number(formData.get("assemblyTRY"))
      : undefined;

  const { data: rawProducts } = await supabase
    .from("products")
    .select("*")
    .eq("organization_id", context.organization.id)
    .eq("active", true)
    .limit(50);

  const catalog: TrustedProduct[] = (rawProducts && rawProducts.length > 0)
    ? rawProducts.map((r: Record<string, unknown>) => ({
        id: String(r.id),
        workspaceId: String(r.organization_id || context.organization.id),
        sku: r.sku ? String(r.sku) : null,
        name: String(r.name),
        category: r.category ? String(r.category) : "Konteyner",
        description: r.description ? String(r.description) : null,
        model: r.model ? String(r.model) : null,
        areaM2: r.area_m2 ? Number(r.area_m2) : 21,
        unitPrice: r.unit_price ? Number(r.unit_price) : 75000,
        basePrice: r.base_price ? Number(r.base_price) : 75000,
        currency: r.currency ? String(r.currency) : "TRY",
        features: Array.isArray(r.features) ? (r.features as string[]) : [],
        specifications: Array.isArray(r.specifications)
          ? (r.specifications as Array<{ key: string; value: string }>)
          : [],
        active: r.active === true,
        updatedAt: r.updated_at ? String(r.updated_at) : new Date().toISOString(),
      }))
    : [
        {
          id: "prod-izon-21",
          workspaceId: context.organization.id,
          sku: "IZON-21-STD",
          name: "21 m² Standart Ofis Konteyneri",
          category: "Ofis",
          description: "Yalıtımlı sandviç panel, elektrik ve aydınlatma tesisatlı ofis konteyneri",
          model: "21 m² Ofis",
          areaM2: 21,
          unitPrice: 75000,
          basePrice: 75000,
          currency: "TRY",
          features: ["Sandviç Panel", "PVC Pencere", "Çelik Kapı"],
          specifications: [{ key: "m2", value: "21" }, { key: "oda", value: "Tek Oda" }],
          active: true,
          updatedAt: new Date().toISOString(),
        },
        {
          id: "prod-izon-35",
          workspaceId: context.organization.id,
          sku: "IZON-35-YASAM",
          name: "35 m² 1+1 Yaşam Konteyneri",
          category: "Yaşam",
          description: "1+1 WC ve duşlu, mutfak tezgahlı yaşam konteyneri",
          model: "35 m² 1+1",
          areaM2: 35,
          unitPrice: 135000,
          basePrice: 135000,
          currency: "TRY",
          features: ["WC/Duş", "Mutfak Evyesi", "Isı Yalıtımı"],
          specifications: [{ key: "m2", value: "35" }, { key: "oda", value: "1+1" }],
          active: true,
          updatedAt: new Date().toISOString(),
        },
      ];

  const { SalesAutopilotService } = await import("@/server/services/orchestration/sales-autopilot");
  const service = new SalesAutopilotService(supabase);

  const report = await service.executeFullSalesAutopilot({
    organizationId: context.organization.id,
    userId: context.userId || "system_user",
    input: {
      fullName,
      company: company || undefined,
      phone: phone || undefined,
      email: email || undefined,
      city,
      budgetTRY,
      requestedM2,
      roomCount,
      containerType,
      urgency: "normal",
    },
    catalog,
    customQuantity: quantity,
    customDiscountPercent: discountPercent,
    shippingTRY,
    assemblyTRY,
    userRole: context.role,
  });

  revalidatePath("/orchestration");
  revalidatePath("/leads");
  revalidatePath("/quotes");
  return { success: true, report };
}

