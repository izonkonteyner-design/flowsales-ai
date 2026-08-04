"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  SupabaseAiApprovalAuditSink,
  SupabaseAiApprovalAuthorization,
  SupabaseAiApprovalRepository,
} from "@/server/repositories/supabase/ai-approvals";
import { AiApprovalError } from "@/server/services/ai-approvals/domain";
import { decideAiApproval } from "@/server/services/ai-approvals/service";

const decisionFormSchema = z.object({
  workspaceId: z.string().uuid(),
  approvalId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(1000).optional(),
});

function approvalRedirect(message: string, tone: "success" | "danger"): never {
  redirect(`/approvals?toast=${encodeURIComponent(message)}&tone=${tone}`);
}

export async function decideApprovalAction(formData: FormData): Promise<void> {
  const parsed = decisionFormSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    approvalId: formData.get("approvalId"),
    expectedVersion: formData.get("expectedVersion"),
    decision: formData.get("decision"),
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    approvalRedirect("Invalid approval request.", "danger");
  }
  const input = parsed.data;

  const client = await createSupabaseServerClient();
  if (!client) {
    approvalRedirect("Approval service is not configured.", "danger");
  }

  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) {
    redirect("/login");
  }

  try {
    await decideAiApproval({
      repository: new SupabaseAiApprovalRepository(client),
      authorization: new SupabaseAiApprovalAuthorization(client),
      auditSink: new SupabaseAiApprovalAuditSink(client),
    }, {
      workspaceId: input.workspaceId,
      approvalId: input.approvalId,
      actorId: authData.user.id,
      decision: input.decision,
      note: input.note,
      expectedVersion: input.expectedVersion,
    });
  } catch (error) {
    if (error instanceof AiApprovalError) {
      approvalRedirect(error.message, "danger");
    }
    approvalRedirect("Approval decision could not be saved.", "danger");
  }

  revalidatePath("/approvals");
  approvalRedirect(
    input.decision === "approve" ? "AI recommendation approved." : "AI recommendation rejected.",
    "success",
  );
}
