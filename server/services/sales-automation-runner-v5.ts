import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { applyLeadScoreDecay, calculateDealRisk } from "@/server/services/sales-operations-v5";
import { persistWeeklyPipelineSnapshot } from "@/server/services/sales-growth-v6";
import { createSalesHealthAlerts } from "@/server/services/sales-alerts-v6";

function hoursSince(value?: string | null) {
  if (!value) return 9999;
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000));
}

function istanbulDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function jsonArrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

async function loadQuoteRiskSignals(organizationId: string, leadIds: string[]) {
  const admin = createSupabaseAdminClient();
  const latestScoreByLead = new Map<string, number>();
  const objectionCountByLead = new Map<string, number>();
  const latestCustomerActivityByLead = new Map<string, string>();

  if (!leadIds.length) return { latestScoreByLead, objectionCountByLead, latestCustomerActivityByLead };

  const [intentResult, dispositionResult, conversationResult] = await Promise.all([
    admin.from("lead_intent_history")
      .select("lead_id,score,created_at")
      .eq("organization_id", organizationId)
      .in("lead_id", leadIds)
      .order("created_at", { ascending: false })
      .limit(5000),
    admin.from("sales_call_dispositions")
      .select("lead_id,objections,created_at")
      .eq("organization_id", organizationId)
      .in("lead_id", leadIds)
      .order("created_at", { ascending: false })
      .limit(5000),
    admin.from("conversations")
      .select("id,lead_id")
      .eq("organization_id", organizationId)
      .in("lead_id", leadIds)
      .limit(5000),
  ]);

  if (intentResult.error) throw new Error("Teklif risk skoru için lead niyet verisi yüklenemedi.");
  if (dispositionResult.error) throw new Error("Teklif risk skoru için itiraz verisi yüklenemedi.");
  if (conversationResult.error) throw new Error("Teklif risk skoru için görüşme verisi yüklenemedi.");

  for (const point of intentResult.data || []) {
    if (point.lead_id && !latestScoreByLead.has(point.lead_id)) latestScoreByLead.set(point.lead_id, Number(point.score));
  }
  for (const disposition of dispositionResult.data || []) {
    if (disposition.lead_id && !objectionCountByLead.has(disposition.lead_id)) {
      objectionCountByLead.set(disposition.lead_id, jsonArrayLength(disposition.objections));
    }
  }

  const conversationToLead = new Map<string, string>();
  for (const conversation of conversationResult.data || []) {
    if (conversation.id && conversation.lead_id) conversationToLead.set(conversation.id, conversation.lead_id);
  }

  const conversationIds = [...conversationToLead.keys()];
  if (conversationIds.length) {
    const { data: inboundMessages, error: messageError } = await admin.from("messages")
      .select("conversation_id,created_at")
      .eq("organization_id", organizationId)
      .eq("direction", "inbound")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (messageError) throw new Error("Teklif risk skoru için müşteri aktivitesi yüklenemedi.");
    for (const message of inboundMessages || []) {
      const leadId = conversationToLead.get(message.conversation_id);
      if (leadId && !latestCustomerActivityByLead.has(leadId)) latestCustomerActivityByLead.set(leadId, message.created_at);
    }
  }

  return { latestScoreByLead, objectionCountByLead, latestCustomerActivityByLead };
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

  const leadIds = [...new Set((quotes || []).map((quote) => quote.lead_id).filter((value): value is string => Boolean(value)))];
  const signals = await loadQuoteRiskSignals(organizationId, leadIds);
  let updated = 0;

  for (const quote of quotes || []) {
    const ageDays = Math.floor(hoursSince(quote.created_at) / 24);
    const customerActivityAt = quote.lead_id ? signals.latestCustomerActivityByLead.get(quote.lead_id) || null : null;
    const inactivityAnchor = customerActivityAt || quote.updated_at;
    const inactivityHours = hoursSince(inactivityAnchor);
    const score = quote.lead_id ? signals.latestScoreByLead.get(quote.lead_id) ?? 50 : 50;
    const objectionCount = quote.lead_id ? signals.objectionCountByLead.get(quote.lead_id) ?? 0 : 0;
    const followUpOverdue = ageDays >= 3 && inactivityHours >= 24;
    const riskScore = calculateDealRisk({ inactivityHours, quoteAgeDays: ageDays, objectionCount, score, followUpOverdue });
    const reasons = [
      ageDays >= 15 && "Teklif 15+ gündür açık.",
      customerActivityAt && inactivityHours >= 72 && "Müşteriden 72+ saattir yeni aktivite yok.",
      !customerActivityAt && inactivityHours >= 72 && "Doğrulanmış müşteri aktivitesi yok; son teklif güncellemesi 72+ saat önce.",
      objectionCount > 0 && `${objectionCount} doğrulanmış itiraz sinyali var.`,
      score < 40 && `Güncel lead niyet skoru düşük (${score}).`,
    ].filter((value): value is string => Boolean(value));
    const nextFollowUpAt = new Date(Date.now() + (riskScore >= 70 ? 4 : riskScore >= 40 ? 24 : 72) * 3_600_000).toISOString();
    const { error: upsertError } = await admin.from("quote_follow_up_state").upsert({
      quote_id: quote.id,
      organization_id: organizationId,
      last_customer_activity_at: customerActivityAt,
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

export async function materializeDueSequenceStepsSafely(organizationId: string) {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data: enrollments, error } = await admin.from("sales_sequence_enrollments")
    .select("id,template_id,lead_id,current_step,next_run_at")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .lte("next_run_at", now)
    .limit(100);
  if (error) throw new Error("Takip dizisi çalıştırılamadı.");

  let created = 0;
  for (const enrollment of enrollments || []) {
    const { data: step, error: stepError } = await admin.from("sales_sequence_steps")
      .select("step_order,action_type,instruction")
      .eq("organization_id", organizationId)
      .eq("template_id", enrollment.template_id)
      .eq("step_order", enrollment.current_step)
      .maybeSingle();
    if (stepError) throw new Error("Takip dizisi adımı yüklenemedi.");

    if (!step) {
      const { error: completeError } = await admin.from("sales_sequence_enrollments")
        .update({ status: "completed", next_run_at: null, updated_at: now })
        .eq("organization_id", organizationId)
        .eq("id", enrollment.id)
        .eq("status", "active");
      if (completeError) throw new Error("Takip dizisi tamamlanamadı.");
      continue;
    }

    const dedupeKey = `sequence:${enrollment.id}:step:${step.step_order}`;
    const { error: draftError } = await admin.from("sales_automation_drafts").insert({
      organization_id: organizationId,
      lead_id: enrollment.lead_id,
      source_type: "sequence",
      source_id: enrollment.id,
      action_type: step.action_type,
      title: step.instruction,
      payload: { sequenceEnrollmentId: enrollment.id, sequenceStep: step.step_order },
      scheduled_for: now,
      status: "approval_required",
      dedupe_key: dedupeKey,
    });
    if (draftError && draftError.code !== "23505") throw new Error("Takip dizisi otomasyon taslağı oluşturulamadı.");
    if (!draftError) created += 1;

    const nextStep = enrollment.current_step + 1;
    const { data: upcoming, error: upcomingError } = await admin.from("sales_sequence_steps")
      .select("delay_hours")
      .eq("organization_id", organizationId)
      .eq("template_id", enrollment.template_id)
      .eq("step_order", nextStep)
      .maybeSingle();
    if (upcomingError) throw new Error("Sonraki takip dizisi adımı yüklenemedi.");

    const patch = upcoming
      ? { current_step: nextStep, next_run_at: new Date(Date.now() + Number(upcoming.delay_hours) * 3_600_000).toISOString(), updated_at: now }
      : { status: "completed", next_run_at: null, updated_at: now };
    const { error: updateError } = await admin.from("sales_sequence_enrollments")
      .update(patch)
      .eq("organization_id", organizationId)
      .eq("id", enrollment.id)
      .eq("status", "active")
      .eq("current_step", enrollment.current_step);
    if (updateError) throw new Error("Takip dizisi ilerletilemedi.");
  }
  return { processed: (enrollments || []).length, draftsCreated: created };
}

export async function materializeApprovedAutomationDrafts(organizationId: string) {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const [unscheduledResult, scheduledResult] = await Promise.all([
    admin.from("sales_automation_drafts")
      .select("id,lead_id,action_type,title,payload,scheduled_for,status")
      .eq("organization_id", organizationId)
      .eq("status", "approved")
      .is("scheduled_for", null)
      .limit(100),
    admin.from("sales_automation_drafts")
      .select("id,lead_id,action_type,title,payload,scheduled_for,status")
      .eq("organization_id", organizationId)
      .eq("status", "approved")
      .lte("scheduled_for", now)
      .limit(100),
  ]);
  if (unscheduledResult.error || scheduledResult.error) throw new Error("Onaylı otomasyon taslakları yüklenemedi.");

  const drafts = [...new Map([...(unscheduledResult.data || []), ...(scheduledResult.data || [])].map((draft) => [draft.id, draft])).values()].slice(0, 100);
  let created = 0;

  for (const draft of drafts) {
    const dueAt = draft.scheduled_for || now;
    const prefix = draft.action_type === "reply_draft" ? "Mesaj taslağını gözden geçir: " : "";
    const { error: taskError } = await admin.from("tasks").insert({
      organization_id: organizationId,
      lead_id: draft.lead_id || null,
      automation_draft_id: draft.id,
      title: `${prefix}${draft.title}`.slice(0, 250),
      due_at: dueAt,
      priority: draft.action_type === "call" ? "high" : "medium",
      status: "open",
    });
    if (taskError && taskError.code !== "23505") throw new Error("Otomasyon görevi oluşturulamadı.");
    if (!taskError) created += 1;

    const { data: completed, error: completionError } = await admin.from("sales_automation_drafts")
      .update({ status: "completed" })
      .eq("id", draft.id)
      .eq("organization_id", organizationId)
      .eq("status", "approved")
      .select("id")
      .maybeSingle();
    if (completionError) throw new Error("Otomasyon taslağı tamamlandı olarak işaretlenemedi.");
    if (!completed && !taskError) throw new Error("Otomasyon taslağı eşzamanlı olarak değiştirildi; görev durumu doğrulanamadı.");
  }
  return { processed: drafts.length, tasksCreated: created };
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
  const { data: leads, error: leadError } = await admin.from("leads")
    .select("id,status,updated_at")
    .eq("organization_id", organizationId)
    .in("id", leadIds);
  if (leadError) throw new Error("Lead skor düşüşü için lead kayıtları yüklenemedi.");

  let decayed = 0;
  const dateKey = istanbulDateKey();
  for (const lead of leads || []) {
    const point = latest.get(lead.id);
    if (!point) continue;
    const nextScore = applyLeadScoreDecay(Number(point.score), lead.updated_at, lead.status);
    if (nextScore >= Number(point.score)) continue;
    const temperature = nextScore >= 70 ? "hot" : nextScore >= 40 ? "warm" : "cold";
    const { error: insertError } = await admin.from("lead_intent_history").insert({
      organization_id: organizationId,
      lead_id: lead.id,
      score: nextScore,
      temperature,
      reason: `Hareketsizlik nedeniyle skor ${point.score} → ${nextScore} olarak kontrollü biçimde düşürüldü.`,
      factors: { previousScore: point.score, lastLeadActivityAt: lead.updated_at, decay: true },
      source: "daily_decay",
      dedupe_key: `daily_decay:${lead.id}:${dateKey}`,
    });
    if (insertError && insertError.code !== "23505") throw new Error("Lead skor düşüşü kaydedilemedi.");
    if (!insertError) decayed += 1;
  }
  return { evaluated: leads?.length || 0, decayed };
}

export async function runSalesAutomationCycle(organizationId: string, options?: { includeWeeklySnapshot?: boolean }) {
  const [missedCallbacks, quoteTracker, sequences, drafts, scoreDecay] = await Promise.all([
    markOverdueCallbacks(organizationId),
    refreshQuoteFollowUpState(organizationId),
    materializeDueSequenceStepsSafely(organizationId),
    materializeApprovedAutomationDrafts(organizationId),
    applyDailyIntentDecay(organizationId),
  ]);
  const [snapshot, alerts] = await Promise.all([
    options?.includeWeeklySnapshot ? persistWeeklyPipelineSnapshot(organizationId) : Promise.resolve(null),
    createSalesHealthAlerts(organizationId),
  ]);
  return { missedCallbacks, quoteTracker, sequences, drafts, scoreDecay, alerts, snapshot };
}