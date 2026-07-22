import crypto from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getRequiredSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const HEALTH_LIMIT_WINDOW_MS = 60_000;
const HEALTH_LIMIT_MAX_REQUESTS = 20;

type HealthBucket = {
  count: number;
  resetAt: number;
};

const healthBuckets = new Map<string, HealthBucket>();

function getClientBucketKey(request: NextRequest) {
  const forwarded = request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
  const source = forwarded.split(",")[0]?.trim() || "unknown";
  return crypto.createHash("sha256").update(source).digest("hex");
}

function pruneExpiredHealthBuckets(now: number) {
  for (const [key, bucket] of healthBuckets.entries()) {
    if (bucket.resetAt <= now) {
      healthBuckets.delete(key);
    }
  }
}

function allowHealthRequest(request: NextRequest) {
  const key = getClientBucketKey(request);
  const now = Date.now();
  pruneExpiredHealthBuckets(now);
  const bucket = healthBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    healthBuckets.set(key, {
      count: 1,
      resetAt: now + HEALTH_LIMIT_WINDOW_MS,
    });
    return true;
  }

  bucket.count += 1;
  healthBuckets.set(key, bucket);
  return bucket.count <= HEALTH_LIMIT_MAX_REQUESTS;
}

function setNoStoreHeaders(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Vary", "Authorization, Cookie");
  return response;
}

function jsonStatus(status: "ok" | "degraded" | "error", httpStatus = 200) {
  return setNoStoreHeaders(
    NextResponse.json(
      {
        status,
      },
      { status: httpStatus },
    ),
  );
}

export async function GET(request: NextRequest) {
  if (!allowHealthRequest(request)) {
    return jsonStatus("degraded", 429);
  }

  const env = getRequiredSupabaseEnv();
  if (!env.configured) {
    return jsonStatus("error", 503);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    return jsonStatus("error", 503);
  }

  const { data, error } = await client.rpc("health_check");
  if (error || data !== true) {
    return jsonStatus("error", 503);
  }

  return jsonStatus("ok", 200);
}
