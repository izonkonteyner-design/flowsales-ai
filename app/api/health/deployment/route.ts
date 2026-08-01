import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import {
  getDeploymentEnvironmentStatus,
  normalizeDeploymentDatabaseStatus,
} from "@/server/services/deployment-readiness";
import {
  allowInternalHealthProbe,
  isAuthorizedInternalHealthProbe,
} from "@/server/services/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(body: Record<string, unknown>, status: number) {
  const result = NextResponse.json(body, { status });
  result.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  result.headers.set("Pragma", "no-cache");
  result.headers.set("Vary", "Authorization, X-Health-Check-Secret");
  result.headers.set("X-Robots-Tag", "noindex, nofollow");
  return result;
}

export async function GET(request: NextRequest) {
  const secret = process.env.HEALTH_CHECK_SECRET?.trim();
  if (!secret || !isAuthorizedInternalHealthProbe(request, secret)) {
    return response({ status: "error" }, 404);
  }

  const rateLimit = allowInternalHealthProbe(request);
  if (!rateLimit.allowed) {
    const result = response({ status: "degraded" }, 429);
    result.headers.set("Retry-After", String(rateLimit.retryAfterSeconds ?? 60));
    return result;
  }

  const environment = getDeploymentEnvironmentStatus();
  let database = null;

  try {
    const client = createSupabaseAdminClient();
    const { data, error } = await client.rpc("deployment_readiness");
    if (!error) database = normalizeDeploymentDatabaseStatus(data);
  } catch {
    database = null;
  }

  const ready = environment.ready && database?.ready === true;

  return response(
    {
      status: ready ? "ok" : "error",
      checks: {
        environment,
        database:
          database ?? {
            ready: false,
            latestMigration: null,
            requiredMigration: "0022",
            missingFunctions: [],
            missingTables: [],
            unavailable: true,
          },
      },
    },
    ready ? 200 : 503,
  );
}
