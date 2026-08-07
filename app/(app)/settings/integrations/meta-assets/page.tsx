import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { listMetaAssetsForSelection } from "@/server/services/integrations/meta-asset-selection";
import { selectMetaAssetAction } from "./actions";

export default async function MetaAssetSelectionPage({ searchParams }: { searchParams: Promise<{ provider?: string }> }) {
  const workspace = await getWorkspaceContext();
  if (workspace.mode === "demo" || !workspace.userId || !["owner","admin"].includes(workspace.role)) redirect("/settings/integrations");
  const query = await searchParams;
  const provider = query.provider === "instagram" ? "instagram" : query.provider === "facebook" ? "facebook" : null;
  if (!provider) redirect("/settings/integrations?error=invalid_provider");
  const assets = await listMetaAssetsForSelection({ organizationId: workspace.organization.id, provider }).catch(() => []);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950 dark:text-white">Choose {provider === "instagram" ? "Instagram account" : "Facebook Page"}</h1>
        <p className="mt-2 text-sm text-slate-500">FlowSales only connects the asset you explicitly select. Access tokens remain encrypted server-side.</p>
      </div>
      {assets.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">No eligible asset was returned by Meta. Confirm the Page permissions and, for Instagram, that the professional account is linked to a Facebook Page.</div>
      ) : (
        <div className="grid gap-3">
          {assets.map((asset) => (
            <form key={asset.assetId} action={selectMetaAssetAction} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
              <input type="hidden" name="provider" value={provider} />
              <input type="hidden" name="assetId" value={asset.assetId} />
              <div><p className="font-semibold text-slate-900 dark:text-white">{asset.name}</p>{asset.username && <p className="text-sm text-slate-500">@{asset.username}</p>}<p className="mt-1 text-xs text-slate-400">ID ending …{asset.assetId.slice(-6)}</p></div>
              <button type="submit" className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-slate-950">Connect</button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
