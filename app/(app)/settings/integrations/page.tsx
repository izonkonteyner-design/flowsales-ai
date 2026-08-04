import type { Metadata } from "next";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { loadChannelConnections } from "@/server/services/integrations/channel-connections";
import { isProviderConfigured, type ChannelProvider } from "@/server/services/integrations/provider-adapter";
import {
  IntegrationCard,
  type IntegrationCardConnection,
} from "@/components/settings/integration-card";
import { Plug2, AlertCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Integrations — FlowSales AI",
  description:
    "Connect WhatsApp Business, Instagram, Facebook, Google Business Profile, and TikTok to your FlowSales AI CRM.",
};

// ============================================================================
// Integrations Settings Page — /settings/integrations
//
// Server Component. Reads connection state for the active org.
//
// Security:
//   - No token or secret values are passed to the client.
//   - connection.status is the only sensitive field; safe to render.
//   - Provider configuration status is determined server-side.
//   - Demo org and viewer role are detected server-side and communicated
//     to client components via canManage / isDemo props.
// ============================================================================

const PROVIDERS: ChannelProvider[] = ["whatsapp", "instagram", "facebook", "google", "tiktok"];

export default async function IntegrationsPage() {
  const workspace = await getWorkspaceContext();
  const isDemo = workspace.mode === "demo";
  const canManage =
    !isDemo && (workspace.role === "owner" || workspace.role === "admin");

  // Load connection rows for this org (empty array for demo)
  let connections: Awaited<ReturnType<typeof loadChannelConnections>> = [];
  if (!isDemo && workspace.organization.id) {
    connections = await loadChannelConnections(workspace.organization.id);
  }

  // Build a connection lookup by provider
  const connectionByProvider = new Map<ChannelProvider, (typeof connections)[number]>();
  for (const conn of connections) {
    connectionByProvider.set(conn.provider as ChannelProvider, conn);
  }

  // Determine which providers are configured server-side
  const providerConfigured = new Map<ChannelProvider, boolean>();
  for (const provider of PROVIDERS) {
    providerConfigured.set(provider, isProviderConfigured(provider));
  }

  const anyConfigured = PROVIDERS.some((p) => providerConfigured.get(p));

  return (
    <div className="mx-auto max-w-6xl">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20">
            <Plug2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-950 dark:text-white">Integrations</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Connect your social and messaging channels to FlowSales AI.
            </p>
          </div>
        </div>
      </div>

      {/* Demo banner */}
      {isDemo && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200/70 bg-amber-50 px-5 py-4 dark:border-amber-800/40 dark:bg-amber-950/20">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-300">Demo mode — read-only</p>
            <p className="mt-0.5 text-sm text-amber-700 dark:text-amber-400">
              Integration connections are disabled in the demo workspace. Sign up for a live workspace to
              connect your channels.
            </p>
          </div>
        </div>
      )}

      {/* Viewer banner */}
      {!isDemo && !canManage && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-slate-50 px-5 py-4 dark:border-white/10 dark:bg-white/5">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
          <div>
            <p className="font-medium text-slate-800 dark:text-slate-200">Read-only access</p>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
              You need Owner or Admin role to manage integrations.
            </p>
          </div>
        </div>
      )}

      {/* No credentials configured banner (admin info) */}
      {!isDemo && canManage && !anyConfigured && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-blue-200/70 bg-blue-50 px-5 py-4 dark:border-blue-800/40 dark:bg-blue-950/20">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div>
            <p className="font-medium text-blue-800 dark:text-blue-300">Provider credentials not configured</p>
            <p className="mt-0.5 text-sm text-blue-700 dark:text-blue-400">
              No OAuth credentials are set up for any provider. Configure{" "}
              <code className="rounded bg-blue-100 px-1 font-mono text-xs dark:bg-blue-900/50">
                META_CLIENT_ID
              </code>
              ,{" "}
              <code className="rounded bg-blue-100 px-1 font-mono text-xs dark:bg-blue-900/50">
                GOOGLE_CLIENT_ID
              </code>
              , or{" "}
              <code className="rounded bg-blue-100 px-1 font-mono text-xs dark:bg-blue-900/50">
                TIKTOK_CLIENT_KEY
              </code>{" "}
              environment variables to enable OAuth connections.
            </p>
          </div>
        </div>
      )}

      {/* Integration cards grid */}
      <div
        className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3"
        aria-label="Channel integration cards"
      >
        {PROVIDERS.map((provider) => {
          const raw = connectionByProvider.get(provider) ?? null;

          const connection: IntegrationCardConnection | null = raw
            ? {
                id: raw.id,
                provider: raw.provider as ChannelProvider,
                status: raw.status as IntegrationCardConnection["status"],
                displayName: raw.display_name,
                externalAccountId: raw.external_account_id,
                scopes: raw.scopes ?? [],
                lastSyncedAt: raw.last_synced_at,
                lastConnectedAt: raw.last_connected_at,
                // errorMessage intentionally excluded from client payload
                // to avoid leaking provider error details; use generic message
                errorMessage:
                  raw.status === "error" ? "Connection error. Please reconnect." : null,
              }
            : null;

          return (
            <IntegrationCard
              key={provider}
              provider={provider}
              connection={connection}
              canManage={canManage}
              isDemo={isDemo}
              isProviderConfigured={providerConfigured.get(provider) ?? false}
            />
          );
        })}
      </div>

      {/* Footer note */}
      <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-600">
        WhatsApp, Instagram, and Facebook integrations are powered by the Meta Platform. Google integration
        uses the Google Business Profile API. TikTok integration uses TikTok for Business.
      </p>
    </div>
  );
}
