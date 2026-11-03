import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { loadChannelConnections } from "@/server/services/integrations/channel-connections";
import { isProviderConfigured, type ChannelProvider } from "@/server/services/integrations/provider-adapter";
import { IntegrationCard, type IntegrationCardConnection } from "@/components/settings/integration-card";
import { LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";
import Link from "next/link";
import { Plug2, AlertCircle, CheckCircle2, ArrowRight, Mail, PhoneCall, CreditCard, Radio } from "lucide-react";

export const metadata: Metadata = {
  title: "Integrations — FlowSales AI",
  description: "Connect WhatsApp Business, Instagram, Facebook, Google Business Profile, YouTube, and TikTok to your FlowSales AI CRM.",
};

const PROVIDERS: ChannelProvider[] = ["whatsapp", "instagram", "facebook", "google", "tiktok", "youtube"];

function isMetaMessagingConfigured(): boolean {
  const appId = process.env.META_CLIENT_ID?.trim() || process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_CLIENT_SECRET?.trim() || process.env.META_APP_SECRET?.trim();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  const webhookVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();
  return Boolean(appId && appSecret && siteUrl && encryptionKey && webhookVerifyToken);
}

export default async function IntegrationsPage() {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  const isTr = locale === "tr";

  const workspace = await getWorkspaceContext();
  const isDemo = workspace.mode === "demo";
  const canManage = !isDemo && (workspace.role === "owner" || workspace.role === "admin");
  let connections: Awaited<ReturnType<typeof loadChannelConnections>> = [];
  if (!isDemo && workspace.organization.id) connections = await loadChannelConnections(workspace.organization.id);

  const connectionByProvider = new Map<ChannelProvider, (typeof connections)[number]>();
  for (const conn of connections) {
    const existing = connectionByProvider.get(conn.provider as ChannelProvider);
    if (!existing) {
      connectionByProvider.set(conn.provider as ChannelProvider, conn);
    } else if (conn.status === "connected" && existing.status !== "connected") {
      connectionByProvider.set(conn.provider as ChannelProvider, conn);
    } else if (conn.status === existing.status && new Date(conn.updated_at).getTime() > new Date(existing.updated_at).getTime()) {
      connectionByProvider.set(conn.provider as ChannelProvider, conn);
    }
  }

  const providerConfigured = new Map<ChannelProvider, boolean>();
  const metaMessagingConfigured = isMetaMessagingConfigured();
  for (const provider of PROVIDERS) {
    providerConfigured.set(
      provider,
      provider === "whatsapp" || provider === "instagram" || provider === "facebook"
        ? metaMessagingConfigured
        : isProviderConfigured(provider),
    );
  }

  const anyConfigured = PROVIDERS.some((p) => providerConfigured.get(p));
  const whatsappConnection = connectionByProvider.get("whatsapp") ?? null;
  const instagramConnection = connectionByProvider.get("instagram") ?? null;
  const facebookConnection = connectionByProvider.get("facebook") ?? null;
  const whatsappConfigured = providerConfigured.get("whatsapp") ?? false;
  const anyMetaConfigured = whatsappConfigured || metaMessagingConfigured;
  const connectedMetaChannels = [whatsappConnection, instagramConnection, facebookConnection].filter((item) => item?.status === "connected").length;

  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
        <Plug2 className="h-5 w-5" />
      </div>
      <div>
        <h1 className="text-xl font-bold text-foreground">
          {isTr ? "Entegrasyonlar" : "Integrations"}
        </h1>
        <p className="text-xs text-muted-foreground">
          {isTr
            ? "Sosyal medya ve mesajlaşma kanallarınızı FlowSales AI CRM'e bağlayın."
            : "Connect your social and messaging channels to FlowSales AI."}
        </p>
      </div>
    </div>

    {isDemo && (
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-950/20">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <p className="font-medium text-xs text-amber-800 dark:text-amber-300">
            {isTr ? "Demo modu — salt okunur" : "Demo mode — read-only"}
          </p>
          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
            {isTr
              ? "Entegrasyon bağlantıları demo çalışma alanında devre dışıdır. Kanallarınızı bağlamak için canlı bir çalışma alanına geçin."
              : "Integration connections are disabled in the demo workspace. Sign up for a live workspace to connect your channels."}
          </p>
        </div>
      </div>
    )}

    {!isDemo && !canManage && (
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="font-medium text-xs text-foreground">
            {isTr ? "Salt okunur erişim" : "Read-only access"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isTr
              ? "Entegrasyonları yönetmek için Sahip (Owner) veya Yönetici (Admin) rolü gereklidir."
              : "You need Owner or Admin role to manage integrations."}
          </p>
        </div>
      </div>
    )}

    {!isDemo && canManage && !anyConfigured && (
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800/40 dark:bg-blue-950/20">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
        <div>
          <p className="font-medium text-xs text-blue-800 dark:text-blue-300">
            {isTr ? "Sağlayıcı kimlik bilgileri yapılandırılmamış" : "Provider credentials not configured"}
          </p>
          <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-400">
            {isTr
              ? "Henüz herhangi bir sağlayıcı için OAuth kimlik bilgisi tanımlanmamış. Kanalları bağlamak için ortam değişkenlerini ayarlayın."
              : "No OAuth credentials are set up for any provider. Configure provider credentials to enable connections."}
          </p>
        </div>
      </div>
    )}

    {!isDemo && canManage && anyMetaConfigured && (
      <section className="mb-6 rounded-2xl border border-emerald-200/70 bg-emerald-50/70 p-5 dark:border-emerald-800/40 dark:bg-emerald-950/15" aria-label="Meta channel self-service onboarding">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-emerald-900 dark:text-emerald-200">
              {isTr ? "Meta kanalları — self-servis kurulum" : "Meta channels — self-service setup"}
            </h2>
            <p className="mt-1 text-sm text-emerald-800/80 dark:text-emerald-300/80">
              {isTr
                ? "WhatsApp, Instagram ve Facebook hesaplarınızı erişim belirteci, WABA ID veya Sayfa ID kopyalamadan bağlayın."
                : "Connect WhatsApp, Instagram and Facebook without manually pasting access tokens, WABA IDs, Page IDs or Instagram account IDs."}
            </p>
            <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-400/80">
              {isTr
                ? "WhatsApp kurulumu Meta Embedded Signup üzerinden; Instagram ve Facebook ise Meta OAuth hesap seçimi ile otomatik tamamlanır."
                : "WhatsApp self-service setup continues through Meta Embedded Signup without manually copying access tokens; Instagram and Facebook use Meta OAuth account selection."}
            </p>
          </div>
          <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
            {connectedMetaChannels}/3 {isTr ? "bağlı" : "connected"}
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            isTr
              ? "Aşağıdaki kanal kartından 'Bağlan' butonuna tıklayın ve kanala sahip Meta işletme hesabınızla resmi ekranda oturum açın."
              : "Choose the channel card below and sign in to Meta with the business account that owns the channel.",
            isTr
              ? "FlowSales uygun WABA, Sayfa veya Instagram işletme hesaplarını tespit eder ve seçiminizi sağlar."
              : "FlowSales discovers eligible WABA, Page or Instagram accounts. One account is selected only when unambiguous; otherwise you choose explicitly.",
            isTr
              ? "FlowSales kimlik bilgilerini sunucu tarafında AES-GCM ile şifreler, webhook yolunu etkinleştirir ve canlı durumu bu ekranda gösterir."
              : "FlowSales encrypts credentials server-side, activates the channel webhook path and exposes connection state in this screen.",
          ].map((step, index) => (
            <div key={step} className="flex gap-2 rounded-xl bg-white/70 p-3 text-xs text-slate-700 dark:bg-white/5 dark:text-slate-300">
              {index === 0 || connectedMetaChannels > index ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <ArrowRight className="h-4 w-4 shrink-0 text-emerald-600" />
              )}
              <span>
                <strong>{isTr ? `${index + 1}. Adım:` : `Step ${index + 1}.`}</strong> {step}
              </span>
            </div>
          ))}
        </div>
      </section>
    )}

    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3" aria-label="Channel integration cards">
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
              errorMessage: raw.status === "error" ? (isTr ? "Bağlantı hatası. Lütfen yeniden bağlanın." : "Connection error. Please reconnect.") : null,
            }
          : null;
        const metaAppId = process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID || "";
        const metaConfigId = process.env.META_EMBEDDED_SIGNUP_CONFIG_ID || process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID || "";
        return (
          <IntegrationCard
            key={provider}
            provider={provider}
            connection={connection}
            canManage={canManage}
            isDemo={isDemo}
            isProviderConfigured={providerConfigured.get(provider) ?? false}
            metaAppId={metaAppId}
            metaConfigId={metaConfigId}
            locale={locale}
          />
        );
      })}
    </div>
    <div className="mt-8 grid gap-4 md:grid-cols-3">
      <Link href="/settings/integrations/email" className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition hover:bg-muted/40 shadow-xs">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-muted text-foreground"><Mail className="h-4 w-4" /></span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Gmail & M365</h2>
            <p className="text-xs text-muted-foreground">Gelen kutusu eşitleme ve e-posta gönderimi</p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </Link>

      <Link href="/settings/integrations/voice" className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition hover:bg-muted/40 shadow-xs">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-muted text-foreground"><PhoneCall className="h-4 w-4" /></span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">AI Telefon Asistanı</h2>
            <p className="text-xs text-muted-foreground">Turkcell 05xx korumalı yönlendirme profili</p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </Link>

      <Link href="/settings/billing" className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition hover:bg-muted/40 shadow-xs">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-muted text-foreground"><CreditCard className="h-4 w-4" /></span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Faturalandırma & Ödeme</h2>
            <p className="text-xs text-muted-foreground">Lemon Squeezy abonelik ve plan yönetimi</p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </Link>
    </div>

    <section className="mt-8 rounded-lg border border-border bg-card p-5 shadow-xs">
      <div className="flex items-center gap-2">
        <Radio className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Doğrudan Webhook Uç Noktaları</h3>
      </div>
      <div className="mt-3 grid gap-2 text-xs md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-md border border-border bg-background p-3">
          <p className="font-semibold text-foreground">Meta & WhatsApp Webhook</p>
          <code className="mt-1 block font-mono text-[11px] text-muted-foreground">/api/webhooks/meta</code>
        </div>
        <div className="rounded-md border border-border bg-background p-3">
          <p className="font-semibold text-foreground">Google Ads Potansiyel Formu</p>
          <code className="mt-1 block font-mono text-[11px] text-muted-foreground">/api/webhooks/google-leads</code>
        </div>
        <div className="rounded-md border border-border bg-background p-3">
          <p className="font-semibold text-foreground">Lemon Squeezy Faturalandırma</p>
          <code className="mt-1 block font-mono text-[11px] text-muted-foreground">/api/billing/webhook</code>
        </div>
      </div>
    </section>

    <p className="mt-8 text-center text-xs text-muted-foreground">WhatsApp, Instagram, and Facebook integrations are powered by the Meta Platform. Google integration uses Google Calendar and Google Business Profile APIs. YouTube integration uses YouTube Data API v3. TikTok integration uses TikTok for Business.</p>
  </div>;
}
