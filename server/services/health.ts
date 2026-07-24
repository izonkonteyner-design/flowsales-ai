import crypto from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

export type HealthStatus = "ok" | "degraded" | "error";

const INTERNAL_HEALTH_WINDOW_MS = 60_000;
const INTERNAL_HEALTH_MAX_ATTEMPTS = 5;
const internalHealthBuckets = new Map<string, { count: number; resetAt: number }>();

function setResponseHeaders(response: NextResponse, cacheControl: string) {
  response.headers.set("Cache-Control", cacheControl);
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Vary", "Authorization, Cookie, X-Health-Check-Secret");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export function createHealthResponse(status: HealthStatus, httpStatus: number, cacheControl: string) {
  return setResponseHeaders(NextResponse.json({ status }, { status: httpStatus }), cacheControl);
}

export function createPublicHealthResponse() {
  return createHealthResponse("ok", 200, "public, max-age=0, s-maxage=30, stale-while-revalidate=300");
}

export function createInternalHealthResponse(status: HealthStatus, httpStatus: number) {
  return createHealthResponse(status, httpStatus, "no-store, max-age=0, must-revalidate");
}

function safeHeaderValue(request: NextRequest, name: string) {
  return request.headers.get(name)?.trim() || null;
}

function timingSafeCompare(a: string | undefined | null, b: string | undefined | null) {
  if (!a || !b) return false;

  try {
    const bufferA = Buffer.from(a, "utf-8");
    const bufferB = Buffer.from(b, "utf-8");
    if (bufferA.length !== bufferB.length) return false;
    return crypto.timingSafeEqual(bufferA, bufferB);
  } catch {
    return false;
  }
}

export function extractInternalHealthSecret(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const customHeader = request.headers.get("x-health-check-secret");

  return bearerToken || customHeader;
}

export function isAuthorizedInternalHealthProbe(request: NextRequest, expectedSecret: string | undefined | null) {
  const providedSecret = extractInternalHealthSecret(request);
  return timingSafeCompare(providedSecret, expectedSecret);
}

export function allowInternalHealthProbe(request: NextRequest) {
  const forwardedFor =
    safeHeaderValue(request, "x-vercel-forwarded-for") ||
    safeHeaderValue(request, "x-forwarded-for") ||
    safeHeaderValue(request, "x-real-ip") ||
    "unknown";

  const identity = crypto.createHash("sha256").update(forwardedFor).digest("hex");
  const now = Date.now();
  const bucket = internalHealthBuckets.get(identity);

  if (!bucket || bucket.resetAt <= now) {
    internalHealthBuckets.set(identity, {
      count: 1,
      resetAt: now + INTERNAL_HEALTH_WINDOW_MS,
    });

    return { allowed: true as const };
  }

  if (bucket.count >= INTERNAL_HEALTH_MAX_ATTEMPTS) {
    return {
      allowed: false as const,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return { allowed: true as const };
}

export function resetInternalHealthRateLimitForTests() {
  internalHealthBuckets.clear();
}

export function isHealthProbeHealthy(result: unknown) {
  return result === true;
}

export async function handleInternalHealthProbe(
  request: NextRequest,
  probeHealth: () => Promise<boolean | null>,
  expectedSecret = process.env.HEALTH_CHECK_SECRET?.trim(),
) {
  if (!expectedSecret || !isAuthorizedInternalHealthProbe(request, expectedSecret)) {
    return createInternalHealthResponse("error", 404);
  }

  const rateLimit = allowInternalHealthProbe(request);
  if (!rateLimit.allowed) {
    const response = createInternalHealthResponse("degraded", 429);
    response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds ?? 60));
    return response;
  }

  try {
    const healthy = await probeHealth();
    if (healthy === null) {
      return createInternalHealthResponse("error", 503);
    }

    return createInternalHealthResponse(healthy ? "ok" : "error", healthy ? 200 : 503);
  } catch {
    return createInternalHealthResponse("error", 503);
  }
}
