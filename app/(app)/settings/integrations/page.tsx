import type { Metadata } from "next";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { loadChannelConnections } from "@/server/services/integrations/channel-connections";
import { isProviderConfigured, type ChannelProvider } from "@/server/services/integrations/provider-adapter";
import { IntegrationCard, type IntegrationCardConnection } from "@/components/settings/integration-card";
import { Plug2, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Integrations — FlowSales AI",
  description: "Connect WhatsApp Business, Instagram, Facebook, Google Business Profile, and TikTok to your FlowSales AI CRM.",
};

const PROVIDERS: ChannelProvider[] = ["whatsapp", "instagram", "facebook", "google", "tiktok"];

function isMetaMessagingConfigured(): boolean {
  const appId = process.env.META_CLIENT_ID?.trim() || process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_CLIENT_SECRET?.trim() || process.env.META_APP_SECRET?.trim();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  const webhookVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();
  return Boolean(appId && appSecret && siteUrl && encryptionKey && webhookVerifyToken);
}

export default async function IntegrationsPage() {
  const workspace = await getWorkspaceContext();
  const isDemo = workspace.mode === "demo";
  const canManage = !isDemo && (workspace.role === "owner" || workspace.role === "admin");

  let connections: Awaited<ReturnType<typeof loadChannelConnections>> = [];
  if (!isDemo && workspace.organization.id) connections = await loadChannelConnections(workspace.organization.id);

  const connectionByProvider = new Map<ChannelProvider, (typeof connections)[number]>();
  for (const conn of connections) connectionByProvider.set(conn.provider as ChannelProvider, conn);

  const providerConfigured = new Map<ChannelProvider, boolean>();
  const metaMessagingConfigured = isMetaMessagingConfigured();
  for (const provider of PROVIDERS) {
    providerConfigured.set(provider, provider === "instagram" || provider === "facebook" ? metaMessagingConfigured : isProviderConfigured(provider));
  }

  const anyConfigured = PROVIDERS.some((p) => providerConfigured.get(p));
  const whatsappConnection = connectionByProvider.get("whatsapp") ?? null;
  const instagramConnection = connectionByProvider.get("instagram") ?? null;
  const facebookConnection = connectionByProvider.get("facebook") ?? null;
  const whatsappConfigured = providerConfigured.get("whatsapp") ?? false;
  const anyMetaConfigured = whatsappConfigured || metaMessagingConfigured;
  const connectedMetaChannels = [whatsappConnection, instagramConnection, facebookConnection].filter((item) => item?.status === "connected").length;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20"><Plug2 className="h-5 w-5" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-950 dark:text-white">Integrations</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Connect your social and messaging channels to FlowSales AI.</p>
          </div>
        </div>
      </div>

      {isDemo && <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200/70 bg-amber-50 px-5 py-4 dark:border-amber-800/40 dark:bg-amber-950/20">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div><p className="font-medium text-amber-800 dark:text-amber-300">Demo mode — read-only</p><p className="mt-0.5 text-sm text-amber-700 dark:text-amber-400">Integration connections are disabled in the demo workspace. Sign up for a live workspace to connect your channels.</p></div>
      </div>}

      {!isDemo && !canManage && <div className="mb-6 flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-slate-50 px-5 py-4 dark:border-white/10 dark:bg-white/5">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
        <div><p className="font-medium text-slate-800 dark:text-slate-200">Read-only access</p><p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">You need Owner or Admin role to manage integrations.</p></div>
      </div>}

      {!isDemo && canManage && !anyConfigured && <div className="mb-6 flex items-start gap-3 rounded-2xl border border-blue-200/70 bg-blue-50 px-5 py-4 dark:border-blue-800/40 dark:bg-blue-950/20">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
        <div><p className="font-medium text-blue-800 dark:text-blue-300">Provider credentials not configured</p><p className="mt-0.5 text-sm text-blue-700 dark:text-blue-400">No OAuth credentials are set up for any provider. Configure the Meta App credentials for messaging channels, or the corresponding Google/TikTok credentials, to enable connections.</p></div>
      </div>}

      {!isDemo && canManage && anyMetaConfigured && <section className="mb-6 rounded-2xl border border-emerald-200/70 bg-emerald-50/70 p-5 dark:border-emerald-800/40 dark:bg-emerald-950/15" aria-label="Meta channel self-service onboarding">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-emerald-900 dark:text-emerald-200">Meta channels — self-service setup</h2>
            <p className="mt-1 text-sm text-emerald-800/80 dark:text-emerald-300/80">Connect WhatsApp, Instagram and Facebook without manually pasting access tokens, WABA IDs, Page IDs or Instagram account IDs.</p>
          </div>
          <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">{connectedMetaChannels}/3 connected</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            "Choose the channel card below and sign in to Meta with the business account that owns the channel.",
            "FlowSales discovers eligible WABA, Page or Instagram accounts. One account is selected only when unambiguous; otherwise you choose explicitly.",
            "FlowSales encrypts credentials server-side, activates the channel webhook path and exposes connection/reconnect/disconnect state in this screen.",
          ].map((step, index) => <div key={step} className="flex gap-2 rounded-xl bg-white/70 p-3 text-xs text-slate-700 dark:bg-white/5 dark:text-slate-300">
            {index === 0 || connectedMetaChannels > index ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <ArrowRight className="h-4 w-4 shrink-0 text-emerald-600" />}
            <span><strong>Step {index + 1}.</strong> {step}</span>
          </div>)}
        </div>
      </section>}

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3" aria-label="Channel integration cards">
        {PROVIDERS.map((provider) => {
          const raw = connectionByProvider.get(provider) ?? null;
          const connection: IntegrationCardConnection | null = raw ? {
            id: raw.id,
            provider: raw.provider as ChannelProvider,
            status: raw.status as IntegrationCardConnection["status"],
            displayName: raw.display_name,
            externalAccountId: raw.external_account_id,
            scopes: raw.scopes ?? [],
            lastSyncedAt: raw.last_synced_at,
            lastConnectedAt: raw.last_connected_at,
            errorMessage: raw.status === "error" ? "Connection error. Please reconnect." : null,
          } : null;
          const metaAppId = process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID || "";
          const metaConfigId = process.env.META_EMBEDDED_SIGNUP_CONFIG_ID || process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID || "";
          return <IntegrationCard key={provider} provider={provider} connection={connection} canManage={canManage} isDemo={isDemo}
            isProviderConfigured={providerConfigured.get(provider) ?? false} metaAppId={metaAppId} metaConfigId={metaConfigId} />;
        })}
      </div>

      <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-600">WhatsApp, Instagram, and Facebook integrations are powered by the Meta Platform. Google integration uses the Google Business Profile API. TikTok integration uses TikTok for Business.</p>
    </div>
  );
}
