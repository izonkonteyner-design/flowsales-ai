"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const feedbackSchema = z.object({
  runId: z.string().uuid(),
  rating: z.enum(["helpful", "not_helpful"]),
  reasonCode: z.enum(["accurate", "actionable", "clear", "incorrect", "unsupported", "unsafe", "not_relevant", "other"]).optional(),
  comment: z.string().trim().max(1000).optional(),
});

export async function submitAiFeedbackAction(formData: FormData) {
  const parsed = feedbackSchema.safeParse({
    runId: formData.get("runId"),
    rating: formData.get("rating"),
    reasonCode: formData.get("reasonCode") || undefined,
    comment: formData.get("comment") || undefined,
  });
  if (!parsed.success) return;

  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: run, error: runError } = await client
    .from("ai_runs")
    .select("id,organization_id,status")
    .eq("id", parsed.data.runId)
    .eq("status", "completed")
    .maybeSingle();
  if (runError || !run) return;

  const { data: membership } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("organization_id", run.organization_id)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!membership) return;

  const { data: isDemo } = await client.rpc("is_demo_organization", {
    target_org: run.organization_id,
  });
  if (isDemo === true) return;

  await client.from("ai_run_feedback").upsert({
    organization_id: run.organization_id,
    run_id: run.id,
    user_id: auth.user.id,
    rating: parsed.data.rating,
    reason_code: parsed.data.reasonCode ?? null,
    comment: parsed.data.comment || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "run_id,user_id" });

  revalidatePath("/ai-history");
}
