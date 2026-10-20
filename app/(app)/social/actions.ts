"use server";

import { revalidatePath } from "next/cache";
import { loadWorkspaceContext } from "@/server/services/workspace-context";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import {
  validateSocialPostInput,
  generateSocialCaptionSuggestions,
  SocialPlatform,
} from "@/server/services/integrations/social-publisher";

export async function createSocialPostAction(formData: FormData): Promise<void> {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.organization?.id) return;

  const caption = formData.get("caption")?.toString() ?? "";
  const title = formData.get("title")?.toString() ?? "";
  const rawPlatforms = formData.getAll("platforms").map((p) => p.toString());
  const scheduledAt = formData.get("scheduledAt")?.toString() || null;
  const statusInput = formData.get("status")?.toString() || "draft";

  const platforms = rawPlatforms.filter((p): p is SocialPlatform => p === "instagram" || p === "facebook");

  const validation = validateSocialPostInput({
    caption,
    title,
    platforms,
    scheduledAt,
  });

  if (!validation.ok) return;

  const admin = createSupabaseAdminClient();
  const status = statusInput === "scheduled" && scheduledAt ? "scheduled" : "draft";

  const { data: post, error } = await admin.from("social_posts").insert({
    organization_id: ctx.organization.id,
    title: title.trim() || null,
    caption: caption.trim(),
    platforms,
    status,
    scheduled_at: status === "scheduled" ? new Date(scheduledAt!).toISOString() : null,
    created_by: ctx.userId,
  }).select("id").single();

  if (error || !post) return;

  if (status === "scheduled" && scheduledAt) {
    for (const platform of platforms) {
      await admin.from("social_publishing_queue").insert({
        organization_id: ctx.organization.id,
        post_id: post.id,
        platform,
        status: "pending",
        scheduled_for: new Date(scheduledAt).toISOString(),
      });
    }
  }

  revalidatePath("/social");
}

export async function generateCaptionSuggestionsAction(topic: string, callToAction?: string) {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.organization?.id) {
    return { success: false, error: "Oturum gerekli." };
  }

  if (!topic || !topic.trim()) {
    return { success: false, error: "İçerik konusu girilmelidir." };
  }

  try {
    const suggestions = await generateSocialCaptionSuggestions({
      topic: topic.trim(),
      callToAction: callToAction?.trim(),
    });
    return { success: true, suggestions };
  } catch {
    return { success: false, error: "AI metin önerisi üretilemedi." };
  }
}

export async function deleteSocialPostAction(postId: string): Promise<void> {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.organization?.id) return;

  const admin = createSupabaseAdminClient();
  await admin.from("social_posts")
    .delete()
    .eq("id", postId)
    .eq("organization_id", ctx.organization.id);

  revalidatePath("/social");
}
