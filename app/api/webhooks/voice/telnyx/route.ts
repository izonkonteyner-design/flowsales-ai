import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { TelnyxVoiceAdapter } from "@/server/services/voice-channel/telnyx-adapter";
import { salesQualificationSchema } from "@/server/services/sales-session/domain";
import { VoiceSalesRepository, orchestratePhoneTurn, finalizeCallIntelligence, requestHumanHandoff } from "@/server/services/voice-sales-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const adapter = new TelnyxVoiceAdapter();
  if (!(await adapter.verifyWebhook({ rawBody, headers: request.headers }))) return NextResponse.json({ error: "invalid_signature" }, { status: 403 });
  const event = await adapter.parseInboundEvent({ rawBody, headers: request.headers });
  if (!event) return NextResponse.json({ ok: true, ignored: true });

  const repo = new VoiceSalesRepository();
  try {
    if (event.type === "call_started") {
      const identity = await repo.resolveIdentity(event.call.workspaceId, event.call.from);
      const session = await repo.createSession({ organizationId: event.call.workspaceId, channelSessionId: event.call.providerCallId, leadId: identity.leadId, customerId: identity.customerId });
      const call = await repo.createCall({ organizationId: event.call.workspaceId, salesSessionId: session.id, provider: "telnyx", providerCallId: event.call.providerCallId, direction: "inbound", from: event.call.from, to: event.call.to, leadId: identity.leadId, customerId: identity.customerId });
      const callContext = { ...event.call, salesSessionId: session.id };
      await repo.recordEvent({ organizationId: event.call.workspaceId, callId: call.id, provider: "telnyx", providerEventId: event.providerEventId, eventType: event.type });
      await adapter.answerCall(callContext);
      await adapter.startTranscription(callContext);
      const greeting = "Merhaba, İZON Konteyner satış asistanına hoş geldiniz. Size ürünlerimiz, güncel katalog fiyatları ve showroom bilgimiz hakkında yardımcı olabilirim. Nasıl yardımcı olabilirim?";
      await repo.appendTranscript({ organizationId: event.call.workspaceId, callId: call.id, salesSessionId: session.id, speaker: "assistant", text: greeting });
      await adapter.speak(callContext, greeting);
      return NextResponse.json({ ok: true });
    }

    const call = await repo.getCall(event.call.workspaceId, "telnyx", event.call.providerCallId);
    if (!call) return NextResponse.json({ ok: true, ignored: "call_not_initialized" });
    await repo.recordEvent({ organizationId: event.call.workspaceId, callId: call.id, provider: "telnyx", providerEventId: event.providerEventId, eventType: event.type });
    const callContext = { ...event.call, salesSessionId: call.sales_session_id };

    if (event.type === "call_answered") {
      await repo.updateCall(call.id, event.call.workspaceId, { state: "answered", answered_at: new Date().toISOString() });
      return NextResponse.json({ ok: true });
    }

    if (event.type === "barge_in" || event.type === "speech_started") {
      await adapter.stopSpeaking(callContext);
      return NextResponse.json({ ok: true });
    }

    if (event.type === "speech_final") {
      const qualification = salesQualificationSchema.parse(call.qualification ?? {});
      const lower = event.transcript.toLocaleLowerCase("tr-TR");
      if (/temsilci|yetkili|insanla|satış danışmanı/.test(lower)) {
        await repo.appendTranscript({ organizationId: event.call.workspaceId, callId: call.id, salesSessionId: call.sales_session_id, speaker: "customer", text: event.transcript });
        const admin = createSupabaseAdminClient();
        const { data: connection } = await admin.from("voice_provider_connections").select("transfer_destination").eq("organization_id", event.call.workspaceId).eq("provider", "telnyx").eq("phone_number", call.to_number).maybeSingle();
        if (connection?.transfer_destination) {
          await requestHumanHandoff({ organizationId: event.call.workspaceId, callId: call.id, salesSessionId: call.sales_session_id, adapter, callContext, reason: "Müşteri gerçek satış temsilcisi istedi.", destination: connection.transfer_destination, qualification, leadScore: call.lead_score, leadId: call.lead_id });
          return NextResponse.json({ ok: true, handoff: true });
        }
      }
      const result = await orchestratePhoneTurn({ organizationId: event.call.workspaceId, callId: call.id, salesSessionId: call.sales_session_id, transcript: event.transcript, qualification });
      const score = (await import("@/server/services/sales-session/phone-lead-score")).scorePhoneQualification(result.qualification).score;
      await repo.updateCall(call.id, event.call.workspaceId, { qualification: result.qualification, lead_score: score, state: "speaking" });
      await adapter.speak(callContext, result.reply);
      return NextResponse.json({ ok: true, tool: result.tool });
    }

    if (event.type === "call_ended") {
      const qualification = salesQualificationSchema.parse(call.qualification ?? {});
      const endedAt = new Date();
      const startedAt = new Date(call.started_at);
      await finalizeCallIntelligence({ organizationId: event.call.workspaceId, callId: call.id, salesSessionId: call.sales_session_id, leadId: call.lead_id, qualification });
      await repo.updateCall(call.id, event.call.workspaceId, { duration_seconds: Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)), ended_at: endedAt.toISOString(), state: "completed" });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("voice_telnyx_webhook_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "voice_processing_failed" }, { status: 500 });
  }
}
