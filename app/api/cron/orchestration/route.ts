import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { runOrchestrationWorkerBatch } from "@/server/services/orchestration/worker";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60 seconds bounded execution for serverless

export async function GET(request: NextRequest) {
  // Cron kimlik doğrulaması: Bearer CRON_SECRET zorunludur
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logger.warn("cron.orchestration.unauthorized_attempt");
    return NextResponse.json({ success: false, error: "Unauthorized cron trigger" }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const batchResult = await runOrchestrationWorkerBatch(supabase, {
      maxBatchSize: 25,
      leaseTimeoutMs: 5 * 60 * 1000,
    });

    logger.info("cron.orchestration.completed", {
      workerRunId: batchResult.workerRunId,
      claimed: batchResult.claimedCount,
      completed: batchResult.completedCount,
      recovered: batchResult.recoveredCount,
      durationMs: batchResult.durationMs,
    });

    return NextResponse.json({
      success: true,
      batchResult,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Worker execution failed";
    logger.error("cron.orchestration.failed", { error: errorMessage });
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
