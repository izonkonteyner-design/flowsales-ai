import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { createAutomationDraft, detectBuyingSignals, detectCallReason, detectObjections, explainLeadScore, type CallDisposition } from "@/server/services/sales-operations-v5";

export async function postProcessCompletedVoiceCall(input: {
  organizationId: string;
  callId: string;
  leadId?: string | null;
  assignedUserId?: string | null;
  baseScore: number;
  nextBestAction: string;
  customerText: string;
}) {
  const admin = createSupabaseAdminClient();
  const lower = input.customerText.toLocaleLowerCase("tr-TR");
  const disposition: CallDisposition = /teklif/.test(lower)
    ? "quote_requested"
    : input.baseScore >= 70
      ? "sales_opportunity"
      : /ilgilenmiyorum|istemiyorum/.test(lower)
        ? "not_interested"
        : "follow_up";
  const reason = detectCallReason(input.customerText);
  const objections = detectObjections(input.customerText);
  const buyingSignals = detectBuyingSignals(input.customerText);

  const { error: dispositionError } = await admin.from("sales_call_dispositions").upsert({
    organization_id: input.organizationId,
    call_id: input.callId,
    lead_id: input.leadId || null,
    disposition,
    call_reason: reason.reason,
    objections,
    buying_signals: buyingSignals,
    confidence: reason.confidence,
    source: "ai",
    created_by: input.assignedUserId || null,
  }, { onConflict: "organization_id,call_id" });
  if (dispositionError) throw new Error(`Görüşme sonucu kaydedilemedi: ${dispositionError.message}`);

  for (const key of objections) {
    const { data: existing, error: lookupError } = await admin.from("sales_objection_library").select("id,times_detected").eq("organization_id", input.organizationId).eq("objection_key", key).maybeSingle();
    if (lookupError) throw new Error("İtiraz kütüphanesi okunamadı.");
    if (existing) {
      const { error: updateError } = await admin.from("sales_objection_library").update({ times_detected: Number(existing.times_detected || 0) + 1, updated_at: new Date().toISOString() }).eq("id", existing.id);
      if (updateError) throw new Error("İtiraz kütüphanesi güncellenemedi.");
    } else {
      const { error: insertError } = await admin.from("sales_objection_library").insert({ organization_id: input.organizationId, objection_key: key, label: key.replaceAll("_", " "), times_detected: 1 });
      if (insertError) throw new Error("İtiraz kütüphanesi oluşturulamadı.");
    }
  }

  let intent: { score: number; temperature: string } | null = null;
  if (input.leadId) {
    const score = explainLeadScore({ baseScore: input.baseScore, objections, buyingSignals, inactiveHours: 0, quoteRequested: disposition === "quote_requested" });
    const temperature = score.score >= 70 ? "hot" : score.score >= 40 ? "warm" : "cold";
    const { data, error } = await admin.from("lead_intent_history").insert({
      organization_id: input.organizationId,
      lead_id: input.leadId,
      score: score.score,
      temperature,
      reason: score.explanation,
      factors: { objections, buyingSignals, callReason: reason.reason, disposition },
      source: "voice",
    }).select("score,temperature").single();
    if (error || !data) throw new Error("Lead niyet geçmişi yazılamadı.");
    intent = data;

    await createAutomationDraft({
      organizationId: input.organizationId,
      leadId: input.leadId,
      sourceType: "voice_call",
      sourceId: input.callId,
      actionType: input.baseScore >= 70 ? "call" : "task",
      title: input.nextBestAction,
      payload: { disposition, intentScore: data.score, callId: input.callId, callReason: reason.reason },
      scheduledFor: input.baseScore >= 70
        ? new Date(Date.now() + 2 * 3_600_000).toISOString()
        : new Date(Date.now() + 24 * 3_600_000).toISOString(),
      dedupeKey: `voice_call:${input.callId}:next_action`,
    });
  }

  return { disposition, callReason: reason.reason, objections, buyingSignals, intent };
}
