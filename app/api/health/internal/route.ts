import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

import { getRequiredSupabaseEnv } from "@/lib/supabase/env";
import {
  handleInternalHealthProbe,
  isHealthProbeHealthy,
} from "@/server/services/health";

async function probeSupabaseHealth() {
  const env = getRequiredSupabaseEnv();
  if (!env.configured) {
    return null;
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) {
    return null;
  }

  const client = createClient(env.url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.rpc("health_check");
  if (error) {
    return false;
  }

  return isHealthProbeHealthy(data);
}

export async function GET(request: NextRequest) {
  return handleInternalHealthProbe(request, probeSupabaseHealth);
}
