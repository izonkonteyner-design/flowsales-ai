import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { applyLeadScoreDecay, calculateDealRisk, materializeDueSequenceSteps } from "@/server/services/sales-operations-v5";
import { persistWeeklyPipelineSnapshot } from "@/server/services/sales-growth-v6";
import { createSalesHealthAlerts } from "@/server/services/sales-alerts-v6";

function hoursSince(value?: string | null) {
  if (!value) return 9999;
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000));
}

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

export async function refreshQuoteFollowUpState(organizationId: string) {
  const admin = createSupabaseAdminClient();
  const { data: quotes, error } = await admin.from("quotes")
    .select("id,lead_id,status,created_at,updated_at")
    .eq("organization_id", organizationId)
    .in("status", ["sent", "viewed"])
    .limit(1000);
  if (error) throw new Error("Teklif takip durumu yüklenemedi.");
  let updated = 0;
  for (const quote of quotes || []) {
    const ageDays = Math.floor(hoursSince(quote.created_at) / 24);
    const inactivityHours = hoursSince(quote.updated_at);
    const riskScore = calculateDealRisk({ inactivityHours, quoteAgeDays: ageDays, objectionCount: 0, score: 50, followUpOverdue: ageDays >= 3 });
    const reasons = [ageDays >= 15 && "Teklif 15+ gündür açık.", inactivityHours >= 72 && "72+ saattir teklif aktivitesi yok."].filter((value): value is string => Boolean(value));
    const nextFollowUpAt = new Date(Date.now() + (riskScore >= 70 ? 4 : riskScore >= 40 ? 24 : 72) * 3_600_000).toISOString();
    const { error: upsertError } = await admin.from("quote_follow_up_state").upsert({
      quote_id: quote.id,
      organization_id: organizationId,
      last_customer_activity_at: quote.updated_at,
      next_follow_up_at: nextFollowUpAt,
      risk_score: riskScore,
      risk_reasons: reasons,
      updated_at: new Date().toISOString(),
    }, { onConflict: "quote_id" });
    if (upsertError) throw new Error("Teklif takip durumu kaydedilemedi.");
    updated += 1;
  }
  return { evaluated: quotes?.length || 0, updated };
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
    const prefix = draft.action_type === "reply_draft" ? "Mesaj taslağını gözden geçir: " : "";
    const { error: taskError } = await admin.from("tasks").insert({
      organization_id: organizationId,
      lead_id: draft.lead_id || null,
      title: `${prefix}${draft.title}`.slice(0, 250),
      due_at: dueAt,
      priority: draft.action_type === "call" ? "high" : "medium",
      status: "open",
    });
    if (taskError) throw new Error("Otomasyon görevi oluşturulamadı.");
    created += 1;
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
  const [missedCallbacks, quoteTracker, sequences, drafts, scoreDecay] = await Promise.all([
    markOverdueCallbacks(organizationId),
    refreshQuoteFollowUpState(organizationId),
    materializeDueSequenceSteps(organizationId),
    materializeApprovedAutomationDrafts(organizationId),
    applyDailyIntentDecay(organizationId),
  ]);
  const [snapshot, alerts] = await Promise.all([
    options?.includeWeeklySnapshot ? persistWeeklyPipelineSnapshot(organizationId) : Promise.resolve(null),
    createSalesHealthAlerts(organizationId),
  ]);
  return { missedCallbacks, quoteTracker, sequences, drafts, scoreDecay, alerts, snapshot };
}