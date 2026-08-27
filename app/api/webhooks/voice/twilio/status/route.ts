import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { salesQualificationSchema } from "@/server/services/sales-session/domain";
import { VoiceSalesRepository, finalizeCallIntelligence } from "@/server/services/voice-sales-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

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

async function verifyTwilioCallResource(params: URLSearchParams) {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const accountSid = params.get("AccountSid")?.trim() || "";
  const callSid = params.get("CallSid")?.trim() || "";
  if (!authToken || !/^AC[0-9a-fA-F]{32}$/.test(accountSid) || !/^CA[0-9a-fA-F]{32}$/.test(callSid)) return false;
  const response = await fetch(`${TWILIO_API_BASE}/Accounts/${encodeURIComponent(accountSid)}/Calls/${encodeURIComponent(callSid)}.json`, {
    headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}` },
    cache: "no-store",
    signal: AbortSignal.timeout(3500),
  });
  if (!response.ok) return false;
  const call = (await response.json()) as { sid?: string; account_sid?: string };
  return call.sid === callSid && call.account_sid === accountSid;
}

export async function POST(request: Request) {
  const raw = await request.text();
  const params = new URLSearchParams(raw);
  const trusted = verifyTwilioSignature(request, params) || await verifyTwilioCallResource(params).catch(() => false);
  if (!trusted) return NextResponse.json({ error: "invalid_twilio_request" }, { status: 403 });

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
    providerEventId: `${callSid}:${callStatus}:${params.get("Timestamp") || ""}`,
    eventType: `twilio.${callStatus || "status"}`,
    payload: Object.fromEntries(params.entries()),
  });

  if (["completed", "busy", "failed", "no-answer", "canceled"].includes(callStatus)) {
    if (call.state !== "completed") {
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
        } else {
          const scoreResult = (await import("@/server/services/sales-session/phone-lead-score")).scorePhoneQualification(qualification);
          await repo.updateCall(call.id, call.organization_id, {
            qualification,
            lead_score: scoreResult.score,
            temperature: scoreResult.score >= 70 ? "hot" : scoreResult.score >= 40 ? "warm" : "cold",
            state: "completed",
            ended_at: endedAt,
          });
        }
        if (Number.isFinite(durationSeconds) && durationSeconds >= 0) {
          await repo.updateCall(call.id, call.organization_id, { duration_seconds: durationSeconds, ended_at: endedAt, state: "completed" });
        }
      }
    }
  } else if (["ringing", "in-progress", "answered"].includes(callStatus)) {
    await repo.updateCall(call.id, call.organization_id, {
      state: callStatus === "ringing" ? "ringing" : "speaking",
      ...(callStatus === "ringing" ? {} : { answered_at: new Date().toISOString() }),
    });
  }

  return NextResponse.json({ ok: true });
}
