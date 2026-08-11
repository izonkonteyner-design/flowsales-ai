"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { getWorkspaceContext } from "@/server/services/workspace-context";

async function requireAdmin() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live" || !context.userId) throw new Error("Canlı çalışma alanı gerekir.");
  if (!["owner", "admin"].includes(context.role)) throw new Error("Yönetici yetkisi gerekir.");
  return context;
}

export async function createSlaPolicyAction(formData: FormData) {
  const context = await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  const firstResponseMinutes = Number(formData.get("firstResponseMinutes") || 60);
  const followUpMinutes = Number(formData.get("followUpMinutes") || 1440);
  const leadStatus = String(formData.get("leadStatus") || "").trim() || null;
  if (!name || firstResponseMinutes <= 0 || followUpMinutes <= 0) throw new Error("SLA değerlerini kontrol edin.");
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("sales_sla_policies").insert({ organization_id: context.organization.id, name, lead_status: leadStatus, first_response_minutes: firstResponseMinutes, follow_up_minutes: followUpMinutes, active: true });
  if (error) throw new Error("SLA politikası oluşturulamadı.");
  revalidatePath("/growth-control/policies");
}

export async function createRoutingRuleAction(formData: FormData) {
  const context = await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  const targetUserId = String(formData.get("targetUserId") || "").trim();
  if (!name || !targetUserId) throw new Error("Kural adı ve hedef temsilci zorunludur.");
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("sales_routing_rules").insert({ organization_id: context.organization.id, name, source: String(formData.get("source") || "").trim() || null, city: String(formData.get("city") || "").trim() || null, min_estimated_value: Number(formData.get("minEstimatedValue") || 0) || null, target_user_id: targetUserId, priority: Number(formData.get("priority") || 100), active: true });
  if (error) throw new Error("Routing kuralı oluşturulamadı.");
  revalidatePath("/growth-control/policies");
}

export async function toggleSalesPolicyAction(formData: FormData) {
  const context = await requireAdmin();
  const table = formData.get("kind") === "routing" ? "sales_routing_rules" : "sales_sla_policies";
  const id = String(formData.get("id") || "");
  const active = formData.get("active") === "true";
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from(table).update({ active }).eq("organization_id", context.organization.id).eq("id", id);
  if (error) throw new Error("Politika durumu güncellenemedi.");
  revalidatePath("/growth-control/policies");
}
