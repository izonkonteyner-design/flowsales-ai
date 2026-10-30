/**
 * FlowSales AI — Persistent Orchestration Worker Process
 *
 * Docker, PM2 veya bağımsız container ortamlarında sürekli çalışan arka plan işçi süreci.
 * Çalıştırma: bun scripts/run-orchestration-worker.ts
 */

import { createClient } from "@supabase/supabase-js";
import { runOrchestrationWorkerBatch } from "../server/services/orchestration/worker";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("HATA: SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY tanımlanmalıdır.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);
const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS || 15000);

let isRunning = true;

async function startWorkerLoop() {
  console.log(`[Worker] FlowSales AI Otonom Çoklu Ajan İşçisi Başlatıldı. Polling: ${POLL_INTERVAL_MS}ms`);

  while (isRunning) {
    try {
      const result = await runOrchestrationWorkerBatch(supabase, {
        maxBatchSize: 20,
        leaseTimeoutMs: 5 * 60 * 1000,
      });

      if (result.claimedCount > 0 || result.recoveredCount > 0 || result.scheduledWorkflowsTriggered > 0) {
        console.log(
          `[Worker ${new Date().toISOString()}] İşlenen: ${result.claimedCount}, Tamamlanan: ${result.completedCount}, Kurtarılan: ${result.recoveredCount}, Onay Bekleyen: ${result.waitingApprovalCount}, Süre: ${result.durationMs}ms`
        );
      }
    } catch (err: unknown) {
      console.error(`[Worker Hatası]`, err instanceof Error ? err.message : err);
    }

    // Bekle
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  console.log("[Worker] İşçi süreci kapatıldı.");
}

process.on("SIGINT", () => {
  console.log("\n[Worker] Kapatma sinyali (SIGINT) alındı...");
  isRunning = false;
});

process.on("SIGTERM", () => {
  console.log("\n[Worker] Kapatma sinyali (SIGTERM) alındı...");
  isRunning = false;
});

startWorkerLoop().catch((err) => {
  console.error("Worker başlatma hatası:", err);
  process.exit(1);
});
