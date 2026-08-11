"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { decideDiscountApproval, persistWeeklyPipelineSnapshot, requestDiscountApproval, snapshotQuoteVersion } from "@/server/services/sales-growth-v6";

function requireLive() {
  return getWorkspaceContext().then((context) => {
    if (context.mode !== "live" || !context.userId) throw new Error("Bu işlem yalnızca canlı çalışma alanında kullanılabilir.");
    if (context.role === "viewer") throw new Error("Salt okunur erişim.");
    return context;
  });
}

export async function requestDiscountApprovalAction(formData: FormData) {
  const context = await requireLive();
  const quoteId = String(formData.get("quoteId") || "");
  const discountPercent = Number(formData.get("discountPercent") || 0);
  const reason = String(formData.get("reason") || "").trim();
  if (!quoteId || !reason) throw new Error("Teklif ve gerekçe zorunludur.");
  await requestDiscountApproval({ organizationId: context.organization.id, quoteId, userId: context.userId!, discountPercent, reason });
  revalidatePath("/growth-control/quote-governance");
}

export async function decideDiscountApprovalAction(formData: FormData) {
  const context = await requireLive();
  if (!['owner','admin'].includes(context.role)) throw new Error("Bu karar için yönetici yetkisi gerekir.");
  const decision = formData.get("decision") === "approved" ? "approved" : "rejected";
  await decideDiscountApproval({ organizationId: context.organization.id, approvalId: String(formData.get("approvalId") || ""), userId: context.userId!, decision });
  revalidatePath("/growth-control/quote-governance");
}

export async function snapshotQuoteVersionAction(formData: FormData) {
  const context = await requireLive();
  await snapshotQuoteVersion({ organizationId: context.organization.id, quoteId: String(formData.get("quoteId") || ""), userId: context.userId!, changeNote: String(formData.get("changeNote") || "") });
  revalidatePath("/growth-control/quote-governance");
}

export async function snapshotPipelineAction() {
  const context = await requireLive();
  await persistWeeklyPipelineSnapshot(context.organization.id);
  revalidatePath("/growth-control");
}