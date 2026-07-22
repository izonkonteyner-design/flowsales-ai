import { NextRequest, NextResponse } from "next/server";
import { getRequiredSupabaseEnv } from "@/lib/supabase/env";
import crypto from "node:crypto";

function setNoStoreHeaders(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Vary", "Authorization, Cookie");
  return response;
}

function jsonStatus(status: "ok" | "degraded" | "error", httpStatus = 200) {
  return setNoStoreHeaders(
    NextResponse.json(
      { status },
      { status: httpStatus }
    )
  );
}

function timingSafeCompare(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  try {
    const bufferA = Buffer.from(a, 'utf-8');
    const bufferB = Buffer.from(b, 'utf-8');
    if (bufferA.length !== bufferB.length) return false;
    return crypto.timingSafeEqual(bufferA, bufferB);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  // 1. Basic Liveness Probe (Public, Cheap, No DB)
  const env = getRequiredSupabaseEnv();
  if (!env.configured) {
    return jsonStatus("error", 503);
  }

  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
  const customHeader = request.headers.get("x-health-check-secret");
  
  const providedSecret = bearerToken || customHeader;
  const expectedSecret = process.env.HEALTH_CHECK_SECRET;

  // 2. Deep DB Probe (Protected, Requires Secret)
  if (providedSecret && expectedSecret && timingSafeCompare(providedSecret, expectedSecret)) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return jsonStatus("error", 503);
    }
    
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(env.url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data, error } = await client.rpc("health_check");
    if (error || data !== true) {
      return jsonStatus("error", 503);
    }
    return jsonStatus("ok", 200);
  }

  // Without secret or with invalid secret, just return liveness ok (Do not reveal invalid auth status)
  return jsonStatus("ok", 200);
}
