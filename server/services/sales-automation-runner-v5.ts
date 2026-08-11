import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { materializeDueSequenceSteps } from "@/server/services/sales-operations-v5";
import { persistWeeklyPipelineSnapshot } from "@/server/services/sales-growth-v6";

export async function markOverdueCallbacks(organizationId: string) {
  const admin = createSupabaseAdminClient();
  const cutoff = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data, error } = await admin.from("sales_callback_queue")
    .update({ status: "missed", updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .lt("scheduled_for", cutoff)
    .select("id");
  if (error) throw new Error("Geciken callback kayıtları güncellenemedi.");
  return data?.length || 0;
}

export async function materializeApprovedAutomationDrafts(organizationId: string) {
  const admin = createSupabaseAdminClient();
  const { data: drafts, error } = await admin.from("sales_automation_drafts")
    .select("id,lead_id,action_type,title,payload,scheduled_for,status")
    .eq("organization_id", organizationId)
    .eq("status", "approved")
    .lte("scheduled_for", new Date().toISOString())
    .limit(100);
  if (error) throw new Error("Onaylı otomasyon taslakları yüklenemedi.");
  let created = 0;
  for (const draft of drafts || []) {
    const dueAt = draft.scheduled_for || new Date().toISOString();
    if (["task", "call", "reminder"].includes(draft.action_type)) {
      const { error: taskError } = await admin.from("tasks").insert({
        organization_id: organizationId,
        lead_id: draft.lead_id || null,
        title: draft.title,
        due_at: dueAt,
        priority: draft.action_type === "call" ? "high" : "medium",
        status: "open",
      });
      if (taskError) throw new Error("Otomasyon görevi oluşturulamadı.");
      created += 1;
    }
    await admin.from("sales_automation_drafts").update({ status: "completed" }).eq("id", draft.id).eq("organization_id", organizationId).eq("status", "approved");
  }
  return { processed: drafts?.length || 0, tasksCreated: created };
}

export async function runSalesAutomationCycle(organizationId: string, options?: { includeWeeklySnapshot?: boolean }) {
  const [missedCallbacks, sequences, drafts] = await Promise.all([
    markOverdueCallbacks(organizationId),
    materializeDueSequenceSteps(organizationId),
    materializeApprovedAutomationDrafts(organizationId),
  ]);
  const snapshot = options?.includeWeeklySnapshot ? await persistWeeklyPipelineSnapshot(organizationId) : null;
  return { missedCallbacks, sequences, drafts, snapshot };
}
