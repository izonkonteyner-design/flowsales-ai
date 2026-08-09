import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { handleMetaMessagingWebhook } from "@/server/services/integrations/meta-messaging";
import { checkRateLimit, DistributedRateLimitUnavailableError } from "@/server/services/integrations/rate-limiter";
import { logger } from "@/lib/logger";

function secrets() {
  return [
    process.env.META_APP_SECRET?.trim(),
    process.env.META_CLIENT_SECRET?.trim(),
    process.env.INSTAGRAM_APP_SECRET?.trim(),
    process.env.META_INSTAGRAM_APP_SECRET?.trim(),
  ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
}

function hasValidSignature(rawBody: string, signature: string | null) {
  if (!signature?.startsWith("sha256=")) return false;
  const supplied = signature.slice(7);

  return secrets().some((appSecret) => {
    const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
    return supplied.length === expected.length
      && crypto.timingSafeEqual(Buffer.from(supplied, "utf8"), Buffer.from(expected, "utf8"));
  });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge") || "";
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();
  if (mode === "subscribe" && expected && token === expected) {
    logger.info("meta_messaging_webhook.verify_success");
    return new Response(challenge, { status: 200 });
  }
  logger.warn("meta_messaging_webhook.verify_failed");
  return Response.json({ error: "forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown_ip";
  try {
    const rate = await checkRateLimit(ip, "meta_messaging_webhook_post", 100, 60_000);
    if (!rate.allowed) return Response.json({ error: "rate_limit_exceeded" }, { status: 429 });
  } catch (error) {
    if (error instanceof DistributedRateLimitUnavailableError) return Response.json({ error: "rate_limit_unavailable" }, { status: 503 });
    throw error;
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!hasValidSignature(rawBody, signature)) {
    logger.warn("meta_messaging_webhook.invalid_signature", { configuredSecrets: secrets().length });
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(rawBody) as Record<string, unknown>; }
  catch {
    logger.warn("meta_messaging_webhook.invalid_json");
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const object = typeof payload.object === "string" ? payload.object : "unknown";
  const entryCount = Array.isArray(payload.entry) ? payload.entry.length : 0;
  logger.info("meta_messaging_webhook.accepted", { object, entryCount });
  return handleMetaMessagingWebhook(payload);
}
