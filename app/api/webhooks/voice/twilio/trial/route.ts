import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { salesQualificationSchema } from "@/server/services/sales-session/domain";
import { VoiceSalesRepository, orchestratePhoneTurn } from "@/server/services/voice-sales-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRIAL_WEBHOOK_PATH = "/api/webhooks/voice/twilio/trial";
const DEFAULT_PUBLIC_SITE = "https://flowsales-ai-six.vercel.app";
const TURKISH_TTS_VOICE = "Polly.Burcu-Neural";

function xmlEscape(value: string) {
  return value.replace(/[<>&'\"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char] ?? char);
}

function twiml(body: string, status = 200) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function say(text: string) {
  return `<Say language="tr-TR" voice="${TURKISH_TTS_VOICE}">${xmlEscape(text)}</Say>`;
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function getTrialSecret(request: Request) {
  return new URL(request.url).searchParams.get("secret")?.trim() || "";
}

function isTrustedTrialRequest(request: Request) {
  const expected = process.env.TWILIO_TRIAL_WEBHOOK_SECRET?.trim() || "";
  const supplied = getTrialSecret(request);
  return expected.length >= 32 && supplied.length >= 32 && safeEqual(expected, supplied);
}

function publicSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_PUBLIC_SITE).replace(/\/$/, "");
}

function trialAction(secret: string) {
  return `${publicSiteUrl()}${TRIAL_WEBHOOK_PATH}?secret=${encodeURIComponent(secret)}`;
}

function gather(text: string, secret: string) {
  return `<Gather input="speech" action="${xmlEscape(trialAction(secret))}" method="POST" language="tr-TR" speechTimeout="auto" actionOnEmptyResult="true">${say(text)}</Gather>`;
}

function normalizeNumber(value: string) {
  return value.replace(/[\s()-]/g, "");
}

async function resolveWorkspaceByTwilioNumber(from: string, to: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("voice_provider_connections")
    .select("organization_id,transfer_destination,settings")
    .eq("provider", "call_forwarding");
  if (error) throw new Error(`Voice connection lookup failed: ${error.message}`);

  const normalizedFrom = normalizeNumber(from);
  const normalizedTo = normalizeNumber(to);
  for (const row of data ?? []) {
    const settings = (row.settings ?? {}) as Record<string, unknown>;
    const destinationNumber = normalizeNumber(String(settings.destinationNumber ?? ""));
    if (!destinationNumber) continue;
    if (destinationNumber === normalizedTo) {
      return { connection: row, direction: "inbound" as const, customerNumber: from };
    }
    if (destinationNumber === normalizedFrom) {
      return { connection: row, direction: "outbound" as const, customerNumber: to };
    }
  }
  return null;
}

export async function POST(request: Request) {
  if (!isTrustedTrialRequest(request)) {
    return NextResponse.json({ error: "invalid_trial_secret" }, { status: 403 });
  }

  const secret = getTrialSecret(request);
  const raw = await request.text();
  const params = new URLSearchParams(raw);
  const callSid = params.get("CallSid")?.trim() || "";
  const from = params.get("From")?.trim() || "unknown";
  const to = params.get("To")?.trim() || "";
  const speech = params.get("SpeechResult")?.trim() || "";
  if (!callSid || !to) return twiml("<Hangup/>", 400);

  const resolved = await resolveWorkspaceByTwilioNumber(from, to);
  if (!resolved) {
    return twiml(`${say("Bu Twilio deneme numarası FlowSales çalışma alanına bağlı değil.")}<Hangup/>`, 404);
  }
  const { connection, direction, customerNumber } = resolved;

  const repo = new VoiceSalesRepository();
  try {
    let call = await repo.getCall(connection.organization_id, "twilio", callSid);
    if (!call) {
      const identity = await repo.resolveIdentity(connection.organization_id, customerNumber);
      const session = await repo.createSession({
        organizationId: connection.organization_id,
        channelSessionId: callSid,
        leadId: identity.leadId,
        customerId: identity.customerId,
      });
      call = await repo.createCall({
        organizationId: connection.organization_id,
        salesSessionId: session.id,
        provider: "twilio",
        providerCallId: callSid,
        direction,
        from,
        to,
        leadId: identity.leadId,
        customerId: identity.customerId,
      });
      await repo.updateCall(call.id, connection.organization_id, { state: "answered", answered_at: new Date().toISOString() });
      const greeting = "Merhaba, İZON Konteyner satış asistanına hoş geldiniz. Size nasıl yardımcı olabilirim?";
      await repo.appendTranscript({ organizationId: connection.organization_id, callId: call.id, salesSessionId: session.id, speaker: "assistant", text: greeting });
      return twiml(`${gather(greeting, secret)}${gather("Sizi duyamadım. Lütfen tekrar söyler misiniz?", secret)}`);
    }

    if (!speech) return twiml(`${gather("Sizi duyamadım. Lütfen tekrar söyler misiniz?", secret)}<Hangup/>`);

    await repo.appendTranscript({ organizationId: connection.organization_id, callId: call.id, salesSessionId: call.sales_session_id, speaker: "customer", text: speech });
    const lower = speech.toLocaleLowerCase("tr-TR");
    const transferDestination = String(connection.transfer_destination ?? "").trim();
    if (transferDestination && /temsilci|yetkili|insanla|satış danışmanı/.test(lower)) {
      await repo.appendTranscript({ organizationId: connection.organization_id, callId: call.id, salesSessionId: call.sales_session_id, speaker: "assistant", text: "Sizi satış temsilcimize aktarıyorum." });
      return twiml(`${say("Sizi satış temsilcimize aktarıyorum.")}<Dial>${xmlEscape(transferDestination)}</Dial>`);
    }

    const qualification = salesQualificationSchema.parse(call.qualification ?? {});
    const result = await orchestratePhoneTurn({
      organizationId: connection.organization_id,
      callId: call.id,
      salesSessionId: call.sales_session_id,
      transcript: speech,
      qualification,
    });
    const score = (await import("@/server/services/sales-session/phone-lead-score")).scorePhoneQualification(result.qualification).score;
    await repo.updateCall(call.id, connection.organization_id, { qualification: result.qualification, lead_score: score, state: "speaking" });
    await repo.appendTranscript({ organizationId: connection.organization_id, callId: call.id, salesSessionId: call.sales_session_id, speaker: "assistant", text: result.reply });
    return twiml(`${gather(result.reply, secret)}${gather("Başka nasıl yardımcı olabilirim?", secret)}`);
  } catch (error) {
    console.error("voice_twilio_trial_webhook_failed", error instanceof Error ? error.message : "unknown");
    return twiml(`${say("Şu anda işleminizi tamamlayamıyorum. Lütfen daha sonra tekrar deneyin.")}<Hangup/>`, 500);
  }
}
