"use server";

import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { selectMetaAsset } from "@/server/services/integrations/meta-asset-selection";

export async function selectMetaAssetAction(formData: FormData) {
  const workspace = await getWorkspaceContext();
  if (workspace.mode === "demo" || !workspace.userId || !["owner","admin"].includes(workspace.role)) throw new Error("Owner or admin access is required.");
  const provider = String(formData.get("provider") ?? "");
  const assetId = String(formData.get("assetId") ?? "");
  if (!(["instagram","facebook"] as string[]).includes(provider) || !assetId) throw new Error("Invalid Meta asset selection.");
  await selectMetaAsset({ organizationId: workspace.organization.id, userId: workspace.userId, provider: provider as "instagram" | "facebook", assetId });
  redirect("/settings/integrations?connected=meta_messaging");
}
