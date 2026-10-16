"use server";

import { getWorkspaceContext } from "@/server/services/workspace-context";
import { canEditWorkspace } from "@/lib/workspace-access";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  SupabaseAiApprovalQueue,
  SupabaseAiAuditSink,
  SupabaseAiContextRepository,
} from "@/server/repositories/supabase/ai-sales-agent";
import { aiCapabilitySchema } from "@/server/services/ai-sales-agent/domain";
import { GeminiAiProvider } from "@/server/services/ai-sales-agent/gemini-provider";
import { runAiSalesAgent } from "@/server/services/ai-sales-agent/orchestrator";

const inputSchema = z.object({
  leadId: z.string().uuid(),
  capability: aiCapabilitySchema,
});

export async function runLeadAiAction(formData: FormData) {
  const parsed = inputSchema.safeParse({
    leadId: formData.get("leadId"),
    capability: formData.get("capability"),
  });
  if (!parsed.success) redirect("/leads?toast=Invalid+AI+request&tone=danger");

  const workspace = await getWorkspaceContext();
  if (!canEditWorkspace(workspace)) redirect(`/leads/${parsed.data.leadId}/ai?toast=${encodeURIComponent("YZ çalıştırmak için canlı çalışma alanı ve yazma yetkisi gerekir.")}&tone=danger`);
  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");
  const { data: authData } = await client.auth.getUser();
  if (!authData.user) redirect("/login");

  const { data: membership, error: membershipError } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", authData.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (membershipError || !membership) redirect("/onboarding");

  const path = `/leads/${parsed.data.leadId}/ai`;
  let message = "AI analysis completed";
  try {
    const result = await runAiSalesAgent({
      contextRepository: new SupabaseAiContextRepository(client),
      provider: new GeminiAiProvider(),
      auditSink: new SupabaseAiAuditSink(client),
      approvalQueue: new SupabaseAiApprovalQueue(client),
    }, {
      workspaceId: membership.organization_id,
      actorId: authData.user.id,
      leadId: parsed.data.leadId,
      capability: parsed.data.capability,
    });

    revalidatePath(path);
    message = result.approval
      ? "AI recommendation created and sent to Approval Queue"
      : "AI analysis completed";

  } catch (error) {
    const message = error instanceof Error ? error.message : "AI analysis failed";
    redirect(`${path}?toast=${encodeURIComponent(message)}&tone=danger`);
  }
  redirect(`${path}?toast=${encodeURIComponent(message)}&tone=success`);
}
