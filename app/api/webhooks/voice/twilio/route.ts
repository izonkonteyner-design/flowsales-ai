import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { salesQualificationSchema } from "@/server/services/sales-session/domain";
import { VoiceSalesRepository, orchestratePhoneTurn } from "@/server/services/voice-sales-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEBHOOK_PATH = "/api/webhooks/voice/twilio";
const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

function xmlEscape(value: string) {
  return value.replace(/[<>&'\"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char] ?? char);
}

function twiml(body: string, status = 200) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function gather(text: string) {
  return `<Gather input="speech" action="${WEBHOOK_PATH}" method="POST" language="tr-TR" speechTimeout="auto" actionOnEmptyResult="true"><Say language="tr-TR">${xmlEscape(text)}</Say></Gather>`;
}

function requestUrls(request: Request) {
  const parsed = new URL(request.url);
  const urls = new Set<string>([request.url]);
  const forwardedHost = request.headers.get("x-forwarded-host")?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();
  const proto = request.headers.get("x-forwarded-proto")?.trim() || "https";
  if (host) urls.add(`${proto}://${host}${parsed.pathname}${parsed.search}`);

  const publicSite = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (publicSite) urls.add(`${publicSite}${parsed.pathname}${parsed.search}`);
  return Array.from(urls);
}

function verifyTwilioSignature(request: Request, params: URLSearchParams) {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const signature = request.headers.get("x-twilio-signature")?.trim();
  if (!authToken || !signature) return false;

  const pairs = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b));
  const right = Buffer.from(signature);
  for (const url of requestUrls(request)) {
    let signed = url;
    for (const [key, value] of pairs) signed += `${key}${value}`;
    const expected = crypto.createHmac("sha1", authToken).update(signed).digest("base64");
    const left = Buffer.from(expected);
    if (left.length === right.length && crypto.timingSafeEqual(left, right)) return true;
  }
  return false;
}

function normalizeNumber(value: string) {
  return value.replace(/[\s()-]/g, "");
}

async function verifyTwilioCallResource(params: URLSearchParams) {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const accountSid = params.get("AccountSid")?.trim() || "";
  const callSid = params.get("CallSid")?.trim() || "";
  const from = normalizeNumber(params.get("From")?.trim() || "");
  const to = normalizeNumber(params.get("To")?.trim() || "");
  if (!authToken || !/^AC[0-9a-fA-F]{32}$/.test(accountSid) || !/^CA[0-9a-fA-F]{32}$/.test(callSid)) return false;

  const response = await fetch(`${TWILIO_API_BASE}/Accounts/${encodeURIComponent(accountSid)}/Calls/${encodeURIComponent(callSid)}.json`, {
    method: "GET",
    headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}` },
    cache: "no-store",
    signal: AbortSignal.timeout(3500),
  });
  if (!response.ok) return false;

  const call = (await response.json()) as { sid?: string; account_sid?: string; from?: string; to?: string };
  if (call.sid !== callSid || call.account_sid !== accountSid) return false;
  return normalizeNumber(String(call.from ?? "")) === from && normalizeNumber(String(call.to ?? "")) === to;
}

async function isTrustedTwilioRequest(request: Request, params: URLSearchParams) {
  if (verifyTwilioSignature(request, params)) return true;
  try {
    return await verifyTwilioCallResource(params);
  } catch (error) {
    console.warn("voice_twilio_rest_verification_failed", error instanceof Error ? error.message : "unknown");
    return false;
  }
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
      return { connection: row, direction: "inbound" as const, customerNumber: from, providerNumber: to };
    }
    if (destinationNumber === normalizedFrom) {
      return { connection: row, direction: "outbound" as const, customerNumber: to, providerNumber: from };
    }
  }
  return null;
}

export async function POST(request: Request) {
  const raw = await request.text();
  const params = new URLSearchParams(raw);
  if (!(await isTrustedTwilioRequest(request, params))) return NextResponse.json({ error: "invalid_twilio_request" }, { status: 403 });

  const callSid = params.get("CallSid")?.trim() || "";
  const from = params.get("From")?.trim() || "unknown";
  const to = params.get("To")?.trim() || "";
  const speech = params.get("SpeechResult")?.trim() || "";
  if (!callSid || !to) return twiml("<Hangup/>", 400);

  const resolved = await resolveWorkspaceByTwilioNumber(from, to);
  if (!resolved) return twiml('<Say language="tr-TR">Bu Twilio numarası FlowSales çalışma alanına bağlı değil.</Say><Hangup/>', 404);
  const { connection, direction, customerNumber } = resolved;

  const repo = new VoiceSalesRepository();
  try {
    let call = await repo.getCall(connection.organization_id, "twilio", callSid);
    if (!call) {
      const identity = await repo.resolveIdentity(connection.organization_id, customerNumber);
      const session = await repo.createSession({ organizationId: connection.organization_id, channelSessionId: callSid, leadId: identity.leadId, customerId: identity.customerId });
      call = await repo.createCall({ organizationId: connection.organization_id, salesSessionId: session.id, provider: "twilio", providerCallId: callSid, direction, from, to, leadId: identity.leadId, customerId: identity.customerId });
      await repo.updateCall(call.id, connection.organization_id, { state: "answered", answered_at: new Date().toISOString() });
      const greeting = "Merhaba, İZON Konteyner satış asistanına hoş geldiniz. Size nasıl yardımcı olabilirim?";
      await repo.appendTranscript({ organizationId: connection.organization_id, callId: call.id, salesSessionId: session.id, speaker: "assistant", text: greeting });
      return twiml(`${gather(greeting)}${gather("Sizi duyamadım. Lütfen tekrar söyler misiniz?")}`);
    }

    if (!speech) return twiml(`${gather("Sizi duyamadım. Lütfen tekrar söyler misiniz?")}<Hangup/>`);

    await repo.appendTranscript({ organizationId: connection.organization_id, callId: call.id, salesSessionId: call.sales_session_id, speaker: "customer", text: speech });
    const lower = speech.toLocaleLowerCase("tr-TR");
    const transferDestination = String(connection.transfer_destination ?? "").trim();
    if (transferDestination && /temsilci|yetkili|insanla|satış danışmanı/.test(lower)) {
      await repo.appendTranscript({ organizationId: connection.organization_id, callId: call.id, salesSessionId: call.sales_session_id, speaker: "assistant", text: "Sizi satış temsilcimize aktarıyorum." });
      return twiml(`<Say language="tr-TR">Sizi satış temsilcimize aktarıyorum.</Say><Dial>${xmlEscape(transferDestination)}</Dial>`);
    }

    const qualification = salesQualificationSchema.parse(call.qualification ?? {});
    const result = await orchestratePhoneTurn({ organizationId: connection.organization_id, callId: call.id, salesSessionId: call.sales_session_id, transcript: speech, qualification });
    const score = (await import("@/server/services/sales-session/phone-lead-score")).scorePhoneQualification(result.qualification).score;
    await repo.updateCall(call.id, connection.organization_id, { qualification: result.qualification, lead_score: score, state: "speaking" });
    await repo.appendTranscript({ organizationId: connection.organization_id, callId: call.id, salesSessionId: call.sales_session_id, speaker: "assistant", text: result.reply });
    return twiml(`${gather(result.reply)}${gather("Başka nasıl yardımcı olabilirim?")}`);
  } catch (error) {
    console.error("voice_twilio_webhook_failed", error instanceof Error ? error.message : "unknown");
    return twiml('<Say language="tr-TR">Şu anda işleminizi tamamlayamıyorum. Lütfen daha sonra tekrar deneyin.</Say><Hangup/>', 500);
  }
}
