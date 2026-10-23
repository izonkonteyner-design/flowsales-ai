import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import {
  publishSocialPostToMeta,
  calculateNextSocialRetryAt,
} from "@/server/services/integrations/social-publisher";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: "Yetkisiz erişim" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();

  // Atomically claim due items via RPC when available, falling back to pending query
  let pendingItems: Array<Record<string, unknown>> = [];
  const { data: claimedRows, error: rpcError } = await admin.rpc("claim_due_social_posts", {
    batch_size: 20,
  });

  if (!rpcError && Array.isArray(claimedRows) && claimedRows.length > 0) {
    const postIds = Array.from(
      new Set(claimedRows.map((r: Record<string, unknown>) => String(r.post_id || "")).filter(Boolean)),
    );
    const { data: postsData } = postIds.length
      ? await admin.from("social_posts").select("*").in("id", postIds)
      : { data: [] };
    const postMap = new Map(
      (postsData || []).map((p: Record<string, unknown>) => [String(p.id), p]),
    );
    pendingItems = claimedRows.map((r: Record<string, unknown>) => ({
      ...r,
      _alreadyClaimed: true,
      social_posts: postMap.get(String(r.post_id)) || null,
    }));
  } else {
    const { data: queriedItems, error: fetchError } = await admin
      .from("social_publishing_queue")
      .select("*, social_posts(*)")
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .limit(20);

    if (fetchError) {
      logger.error("social_cron.fetch_failed", { error: fetchError.message });
      return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 });
    }
    pendingItems = (queriedItems || []) as Array<Record<string, unknown>>;
  }

  let processedCount = 0;
  let failedCount = 0;

  for (const item of pendingItems) {
    const queueId = String(item.id || "");
    const postId = String(item.post_id || "");
    const currentAttempts = Number(item.attempts || 0) + (item._alreadyClaimed ? 0 : 1);
    const maxAttempts = Number(item.max_attempts || 3);
    const existingExternalId =
      typeof item.published_external_id === "string" ? item.published_external_id.trim() : "";

    try {
      // Queue idempotency: if already published in a previous run, finalize status without re-publishing
      if (existingExternalId) {
        await admin
          .from("social_publishing_queue")
          .update({
            status: "completed",
            processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", queueId);
        processedCount++;
        continue;
      }

      if (!item._alreadyClaimed) {
        const { data: claimed } = await admin
          .from("social_publishing_queue")
          .update({
            status: "processing",
            attempts: currentAttempts,
            updated_at: new Date().toISOString(),
          })
          .eq("id", queueId)
          .eq("status", "pending")
          .select("id")
          .maybeSingle();

        if (!claimed) {
          // Another worker claimed this item concurrently
          continue;
        }
      }

      const postObj = (item.social_posts || {}) as Record<string, unknown>;
      const organizationId = String(
        item.organization_id || postObj.organization_id || postObj.workspace_id || "",
      ).trim();

      const postCaption = String(postObj.caption || postObj.content || "");
      const mediaUrls = Array.isArray(postObj.media_urls)
        ? (postObj.media_urls as string[])
        : [];
      const hashtags = Array.isArray(postObj.hashtags)
        ? (postObj.hashtags as string[])
        : [];
      const pageToken = process.env.META_PAGE_ACCESS_TOKEN?.trim() || undefined;

      const publishResult = await publishSocialPostToMeta(
        {
          id: postId,
          organizationId,
          caption: postCaption,
          content: postCaption,
          platform: String(item.platform || "facebook"),
          mediaUrls,
          hashtags,
          alreadyPublishedExternalId: existingExternalId || null,
        },
        pageToken,
        {
          organizationId: organizationId || undefined,
        },
      );

      if (!publishResult.success || !publishResult.metaPostId) {
        const canRetry = publishResult.retryable !== false && currentAttempts < maxAttempts;
        const nextStatus = canRetry ? "pending" : "failed";
        const nextScheduledFor = canRetry
          ? calculateNextSocialRetryAt(currentAttempts, 60_000, publishResult.retryAfterMs)
          : String(item.scheduled_for || now);

        await admin
          .from("social_publishing_queue")
          .update({
            status: nextStatus,
            attempts: currentAttempts,
            scheduled_for: nextScheduledFor,
            last_error: publishResult.errorMessage || "Meta yayınlama hatası",
            updated_at: new Date().toISOString(),
          })
          .eq("id", queueId);

        if (nextStatus === "failed" && postId) {
          await admin
            .from("social_posts")
            .update({
              status: "failed",
              error_message: publishResult.errorMessage || "Meta yayınlama hatası",
              updated_at: new Date().toISOString(),
            })
            .eq("id", postId);
        }

        failedCount++;
        continue;
      }

      await admin
        .from("social_publishing_queue")
        .update({
          status: "completed",
          published_external_id: publishResult.metaPostId,
          last_error: null,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", queueId);

      if (postId) {
        await admin
          .from("social_posts")
          .update({
            status: "published",
            meta_post_id: publishResult.metaPostId,
            error_message: null,
            published_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", postId);
      }

      processedCount++;
    } catch (err) {
      failedCount++;
      const errorMessage = err instanceof Error ? err.message : String(err);
      const canRetry = currentAttempts < maxAttempts;
      await admin
        .from("social_publishing_queue")
        .update({
          status: canRetry ? "pending" : "failed",
          attempts: currentAttempts,
          scheduled_for: canRetry
            ? calculateNextSocialRetryAt(currentAttempts)
            : String(item.scheduled_for || now),
          last_error: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", queueId);
    }
  }

  return NextResponse.json({
    success: true,
    evaluated: pendingItems.length,
    processed: processedCount,
    failed: failedCount,
  });
}
