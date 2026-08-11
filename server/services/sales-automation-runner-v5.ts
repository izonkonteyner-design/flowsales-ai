import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { applyLeadScoreDecay, materializeDueSequenceSteps } from "@/server/services/sales-operations-v5";
import { persistWeeklyPipelineSnapshot } from "@/server/services/sales-growth-v6";
import { createSalesHealthAlerts } from "@/server/services/sales-alerts-v6";

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

export async function applyDailyIntentDecay(organizationId: string) {
  const admin = createSupabaseAdminClient();
  const { data: history, error } = await admin.from("lead_intent_history")
    .select("id,lead_id,score,temperature,reason,factors,source,created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error("Lead skor geçmişi yüklenemedi.");
  const latest = new Map<string, NonNullable<typeof history>[number]>();
  for (const point of history || []) if (!latest.has(point.lead_id)) latest.set(point.lead_id, point);
  if (!latest.size) return { evaluated: 0, decayed: 0 };
  const leadIds = [...latest.keys()];
  const { data: leads } = await admin.from("leads").select("id,status,updated_at").eq("organization_id", organizationId).in("id", leadIds);
  let decayed = 0;
  for (const lead of leads || []) {
    const point = latest.get(lead.id);
    if (!point) continue;
    const nextScore = applyLeadScoreDecay(Number(point.score), lead.updated_at, lead.status);
    if (nextScore >= Number(point.score)) continue;
    const temperature = nextScore >= 70 ? "hot" : nextScore >= 40 ? "warm" : "cold";
    await admin.from("lead_intent_history").insert({
      organization_id: organizationId,
      lead_id: lead.id,
      score: nextScore,
      temperature,
      reason: `Hareketsizlik nedeniyle skor ${point.score} → ${nextScore} olarak kontrollü biçimde düşürüldü.`,
      factors: { previousScore: point.score, lastLeadActivityAt: lead.updated_at, decay: true },
      source: "daily_decay",
    });
    decayed += 1;
  }
  return { evaluated: leads?.length || 0, decayed };
}

export async function runSalesAutomationCycle(organizationId: string, options?: { includeWeeklySnapshot?: boolean }) {
  const [missedCallbacks, sequences, drafts, scoreDecay] = await Promise.all([
    markOverdueCallbacks(organizationId),
    materializeDueSequenceSteps(organizationId),
    materializeApprovedAutomationDrafts(organizationId),
    applyDailyIntentDecay(organizationId),
  ]);
  const [snapshot, alerts] = await Promise.all([
    options?.includeWeeklySnapshot ? persistWeeklyPipelineSnapshot(organizationId) : Promise.resolve(null),
    createSalesHealthAlerts(organizationId),
  ]);
  return { missedCallbacks, sequences, drafts, scoreDecay, alerts, snapshot };
}