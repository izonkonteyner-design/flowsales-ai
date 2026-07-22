import { NextRequest, NextResponse } from "next/server";
import { getRequiredSupabaseEnv } from "@/lib/supabase/env";

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

export async function GET(request: NextRequest) {
  // 1. Basic Liveness Probe (Public, Cheap, No DB)
  const env = getRequiredSupabaseEnv();
  if (!env.configured) {
    return jsonStatus("error", 503);
  }

  const authHeader = request.headers.get("authorization") || request.headers.get("x-health-secret");
  const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // 2. Deep DB Probe (Protected, Requires Secret)
  if (authHeader && secretKey && authHeader === `Bearer ${secretKey}`) {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(env.url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data, error } = await client.rpc("health_check");
    if (error || data !== true) {
      return jsonStatus("error", 503);
    }
    return jsonStatus("ok", 200);
  }

  // Without secret, just return liveness ok
  return jsonStatus("ok", 200);
}
