import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { isSalesRepresentativeRole } from "@/lib/workspace-roles";

export type CallReason = "price" | "product" | "showroom" | "delivery" | "quote" | "support" | "other";
export type CallDisposition = "sales_opportunity" | "follow_up" | "quote_requested" | "unreachable" | "not_interested" | "wrong_number" | "support" | "other";

const OBJECTION_PATTERNS: Array<[string, RegExp]> = [
  ["price_high", /pahalı|fiyat yüksek|bütçemi aşıyor|çok para/i],
  ["thinking", /düşüneyim|düşüneceğim|sonra karar/i],
  ["competitor", /başka firma|rakip|başka yerden/i],
  ["delivery_cost", /nakliye pahalı|nakliye ücreti|taşıma pahalı/i],
  ["timing", /şimdi değil|daha sonra|hazır değilim/i],
];

const BUYING_SIGNAL_PATTERNS: Array<[string, RegExp, number]> = [
  ["quote_request", /teklif gönder|teklif istiyorum|fiyat teklifi/i, 20],
  ["ready_land", /arsa hazır|yer hazır|zemin hazır/i, 15],
  ["near_term", /bu hafta|bu ay|hemen almak|yakında almak/i, 20],
  ["payment_ready", /kapora|ödeme yapabilirim|nakit hazır/i, 20],
  ["showroom_visit", /showroom|yerinizi görmek|ziyaret etmek/i, 10],
];

function hoursSince(value?: string | null) {
  if (!value) return 9999;
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000));
}

export function detectCallReason(text: string): { reason: CallReason; confidence: number } {
  const candidates: Array<[CallReason, RegExp]> = [
    ["price", /fiyat|kaç para|ücret|tl|indirim/i],
    ["showroom", /showroom|adres|neredesiniz|ziyaret/i],
    ["delivery", /teslim|nakliye|kurulum|kaç günde/i],
    ["quote", /teklif|proforma/i],
    ["product", /model|ürün|metrekare|m2|oda|konteyner/i],
    ["support", /şikayet|sorun|arıza|destek/i],
  ];
  for (const [reason, pattern] of candidates) if (pattern.test(text)) return { reason, confidence: 0.9 };
  return { reason: "other", confidence: 0.45 };
}

export function detectObjections(text: string) {
  return OBJECTION_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([key]) => key);
}

export function detectBuyingSignals(text: string) {
  return BUYING_SIGNAL_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([key, , weight]) => ({ key, weight }));
}

export function explainLeadScore(input: { baseScore: number; objections?: string[]; buyingSignals?: Array<{ key: string; weight: number }>; inactiveHours?: number; quoteRequested?: boolean }) {
  const positive = (input.buyingSignals || []).reduce((sum, item) => sum + item.weight, 0) + (input.quoteRequested ? 10 : 0);
  const objectionPenalty = Math.min(25, (input.objections || []).length * 7);
  const inactivityPenalty = Math.min(35, Math.floor((input.inactiveHours || 0) / 48) * 5);
  const score = Math.max(0, Math.min(100, input.baseScore + positive - objectionPenalty - inactivityPenalty));
  return { score, positive, objectionPenalty, inactivityPenalty, explanation: `Temel ${input.baseScore} + satın alma sinyali ${positive} - itiraz ${objectionPenalty} - hareketsizlik ${inactivityPenalty}.` };
}

export function applyLeadScoreDecay(score: number, lastActivityAt: string | null, stage: string) {
  if (["won", "lost"].includes(stage)) return score;
  const hours = hoursSince(lastActivityAt);
  const grace = ["quote_sent", "negotiation"].includes(stage) ? 48 : 72;
  if (hours <= grace) return score;
  const periods = Math.floor((hours - grace) / 48) + 1;
  return Math.max(0, score - Math.min(30, periods * 4));
}

export async function enqueueCallback(params: { organizationId: string; leadId: string; scheduledFor: string; userId: string; assignedUserId?: string | null; voiceCallId?: string | null; reason?: string }) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("sales_callback_queue").insert({ organization_id: params.organizationId, lead_id: params.leadId, scheduled_for: params.scheduledFor, assigned_user_id: params.assignedUserId || params.userId, voice_call_id: params.voiceCallId || null, reason: params.reason || "Müşteri geri aranmak istedi.", created_by: params.userId }).select("id,status,scheduled_for").single();
  if (error || !data) throw new Error("Callback kuyruğu oluşturulamadı.");
  return data;
}

export async function listCallbackQueue(organizationId: string, userId: string, userRole: string) {
  const admin = createSupabaseAdminClient();
  let query = admin.from("sales_callback_queue").select("id,lead_id,assigned_user_id,scheduled_for,status,reason,outcome,created_at,leads(full_name,phone)").eq("organization_id", organizationId).in("status", ["pending","missed"]).order("scheduled_for").limit(100);
  if (isSalesRepresentativeRole(userRole as "sales" | "sales_rep")) query = query.or(`assigned_user_id.eq.${userId},assigned_user_id.is.null`);
  const { data, error } = await query;
  if (error) throw new Error("Callback kuyruğu yüklenemedi.");
  return data || [];
}

export async function completeCallback(params: { organizationId: string; callbackId: string; outcome: string }) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("sales_callback_queue").update({ status: "completed", outcome: params.outcome, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("organization_id", params.organizationId).eq("id", params.callbackId).select("id,status").maybeSingle();
  if (error || !data) throw new Error("Callback tamamlanamadı.");
  return data;
}

export async function saveCallDisposition(params: { organizationId: string; callId: string; leadId?: string | null; disposition: CallDisposition; transcript: string; userId: string; source?: "human" | "ai" }) {
  const admin = createSupabaseAdminClient();
  const reason = detectCallReason(params.transcript);
  const objections = detectObjections(params.transcript);
  const buyingSignals = detectBuyingSignals(params.transcript);
  const { data, error } = await admin.from("sales_call_dispositions").upsert({ organization_id: params.organizationId, call_id: params.callId, lead_id: params.leadId || null, disposition: params.disposition, call_reason: reason.reason, objections, buying_signals: buyingSignals, confidence: reason.confidence, source: params.source || "human", created_by: params.userId }, { onConflict: "organization_id,call_id" }).select("id,disposition,call_reason,objections,buying_signals").single();
  if (error || !data) throw new Error("Görüşme sonucu kaydedilemedi.");
  for (const key of objections) {
    const { data: existing } = await admin.from("sales_objection_library").select("times_detected").eq("organization_id", params.organizationId).eq("objection_key", key).maybeSingle();
    const { error: objectionError } = await admin.from("sales_objection_library").upsert({ organization_id: params.organizationId, objection_key: key, label: key.replaceAll("_", " "), times_detected: Number(existing?.times_detected || 0) + 1 }, { onConflict: "organization_id,objection_key" });
    if (objectionError) throw new Error("İtiraz kütüphanesi güncellenemedi.");
  }
  return data;
}

export async function recordLeadIntent(params: { organizationId: string; leadId: string; baseScore: number; transcript: string; lastActivityAt?: string | null; source?: string }) {
  const admin = createSupabaseAdminClient();
  const objections = detectObjections(params.transcript);
  const signals = detectBuyingSignals(params.transcript);
  const result = explainLeadScore({ baseScore: params.baseScore, objections, buyingSignals: signals, inactiveHours: hoursSince(params.lastActivityAt) });
  const temperature = result.score >= 70 ? "hot" : result.score >= 40 ? "warm" : "cold";
  const { data, error } = await admin.from("lead_intent_history").insert({ organization_id: params.organizationId, lead_id: params.leadId, score: result.score, temperature, reason: result.explanation, factors: { objections, buyingSignals: signals }, source: params.source || "conversation" }).select("id,score,temperature,reason,created_at").single();
  if (error || !data) throw new Error("Lead niyet geçmişi yazılamadı.");
  return data;
}

export async function getLeadIntentHistory(organizationId: string, leadId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("lead_intent_history").select("id,score,temperature,reason,factors,source,created_at").eq("organization_id", organizationId).eq("lead_id", leadId).order("created_at", { ascending: true }).limit(200);
  if (error) throw new Error("Lead niyet geçmişi yüklenemedi.");
  return data || [];
}

export async function createAutomationDraft(params: { organizationId: string; leadId?: string | null; sourceType: string; sourceId?: string | null; actionType: "task" | "call" | "reply_draft" | "reminder"; title: string; payload?: Record<string, unknown>; scheduledFor?: string | null; dedupeKey?: string | null }) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("sales_automation_drafts").insert({ organization_id: params.organizationId, lead_id: params.leadId || null, source_type: params.sourceType, source_id: params.sourceId || null, action_type: params.actionType, title: params.title, payload: params.payload || {}, scheduled_for: params.scheduledFor || null, status: "approval_required", dedupe_key: params.dedupeKey || null }).select("id,status,title,action_type").single();
  if (!error && data) return data;
  if (error?.code === "23505" && params.dedupeKey) {
    const { data: existing, error: existingError } = await admin.from("sales_automation_drafts").select("id,status,title,action_type").eq("organization_id", params.organizationId).eq("dedupe_key", params.dedupeKey).maybeSingle();
    if (!existingError && existing) return existing;
  }
  throw new Error("Otomasyon taslağı oluşturulamadı.");
}

export async function createFollowUpSequence(params: { organizationId: string; userId: string; name: string; description?: string; steps: Array<{ delayHours: number; actionType: "task" | "call" | "reply_draft" | "reminder"; instruction: string }> }) {
  const admin = createSupabaseAdminClient();
  const { data: template, error } = await admin.from("sales_sequence_templates").insert({ organization_id: params.organizationId, name: params.name, description: params.description || null, created_by: params.userId }).select("id,name").single();
  if (error || !template) throw new Error("Takip dizisi oluşturulamadı.");
  const { error: stepError } = await admin.from("sales_sequence_steps").insert(params.steps.map((step, index) => ({ organization_id: params.organizationId, template_id: template.id, step_order: index + 1, delay_hours: step.delayHours, action_type: step.actionType, instruction: step.instruction, requires_human_approval: true })));
  if (stepError) throw new Error("Takip dizisi adımları oluşturulamadı.");
  return template;
}

export async function enrollLeadInSequence(params: { organizationId: string; userId: string; templateId: string; leadId: string }) {
  const admin = createSupabaseAdminClient();
  const { data: firstStep, error: firstStepError } = await admin.from("sales_sequence_steps").select("delay_hours").eq("organization_id", params.organizationId).eq("template_id", params.templateId).order("step_order").limit(1).maybeSingle();
  if (firstStepError || !firstStep) throw new Error("Takip dizisinin ilk adımı bulunamadı.");
  const nextRunAt = new Date(Date.now() + Number(firstStep.delay_hours) * 3_600_000).toISOString();
  const { data, error } = await admin.from("sales_sequence_enrollments").insert({ organization_id: params.organizationId, template_id: params.templateId, lead_id: params.leadId, enrolled_by: params.userId, next_run_at: nextRunAt }).select("id,status,next_run_at").single();
  if (error || !data) throw new Error("Lead takip dizisine eklenemedi.");
  return data;
}

export async function materializeDueSequenceSteps(organizationId: string) {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data: enrollments, error } = await admin.from("sales_sequence_enrollments").select("id,template_id,lead_id,current_step,next_run_at").eq("organization_id", organizationId).eq("status", "active").lte("next_run_at", now).limit(100);
  if (error) throw new Error("Takip dizisi çalıştırılamadı.");
  let created = 0;
  for (const enrollment of enrollments || []) {
    const { data: step, error: stepError } = await admin.from("sales_sequence_steps").select("step_order,delay_hours,action_type,instruction").eq("organization_id", organizationId).eq("template_id", enrollment.template_id).eq("step_order", enrollment.current_step).maybeSingle();
    if (stepError) throw new Error("Takip dizisi adımı yüklenemedi.");
    if (!step) {
      const { error: completionError } = await admin.from("sales_sequence_enrollments").update({ status: "completed", next_run_at: null, updated_at: now }).eq("organization_id", organizationId).eq("id", enrollment.id).eq("status", "active");
      if (completionError) throw new Error("Takip dizisi tamamlanamadı.");
      continue;
    }

    const dedupeKey = `sequence:${enrollment.id}:step:${step.step_order}`;
    const draft = await createAutomationDraft({ organizationId, leadId: enrollment.lead_id, sourceType: "sequence", sourceId: enrollment.id, actionType: step.action_type, title: step.instruction, scheduledFor: now, dedupeKey });
    if (draft.status === "approval_required") created += 1;

    const nextStep = enrollment.current_step + 1;
    const { data: upcoming, error: upcomingError } = await admin.from("sales_sequence_steps").select("delay_hours").eq("organization_id", organizationId).eq("template_id", enrollment.template_id).eq("step_order", nextStep).maybeSingle();
    if (upcomingError) throw new Error("Sonraki takip dizisi adımı yüklenemedi.");
    const patch = upcoming
      ? { current_step: nextStep, next_run_at: new Date(Date.now() + Number(upcoming.delay_hours) * 3_600_000).toISOString(), updated_at: now }
      : { status: "completed", next_run_at: null, updated_at: now };
    const { error: updateError } = await admin.from("sales_sequence_enrollments").update(patch).eq("organization_id", organizationId).eq("id", enrollment.id).eq("status", "active").eq("current_step", enrollment.current_step);
    if (updateError) throw new Error("Takip dizisi ilerletilemedi.");
  }
  return { processed: (enrollments || []).length, draftsCreated: created };
}

export function quoteAgeBucket(createdAt: string) {
  const days = Math.floor(hoursSince(createdAt) / 24);
  if (days <= 2) return "0-2";
  if (days <= 7) return "3-7";
  if (days <= 14) return "8-14";
  return "15+";
}

export function calculateDealRisk(input: { inactivityHours: number; quoteAgeDays: number; objectionCount: number; score: number; followUpOverdue: boolean }) {
  return Math.min(100, Math.round(Math.min(35, input.inactivityHours / 6) + Math.min(25, input.quoteAgeDays * 2) + Math.min(20, input.objectionCount * 7) + (input.followUpOverdue ? 15 : 0) + (input.score < 40 ? 10 : 0)));
}

export async function getQuoteFollowUpDashboard(organizationId: string) {
  const admin = createSupabaseAdminClient();
  const [quoteResult, stateResult] = await Promise.all([
    admin.from("quotes").select("id,quote_number,status,total,created_at,updated_at,lead_id").eq("organization_id", organizationId).in("status", ["sent","viewed"]).order("created_at", { ascending: true }).limit(500),
    admin.from("quote_follow_up_state").select("quote_id,last_customer_activity_at,next_follow_up_at,risk_score,risk_reasons,updated_at").eq("organization_id", organizationId).limit(500),
  ]);
  if (quoteResult.error) throw new Error("Teklif takip görünümü yüklenemedi.");
  if (stateResult.error) throw new Error("Teklif risk durumu yüklenemedi.");
  const stateByQuote = new Map((stateResult.data || []).map((state) => [state.quote_id, state]));
  const rows = (quoteResult.data || []).map((quote) => {
    const ageDays = Math.floor(hoursSince(quote.created_at) / 24);
    const state = stateByQuote.get(quote.id);
    const fallbackRisk = calculateDealRisk({ inactivityHours: hoursSince(quote.updated_at), quoteAgeDays: ageDays, objectionCount: 0, score: 50, followUpOverdue: ageDays >= 3 });
    return {
      ...quote,
      ageDays,
      ageBucket: quoteAgeBucket(quote.created_at),
      riskScore: state ? Number(state.risk_score) : fallbackRisk,
      riskReasons: state?.risk_reasons || [],
      lastCustomerActivityAt: state?.last_customer_activity_at || null,
      nextFollowUpAt: state?.next_follow_up_at || null,
      riskSource: state ? "grounded" : "fallback",
    };
  });
  const buckets = { "0-2": 0, "3-7": 0, "8-14": 0, "15+": 0 } as Record<string, number>;
  for (const row of rows) buckets[row.ageBucket] += 1;
  return { rows: rows.sort((a,b) => b.riskScore - a.riskScore), buckets };
}

export async function getRevenueLeakage(organizationId: string) {
  const admin = createSupabaseAdminClient();
  const { data: leads, error } = await admin.from("leads").select("id,full_name,status,estimated_value,next_follow_up_at,updated_at").eq("organization_id", organizationId).not("status", "in", '(won,lost)').limit(1000);
  if (error) throw new Error("Gelir kaçağı hesaplanamadı.");
  const rows = (leads || []).map((lead) => { const inactivity = hoursSince(lead.updated_at); const overdue = lead.next_follow_up_at ? new Date(lead.next_follow_up_at).getTime() < Date.now() : false; const risk = Math.min(100, Math.round(Math.min(70, inactivity / 2) + (overdue ? 30 : 0))); return { leadId: lead.id, name: lead.full_name, estimatedValue: Number(lead.estimated_value || 0), risk, atRiskValue: Number(lead.estimated_value || 0) * risk / 100 }; }).filter((row) => row.risk >= 40).sort((a,b) => b.atRiskValue - a.atRiskValue);
  return { totalAtRisk: rows.reduce((sum,row) => sum + row.atRiskValue, 0), opportunities: rows.slice(0, 50) };
}

export async function getSalesFunnel(organizationId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("leads").select("status").eq("organization_id", organizationId).limit(5000);
  if (error) throw new Error("Satış hunisi yüklenemedi.");
  const ordered = ["new","contacted","qualified","quote_sent","negotiation","won"];
  const counts = Object.fromEntries(ordered.map((stage) => [stage, (data || []).filter((row) => row.status === stage).length]));
  const stages = ordered.map((stage, index) => ({ stage, count: counts[stage], conversionFromPrevious: index === 0 ? 100 : counts[ordered[index-1]] ? Math.round(counts[stage] / counts[ordered[index-1]] * 100) : 0 }));
  return { total: (data || []).length, stages };
}

export async function globalCommandSearch(organizationId: string, query: string) {
  const admin = createSupabaseAdminClient();
  const q = query.trim();
  if (q.length < 2) return [];
  const [leads, customers, quotes] = await Promise.all([
    admin.from("leads").select("id,full_name,phone,status").eq("organization_id", organizationId).ilike("full_name", `%${q}%`).limit(8),
    admin.from("contacts").select("id,full_name,phone").eq("organization_id", organizationId).ilike("full_name", `%${q}%`).limit(8),
    admin.from("quotes").select("id,quote_number,status,total").eq("organization_id", organizationId).ilike("quote_number", `%${q}%`).limit(8),
  ]);
  return [
    ...(leads.data || []).map((row) => ({ type: "lead", id: row.id, label: row.full_name, meta: row.status, href: `/leads/${row.id}` })),
    ...(customers.data || []).map((row) => ({ type: "customer", id: row.id, label: row.full_name, meta: row.phone || "", href: `/customers/${row.id}` })),
    ...(quotes.data || []).map((row) => ({ type: "quote", id: row.id, label: row.quote_number, meta: row.status, href: `/quotes/${row.id}` })),
  ];
}

export async function answerSalesAnalystQuestion(organizationId: string, question: string) {
  const normalized = question.toLocaleLowerCase("tr-TR");
  const [leakage, funnel, callbacks, quoteDashboard] = await Promise.all([getRevenueLeakage(organizationId), getSalesFunnel(organizationId), listCallbackQueue(organizationId, "", "admin"), getQuoteFollowUpDashboard(organizationId)]);
  if (/risk|gelir|kaçak/.test(normalized)) return { title: "Risk altındaki gelir", answer: `Tahmini risk altındaki gelir ${Math.round(leakage.totalAtRisk).toLocaleString("tr-TR")} TL. En kritik ${Math.min(5, leakage.opportunities.length)} fırsatı önce takip edin.`, evidence: leakage.opportunities.slice(0,5) };
  if (/teklif|quote/.test(normalized)) return { title: "Teklif takibi", answer: `${quoteDashboard.rows.length} açık teklif takipte. 15+ günlük ${quoteDashboard.buckets["15+"] || 0} teklif var.`, evidence: quoteDashboard.rows.slice(0,5) };
  if (/ara|callback|geri ar/.test(normalized)) return { title: "Aranacaklar", answer: `${callbacks.length} callback bekliyor. İlk olarak zamanı geçmiş kayıtları ele alın.`, evidence: callbacks.slice(0,5) };
  return { title: "Satış hunisi", answer: `Toplam ${funnel.total} lead içinde kazanılan ${funnel.stages.find((s) => s.stage === "won")?.count || 0}. En düşük geçiş oranını iyileştirmek öncelikli olmalı.`, evidence: funnel.stages };
}

export async function getSalesOperationsOverview(organizationId: string, userId: string, userRole: string) {
  const [callbacks, quotes, leakage, funnel] = await Promise.all([listCallbackQueue(organizationId,userId,userRole), getQuoteFollowUpDashboard(organizationId), getRevenueLeakage(organizationId), getSalesFunnel(organizationId)]);
  return { callbacks, quotes, leakage, funnel };
}
