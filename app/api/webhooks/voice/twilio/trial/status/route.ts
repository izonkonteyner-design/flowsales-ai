import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { salesQualificationSchema } from "@/server/services/sales-session/domain";
import { VoiceSalesRepository, finalizeCallIntelligence } from "@/server/services/voice-sales-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isTrustedTrialRequest(request: Request) {
  const expected = process.env.TWILIO_TRIAL_WEBHOOK_SECRET?.trim() || "";
  const supplied = new URL(request.url).searchParams.get("secret")?.trim() || "";
  return expected.length >= 32 && supplied.length >= 32 && safeEqual(expected, supplied);
}

export async function POST(request: Request) {
  if (!isTrustedTrialRequest(request)) return NextResponse.json({ error: "invalid_trial_secret" }, { status: 403 });
  const raw = await request.text();
  const params = new URLSearchParams(raw);
  const callSid = params.get("CallSid")?.trim() || "";
  const callStatus = params.get("CallStatus")?.trim().toLowerCase() || "";
  const durationSeconds = Number.parseInt(params.get("CallDuration") || "", 10);
  if (!callSid) return NextResponse.json({ error: "missing_call_sid" }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: call } = await admin.from("voice_calls").select("*").eq("provider", "twilio").eq("provider_call_id", callSid).maybeSingle();
  if (!call) return NextResponse.json({ ok: true, ignored: "call_not_found" });

  const repo = new VoiceSalesRepository();
  await repo.recordEvent({
    organizationId: call.organization_id,
    callId: call.id,
    provider: "twilio",
    providerEventId: `trial:${callSid}:${callStatus}:${params.get("Timestamp") || ""}`,
    eventType: `twilio.trial.${callStatus || "status"}`,
    payload: Object.fromEntries(params.entries()),
  });

  if (!["completed", "busy", "failed", "no-answer", "canceled"].includes(callStatus)) return NextResponse.json({ ok: true });
  if (call.state === "completed") return NextResponse.json({ ok: true, already_finalized: true });

  let leadId = call.lead_id as string | null;
  let customerId = call.customer_id as string | null;
  if (!leadId && !customerId) {
    const customerNumber = call.direction === "inbound" ? call.from_number : call.to_number;
    const identity = await repo.resolveIdentity(call.organization_id, customerNumber);
    leadId = identity.leadId;
    customerId = identity.customerId;
    if (leadId || customerId) {
      await repo.updateCall(call.id, call.organization_id, { lead_id: leadId, customer_id: customerId });
      await repo.updateSession(call.sales_session_id, call.organization_id, { lead_id: leadId, customer_id: customerId });
    }
  }

  const endedAt = new Date().toISOString();
  await repo.updateCall(call.id, call.organization_id, {
    state: callStatus === "completed" ? "speaking" : "failed",
    ended_at: endedAt,
    duration_seconds: Number.isFinite(durationSeconds) && durationSeconds >= 0 ? durationSeconds : null,
  });

  if (callStatus === "completed") {
    const qualification = salesQualificationSchema.parse(call.qualification ?? {});
    const { data: existingActivity } = leadId
      ? await admin.from("activities").select("id").eq("organization_id", call.organization_id).eq("lead_id", leadId).eq("type", "phone_ai_qualification").like("detail", `%[Telefon AI ${call.id}]%`).limit(1).maybeSingle()
      : { data: null };
    if (!existingActivity) {
      await finalizeCallIntelligence({
        organizationId: call.organization_id,
        callId: call.id,
        salesSessionId: call.sales_session_id,
        leadId,
        qualification,
      });
    }
    await repo.updateCall(call.id, call.organization_id, {
      state: "completed",
      duration_seconds: Number.isFinite(durationSeconds) && durationSeconds >= 0 ? durationSeconds : null,
      ended_at: endedAt,
    });
  }

  return NextResponse.json({ ok: true });
}
