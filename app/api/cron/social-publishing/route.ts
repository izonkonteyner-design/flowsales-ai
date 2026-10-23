import "server-only";

import * as crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import {
  publishSocialPostToMeta,
  calculateNextSocialRetryAt,
  type MetaPublishPostInput,
  type MetaPublishOptions,
  type MetaPublishResult,
} from "@/server/services/integrations/social-publisher";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type SocialCronWorkerDeps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient?: any;
  publishFn?: (
    post: MetaPublishPostInput,
    token?: string,
    options?: MetaPublishOptions,
  ) => Promise<MetaPublishResult>;
  batchSize?: number;
  workerRunId?: string;
  publishingEnabled?: boolean;
};

export type SocialCronWorkerSummary = {
  success: boolean;
  disabled?: boolean;
  workerRunId: string;
  evaluated: number;
  processed: number;
  failed: number;
  skipped: number;
  error?: string;
};

export function isSocialPublishingEnabled(override?: boolean): boolean {
  if (typeof override === "boolean") {
    return override;
  }
  return process.env.SOCIAL_PUBLISHING_ENABLED?.trim().toLowerCase() === "true";
}

/**
 * Executes a single atomic social publishing worker cycle.
 * Fails closed when SOCIAL_PUBLISHING_ENABLED is not explicitly "true".
 * Requires the database `claim_due_social_posts` RPC (FOR UPDATE SKIP LOCKED).
 * Never falls back to non-atomic table scans.
 */
export async function runSocialPublishingWorkerCycle(
  deps: SocialCronWorkerDeps = {},
): Promise<{ status: number; body: SocialCronWorkerSummary }> {
  const workerRunId = deps.workerRunId ?? crypto.randomUUID();

  if (!isSocialPublishingEnabled(deps.publishingEnabled)) {
    logger.info("social_cron.publishing_disabled", {
      workerRunId,
      SOCIAL_PUBLISHING_ENABLED: process.env.SOCIAL_PUBLISHING_ENABLED ?? "false",
    });
    return {
      status: 503,
      body: {
        success: false,
        disabled: true,
        workerRunId,
        evaluated: 0,
        processed: 0,
        failed: 0,
        skipped: 0,
        error: "Social publishing is disabled (SOCIAL_PUBLISHING_ENABLED=false).",
      },
    };
  }

  const admin = deps.adminClient ?? createSupabaseAdminClient();
  const publishFn = deps.publishFn ?? publishSocialPostToMeta;
  const batchSize = deps.batchSize ?? 20;
  const now = new Date().toISOString();

  // Strictly require atomic claiming via claim_due_social_posts RPC.
  // No non-atomic SELECT fallback is permitted.
  const { data: claimedRows, error: rpcError } = await admin.rpc("claim_due_social_posts", {
    batch_size: batchSize,
  });

  if (rpcError || !Array.isArray(claimedRows)) {
    const errorMessage = rpcError?.message || "Atomic queue claiming (claim_due_social_posts) failed.";
    logger.error("social_cron.atomic_claim_failed", {
      workerRunId,
      error: errorMessage,
    });
    return {
      status: 500,
      body: {
        success: false,
        workerRunId,
        evaluated: 0,
        processed: 0,
        failed: 0,
        skipped: 0,
        error: errorMessage,
      },
    };
  }

  if (claimedRows.length === 0) {
    return {
      status: 200,
      body: {
        success: true,
        workerRunId,
        evaluated: 0,
        processed: 0,
        failed: 0,
        skipped: 0,
      },
    };
  }

  // Load associated social_posts records for the atomically claimed queue items
  const postIds = Array.from(
    new Set(
      claimedRows
        .map((r: Record<string, unknown>) => String(r.post_id || "").trim())
        .filter(Boolean),
    ),
  );

  const { data: postsData, error: postsError } = postIds.length
    ? await admin.from("social_posts").select("*").in("id", postIds)
    : { data: [], error: null };

  if (postsError) {
    logger.error("social_cron.posts_lookup_failed", {
      workerRunId,
      error: postsError.message,
    });
    return {
      status: 500,
      body: {
        success: false,
        workerRunId,
        evaluated: claimedRows.length,
        processed: 0,
        failed: 0,
        skipped: 0,
        error: `Failed to load social_posts for claimed queue items: ${postsError.message}`,
      },
    };
  }

  const postMap = new Map<string, Record<string, unknown>>(
    (postsData || []).map((p: Record<string, unknown>) => [String(p.id), p]),
  );

  let processedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const seenQueueIds = new Set<string>();

  for (const item of claimedRows as Array<Record<string, unknown>>) {
    const queueId = String(item.id || "").trim();
    const postId = String(item.post_id || "").trim();

    if (!queueId || seenQueueIds.has(queueId)) {
      skippedCount++;
      continue;
    }
    seenQueueIds.add(queueId);

    // Require explicit 'processing' state ownership from atomic claim
    if (item.status !== "processing") {
      skippedCount++;
      continue;
    }

    const currentAttempts = Math.max(1, Number(item.attempts || 1));
    const maxAttempts = Math.max(1, Number(item.max_attempts || 3));
    const existingExternalId =
      typeof item.published_external_id === "string" ? item.published_external_id.trim() : "";

    try {
      // Idempotency guard: if external publication ID already exists on queue item,
      // finalize to 'completed' without invoking external API.
      if (existingExternalId) {
        await admin
          .from("social_publishing_queue")
          .update({
            status: "completed",
            processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", queueId)
          .eq("status", "processing");
        skippedCount++;
        continue;
      }

      const postObj = postMap.get(postId);
      if (!postObj) {
        await admin
          .from("social_publishing_queue")
          .update({
            status: "failed",
            last_error: `Referenced social_post (${postId}) not found [worker=${workerRunId}]`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", queueId)
          .eq("status", "processing");
        failedCount++;
        continue;
      }

      const queueOrgId = String(item.organization_id || "").trim();
      const postOrgId = String(postObj.organization_id || postObj.workspace_id || "").trim();

      // Enforce strict tenant match between queue item and parent social_post
      if (!queueOrgId || !postOrgId || queueOrgId !== postOrgId) {
        await admin
          .from("social_publishing_queue")
          .update({
            status: "failed",
            last_error: `Tenant ownership mismatch between queue item and post [worker=${workerRunId}]`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", queueId)
          .eq("status", "processing");
        failedCount++;
        continue;
      }

      // If parent post was cancelled, cancel the queue item without publishing
      if (postObj.status === "cancelled") {
        await admin
          .from("social_publishing_queue")
          .update({
            status: "cancelled",
            last_error: "Parent social post was cancelled.",
            updated_at: new Date().toISOString(),
          })
          .eq("id", queueId)
          .eq("status", "processing");
        skippedCount++;
        continue;
      }

      const postCaption = String(postObj.caption || postObj.content || "");
      const mediaUrls = Array.isArray(postObj.media_urls)
        ? (postObj.media_urls as string[])
        : [];
      const hashtags = Array.isArray(postObj.hashtags)
        ? (postObj.hashtags as string[])
        : [];
      const pageToken = process.env.META_PAGE_ACCESS_TOKEN?.trim() || undefined;

      const publishResult = await publishFn(
        {
          id: postId,
          organizationId: queueOrgId,
          caption: postCaption,
          content: postCaption,
          platform: String(item.platform || "facebook"),
          mediaUrls,
          hashtags,
          alreadyPublishedExternalId: existingExternalId || null,
        },
        pageToken,
        {
          organizationId: queueOrgId,
        },
      );

      const confirmedPostId =
        publishResult.success && typeof publishResult.metaPostId === "string"
          ? publishResult.metaPostId.trim()
          : "";

      // Never mark published unless platform success AND non-empty external post ID are confirmed
      if (!publishResult.success || !confirmedPostId) {
        // Only retry if explicitly marked retryable AND no partial side-effect committed without recovery ID
        const hasUnrecoverablePartialCommit =
          Boolean(publishResult.partialResults?.facebook || publishResult.partialResults?.instagram) &&
          !publishResult.containerId;
        const canRetry =
          publishResult.retryable === true &&
          !hasUnrecoverablePartialCommit &&
          currentAttempts < maxAttempts;

        const nextStatus = canRetry ? "pending" : "failed";
        const nextScheduledFor = canRetry
          ? calculateNextSocialRetryAt(currentAttempts, 60_000, publishResult.retryAfterMs)
          : String(item.scheduled_for || now);
        const errorDetail =
          publishResult.errorMessage || "Meta yayınlama hatası (onaylanmış platform yanıtı alınamadı)";

        await admin
          .from("social_publishing_queue")
          .update({
            status: nextStatus,
            attempts: currentAttempts,
            scheduled_for: nextScheduledFor,
            last_error: `${errorDetail} [worker=${workerRunId}]`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", queueId)
          .eq("status", "processing");

        if (nextStatus === "failed") {
          await admin
            .from("social_posts")
            .update({
              status: "failed",
              error_message: errorDetail,
              updated_at: new Date().toISOString(),
            })
            .eq("id", postId)
            .eq("organization_id", queueOrgId);
        }

        failedCount++;
        continue;
      }

      // Transition queue item from 'processing' -> 'completed' only if still owned in 'processing' state
      const completedAt = new Date().toISOString();
      await admin
        .from("social_publishing_queue")
        .update({
          status: "completed",
          published_external_id: confirmedPostId,
          last_error: null,
          processed_at: completedAt,
          updated_at: completedAt,
        })
        .eq("id", queueId)
        .eq("status", "processing")
        .eq("organization_id", queueOrgId);

      await admin
        .from("social_posts")
        .update({
          status: "published",
          meta_post_id: confirmedPostId,
          error_message: null,
          published_at: completedAt,
          updated_at: completedAt,
        })
        .eq("id", postId)
        .eq("organization_id", queueOrgId);

      processedCount++;
    } catch (err) {
      // Ambiguous crash or unhandled exception during external publishing:
      // Quarantine item as 'failed' rather than returning to 'pending' to prevent blind duplicate re-publication.
      failedCount++;
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("social_cron.worker_item_crashed_quarantined", {
        workerRunId,
        queueId,
        postId,
        error: errorMessage,
      });

      await admin
        .from("social_publishing_queue")
        .update({
          status: "failed",
          attempts: currentAttempts,
          last_error: `Ambiguous worker failure quarantined to prevent duplicate publish: ${errorMessage} [worker=${workerRunId}]`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", queueId)
        .eq("status", "processing");

      if (postId) {
        await admin
          .from("social_posts")
          .update({
            status: "failed",
            error_message: `Yayın işlemi belirsiz hata nedeniyle durduruldu: ${errorMessage}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", postId);
      }
    }
  }

  return {
    status: 200,
    body: {
      success: true,
      workerRunId,
      evaluated: claimedRows.length,
      processed: processedCount,
      failed: failedCount,
      skipped: skippedCount,
    },
  };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: "Yetkisiz erişim" }, { status: 401 });
  }

  const result = await runSocialPublishingWorkerCycle();
  return NextResponse.json(result.body, { status: result.status });
}
