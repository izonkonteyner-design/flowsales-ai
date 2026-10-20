import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { publishSocialPostToMeta } from "@/server/services/integrations/social-publisher";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: "Yetkisiz erişim" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();

  const { data: pendingItems, error: fetchError } = await admin
    .from("social_publishing_queue")
    .select("*, social_posts(*)")
    .eq("status", "pending")
    .lte("scheduled_for", now)
    .limit(20);

  if (fetchError) {
    logger.error("social_cron.fetch_failed", { error: fetchError.message });
    return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 });
  }

  let processedCount = 0;
  let failedCount = 0;

  for (const item of pendingItems || []) {
    try {
      await admin
        .from("social_publishing_queue")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", item.id);

      const postContent = item.social_posts?.caption || item.social_posts?.content || "";
      const pageToken = process.env.META_PAGE_ACCESS_TOKEN?.trim();

      const publishResult = await publishSocialPostToMeta(
        { content: postContent, platform: item.platform },
        pageToken,
      );

      if (!publishResult.success) {
        throw new Error(publishResult.errorMessage || "Meta yayınlama hatası");
      }

      await admin
        .from("social_publishing_queue")
        .update({
          status: "completed",
          published_external_id: publishResult.metaPostId,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      if (item.post_id) {
        await admin
          .from("social_posts")
          .update({
            status: "published",
            published_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.post_id);
      }

      processedCount++;
    } catch (err) {
      failedCount++;
      const errorMessage = err instanceof Error ? err.message : String(err);
      await admin
        .from("social_publishing_queue")
        .update({
          status: item.attempts >= item.max_attempts ? "failed" : "pending",
          attempts: item.attempts + 1,
          last_error: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);
    }
  }

  return NextResponse.json({
    success: true,
    evaluated: (pendingItems || []).length,
    processed: processedCount,
    failed: failedCount,
  });
}
