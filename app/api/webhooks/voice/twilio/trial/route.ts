import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { salesQualificationSchema } from "@/server/services/sales-session/domain";
import { VoiceSalesRepository, orchestratePhoneTurn, recommendProductsV2 } from "@/server/services/voice-sales-v1";

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

function normalizeSpeechForSales(value: string) {
  return value
    .replace(/(\d{2,3})\s*metre\s*kare/gi, "$1 metrekare")
    .replace(/(\d{2,3})\s*metrekaresi/gi, "$1 metrekare")
    .replace(/\s+/g, " ")
    .trim();
}

function extractAreaM2(value: string) {
  const match = value.match(/(\d{2,3})\s*(?:m2|m²|metrekare|metre\s*kare)/i);
  return match ? Number(match[1]) : undefined;
}

function extractRoomCount(value: string) {
  const match = value.match(/(\d\s*\+\s*\d)/);
  return match ? match[1].replace(/\s/g, "") : undefined;
}

function productKeyword(lower: string) {
  if (/tiny\s*house/.test(lower)) return "tiny house";
  if (/prefabrik/.test(lower)) return "prefabrik";
  if (/konteyner/.test(lower)) return "konteyner";
  return undefined;
}

function compactProductText(value: string | null | undefined, maxLength = 180) {
  const clean = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length <= maxLength ? clean : `${clean.slice(0, maxLength).replace(/\s+\S*$/, "")}…`;
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

    const normalizedSpeech = normalizeSpeechForSales(speech);
    await repo.appendTranscript({ organizationId: connection.organization_id, callId: call.id, salesSessionId: call.sales_session_id, speaker: "customer", text: speech });
    const lower = normalizedSpeech.toLocaleLowerCase("tr-TR");
    const transferDestination = String(connection.transfer_destination ?? "").trim();
    if (transferDestination && /temsilci|yetkili|insanla|satış danışmanı/.test(lower)) {
      await repo.appendTranscript({ organizationId: connection.organization_id, callId: call.id, salesSessionId: call.sales_session_id, speaker: "assistant", text: "Sizi satış temsilcimize aktarıyorum." });
      return twiml(`${say("Sizi satış temsilcimize aktarıyorum.")}<Dial>${xmlEscape(transferDestination)}</Dial>`);
    }

    const qualification = salesQualificationSchema.parse(call.qualification ?? {});
    const pricingQuestion = /fiyat|ne kadar|kaç para/.test(lower);
    const productQuestion = /konteyner|prefabrik|tiny\s*house|ürün|model|metrekare|m2|m²|metre\s*kare|oda/.test(lower);

    if (productQuestion && !pricingQuestion) {
      const areaM2 = extractAreaM2(normalizedSpeech) ?? qualification.areaM2 ?? undefined;
      const roomCount = extractRoomCount(normalizedSpeech) ?? qualification.roomCount ?? undefined;
      const keyword = productKeyword(lower);
      const matches = await recommendProductsV2({
        organizationId: connection.organization_id,
        areaM2,
        roomCount,
        query: areaM2 || roomCount ? undefined : keyword,
        budget: qualification.budget,
        limit: 1,
      });

      if (matches.length) {
        const product = matches[0].product;
        const description = compactProductText(product.description);
        const features = product.features.slice(0, 3).map((item) => compactProductText(item, 70)).filter(Boolean);
        const details = [
          product.areaM2 !== null ? `${product.areaM2} metrekare` : "",
          description,
          features.length ? `Öne çıkan özellikleri ${features.join(", ")}.` : "",
        ].filter(Boolean).join(". ");
        qualification.productInterest = product.name;
        if (product.areaM2 !== null) qualification.areaM2 = product.areaM2;
        const reply = `${product.name} için kataloğumuzdaki doğrulanmış bilgi şu şekilde: ${details || "ürün aktif kataloğumuzda yer alıyor."} Teslimat yapılacak il veya ilçeyi söyler misiniz?`;
        await repo.updateSession(call.sales_session_id, connection.organization_id, { qualification, referenced_product_ids: [product.id] });
        await repo.updateCall(call.id, connection.organization_id, { qualification, state: "speaking" });
        await repo.appendTranscript({ organizationId: connection.organization_id, callId: call.id, salesSessionId: call.sales_session_id, speaker: "assistant", text: reply });
        return twiml(`${gather(reply, secret)}${gather("Teslimat yapılacak il veya ilçeyi söyleyebilirsiniz.", secret)}`);
      }

      const requested = areaM2 ? `${areaM2} metrekare` : keyword ?? "bu ürün tipi";
      const reply = `${requested} için aktif kataloğumuzda doğrulanmış birebir bir ürün kaydı bulamadım. Size yanlış bilgi vermemek için tek bir ayrıntı sorayım: istediğiniz oda düzeni nedir?`;
      await repo.appendTranscript({ organizationId: connection.organization_id, callId: call.id, salesSessionId: call.sales_session_id, speaker: "assistant", text: reply });
      return twiml(`${gather(reply, secret)}${gather("Örneğin bir artı bir veya iki ayrı oda diyebilirsiniz.", secret)}`);
    }

    const result = await orchestratePhoneTurn({
      organizationId: connection.organization_id,
      callId: call.id,
      salesSessionId: call.sales_session_id,
      transcript: normalizedSpeech,
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
