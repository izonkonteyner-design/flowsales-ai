import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Share2,
  Clock,
  CheckCircle,
  Trash2,
  CalendarDays,
  Plug,
  AlertTriangle,
  Lock,
  ArrowUpRight,
  Video,
  Globe,
} from "lucide-react";
import { canWriteSalesRecords } from "@/lib/workspace-roles";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { UnifiedSocialComposer } from "@/components/social/unified-social-composer";
import { SocialHubContainer } from "@/components/social/social-hub-container";
import { AdsManagementTab } from "@/components/social/ads-management-tab";
import { CreativePipelineTab } from "@/components/social/creative-pipeline-tab";
import { MediaUploadStudioTab } from "@/components/social/media-upload-studio-tab";
import { MarketingAnalyticsTab } from "@/components/social/marketing-analytics-tab";
import { getAdCampaigns } from "@/server/services/ads/service";
import type { AdCampaignRecord } from "@/server/services/ads/domain";
import { deleteSocialPostAction } from "./actions";

export const metadata: Metadata = {
  title: "Sosyal Medya Yönetimi | FlowSales AI",
  description: "Instagram, Facebook, TikTok ve YouTube için içerik planlama, AI taslak üretimi ve zamanlanmış yayın yönetimi.",
};

const DEMO_ORGANIZATION_ID = "d3e00000-0000-0000-0000-000000000000";

export default async function SocialMediaPage() {
  const ctx = await getWorkspaceContext();

  if (!ctx?.organization?.id) {
    return (
      <EmptyState
        title="Oturum gerekli"
        description="Sosyal medya yönetimini görmek için bir çalışma alanına giriş yapın."
        actionHref="/login"
        actionLabel="Giriş Yap"
      />
    );
  }

  const isDemoWorkspace = ctx.mode === "demo" || ctx.organization.id === DEMO_ORGANIZATION_ID;
  const canMutate = !isDemoWorkspace && canWriteSalesRecords(ctx.role);

  let posts: Array<{
    id: string;
    title?: string | null;
    caption?: string | null;
    content?: string | null;
    status: string;
    platforms?: string[] | null;
    content_type?: string | null;
    scheduled_at?: string | null;
  }> = [];
  let queue: Array<{
    id: string;
    platform: string;
    status: string;
    scheduled_for: string;
  }> = [];
  let connections: Array<{
    provider: string;
    status: string;
    display_name?: string | null;
    external_account_id?: string | null;
  }> = [];
  let queryWarning: string | null = null;
  let adCampaigns: AdCampaignRecord[] = [];
  let creativeBriefs: Array<{
    id: string;
    title: string;
    format: string;
    dimensions: string;
    visual_prompt: string;
    created_at: string;
  }> = [];

  try {
    const admin = createSupabaseAdminClient();
    const [postsResult, queueResult, connectionsResult, campaignsList, briefsResult] = await Promise.all([
      admin
        .from("social_posts")
        .select("*")
        .eq("organization_id", ctx.organization.id)
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("social_publishing_queue")
        .select("*")
        .eq("organization_id", ctx.organization.id)
        .order("scheduled_for", { ascending: true })
        .limit(50),
      admin
        .from("channel_connections")
        .select("provider, status, display_name, external_account_id")
        .eq("organization_id", ctx.organization.id)
        .in("provider", ["instagram", "facebook", "tiktok", "youtube", "google"]),
      getAdCampaigns(ctx.organization.id).catch(() => []),
      Promise.resolve(
        admin
          .from("creative_briefs")
          .select("id, title, format, dimensions, visual_prompt, created_at")
          .eq("organization_id", ctx.organization.id)
          .order("created_at", { ascending: false })
          .limit(20),
      )
        .then((r) => r.data ?? [])
        .catch(() => []),
    ]);

    posts = postsResult.data ?? [];
    queue = queueResult.data ?? [];
    connections = connectionsResult.data ?? [];
    adCampaigns = campaignsList ?? [];
    creativeBriefs = briefsResult ?? [];

    if (postsResult.error || queueResult.error || connectionsResult.error) {
      queryWarning = "Bazı sosyal medya verileri yüklenirken geçici bir gecikme oluştu. Mevcut kayıtlar aşağıda listelenmektedir.";
    }
  } catch {
    queryWarning = "Sosyal medya veritabanı bağlantısı şu anda salt okunur önbellek modunda çalışıyor.";
  }

  const igConnection = connections.find((c) => c.provider === "instagram");
  const fbConnection = connections.find((c) => c.provider === "facebook");
  const ttConnection = connections.find((c) => c.provider === "tiktok");
  const ytConnection = connections.find((c) => c.provider === "youtube");
  const googleConnection = connections.find((c) => c.provider === "google");

  const isIgConnected = igConnection?.status === "connected" && Boolean(igConnection?.external_account_id);
  const isFbConnected = fbConnection?.status === "connected" && Boolean(fbConnection?.external_account_id);
  const isTtConnected = ttConnection?.status === "connected" && Boolean(ttConnection?.external_account_id);
  const isYtConnected = ytConnection?.status === "connected" && Boolean(ytConnection?.external_account_id);
  const isGoogleConnected = googleConnection?.status === "connected" && Boolean(googleConnection?.external_account_id);

  const connectedProviders = [
    ...(isIgConnected ? ["instagram"] : []),
    ...(isFbConnected ? ["facebook"] : []),
    ...(isTtConnected ? ["tiktok"] : []),
    ...(isYtConnected ? ["youtube"] : []),
    ...(isGoogleConnected ? ["google"] : []),
  ];

  const hasAnyConnectedChannel = connectedProviders.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pazarlama & Sosyal Medya"
        title="Sosyal Medya Yönetimi"
        description="Instagram, Facebook, TikTok ve YouTube için içerik planlama, AI taslak üretimi ve zamanlanmış yayın yönetimi."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!canMutate ? (
              <StatusBadge tone="neutral">
                {isDemoWorkspace ? "Salt Okunur Demo" : "Salt Okunur Rol"}
              </StatusBadge>
            ) : null}
            <StatusBadge tone={hasAnyConnectedChannel ? "success" : "warning"}>
              {hasAnyConnectedChannel ? `${connectedProviders.length} Kanal Bağlı` : "OAuth Bağlantısı Gerekli"}
            </StatusBadge>
          </div>
        }
      />

      {queryWarning ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-xs text-amber-200"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
          <span>{queryWarning}</span>
        </div>
      ) : null}

      {!hasAnyConnectedChannel ? (
        <div className="rounded-2xl border border-violet-400/25 bg-gradient-to-r from-violet-500/10 via-blue-500/10 to-cyan-500/10 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                <Plug className="h-4 w-4 text-violet-500 dark:text-violet-300" />
                <span>Meta Sosyal Medya Kanallarınızı Bağlayın (Instagram, Facebook, TikTok, YouTube)</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Kanallarınız bağlı olmasa bile 4 platform için içerik taslakları hazırlayabilir, AI metin asistanı ile başlık ve kancalar üretebilir ve takviminizi planlayabilirsiniz; gerçek zamanlı otomatik paylaşım için ilgili kanal entegrasyonlarını tamamlayın.
              </p>
            </div>
            <Link
              href="/settings/integrations"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-violet-400/30 bg-violet-600 dark:bg-violet-500/20 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-violet-700 dark:hover:bg-violet-500/30"
            >
              <span>Entegrasyon Ayarlarına Git</span>
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      ) : null}

      {!canMutate ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] px-4 py-3 text-xs text-slate-700 dark:text-slate-300">
          <Lock className="h-4 w-4 shrink-0 text-slate-400" />
          <span>
            {isDemoWorkspace
              ? "Demo çalışma alanında sosyal medya modülü salt okunur önizleme modundadır. Gönderi oluşturmak ve zamanlamak için canlı çalışma alanınıza geçiş yapın."
              : "Mevcut çalışma alanı rolünüz (Görüntüleyici) yalnızca içerik akışını ve kuyruk durumunu inceleme yetkisine sahiptir."}
          </span>
        </div>
      ) : null}

      <SocialHubContainer
        mediaContent={<MediaUploadStudioTab />}
        socialContent={
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Unified Social Composer */}
              <UnifiedSocialComposer
                canMutate={canMutate}
                connectedProviders={connectedProviders}
              />

              {/* Posts Feed & History */}
              <SectionCard title="İçerik Akışı ve Taslaklar" description="Kayıtlı taslaklar, zamanlanmış gönderiler ve geçmiş yayınlar.">
                {posts.length === 0 ? (
                  <div className="border border-slate-200 dark:border-white/10 rounded-2xl p-6 bg-slate-50 dark:bg-white/5 text-center py-8">
                    <Clock className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Henüz kaydedilmiş gönderi bulunmuyor</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Yukarıdaki formu kullanarak ilk sosyal medya taslağınızı oluşturabilirsiniz.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {posts.map((post) => (
                      <div key={post.id} className="p-4 rounded-xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-slate-900 flex justify-between items-start gap-4">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {post.title ? <span className="font-semibold text-sm text-slate-900 dark:text-white">{post.title}</span> : null}
                            <StatusBadge tone={post.status === "published" ? "success" : post.status === "scheduled" ? "info" : "neutral"}>
                              {post.status}
                            </StatusBadge>
                            {post.content_type ? (
                              <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 font-medium">
                                {post.content_type}
                              </span>
                            ) : null}
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {Array.isArray(post.platforms) ? post.platforms.join(", ") : ""}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap line-clamp-2">
                            {post.caption || post.content}
                          </p>
                          {post.scheduled_at ? (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <CalendarDays className="h-3 w-3" />
                              Planlanan: {new Date(post.scheduled_at).toLocaleString("tr-TR")}
                            </p>
                          ) : null}
                        </div>
                        {canMutate ? (
                          <form action={async () => {
                            "use server";
                            await deleteSocialPostAction(post.id);
                          }}>
                            <button type="submit" title="Sil" className="text-slate-400 hover:text-rose-600 p-1">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </form>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>

            <div className="space-y-6">
              {/* Publishing Queue */}
              <SectionCard title="Zamanlanmış Yayın Kuyruğu" description="Otomatik işleyici tarafından sırayla işlenecek yayınlar.">
                {queue.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10">
                    Kuyrukta bekleyen işlem yok.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {queue.map((item) => (
                      <div key={item.id} className="p-3 border border-slate-200 dark:border-white/10 rounded-xl bg-white dark:bg-slate-900 text-xs flex justify-between items-center">
                        <div>
                          <p className="font-medium capitalize text-slate-900 dark:text-white">{item.platform}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">{new Date(item.scheduled_for).toLocaleString("tr-TR")}</p>
                        </div>
                        <StatusBadge tone={item.status === "completed" ? "success" : item.status === "failed" ? "danger" : "info"}>
                          {item.status}
                        </StatusBadge>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              {/* Connected Channels (5 Platforms) */}
              <SectionCard title="Bağlı Hesaplar (5 Platform)" description="Meta, Google, TikTok ve YouTube kanalları">
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center p-2.5 border border-slate-200 dark:border-white/10 rounded-xl bg-white dark:bg-slate-900">
                    <span className="font-medium flex items-center gap-2 text-slate-900 dark:text-white">
                      <Share2 className="h-4 w-4 text-pink-500" />
                      Instagram Business
                    </span>
                    <StatusBadge tone={isIgConnected ? "success" : "neutral"}>
                      {isIgConnected ? "Bağlı" : "Bağlı Değil"}
                    </StatusBadge>
                  </div>

                  <div className="flex justify-between items-center p-2.5 border border-slate-200 dark:border-white/10 rounded-xl bg-white dark:bg-slate-900">
                    <span className="font-medium flex items-center gap-2 text-slate-900 dark:text-white">
                      <Share2 className="h-4 w-4 text-blue-500" />
                      Facebook Page
                    </span>
                    <StatusBadge tone={isFbConnected ? "success" : "neutral"}>
                      {isFbConnected ? "Bağlı" : "Bağlı Değil"}
                    </StatusBadge>
                  </div>

                  <div className="flex justify-between items-center p-2.5 border border-slate-200 dark:border-white/10 rounded-xl bg-white dark:bg-slate-900">
                    <span className="font-medium flex items-center gap-2 text-slate-900 dark:text-white">
                      <Globe className="h-4 w-4 text-emerald-500" />
                      Google Business Profile
                    </span>
                    <StatusBadge tone={isGoogleConnected ? "success" : "neutral"}>
                      {isGoogleConnected ? "Bağlı" : "Bağlı Değil"}
                    </StatusBadge>
                  </div>

                  <div className="flex justify-between items-center p-2.5 border border-slate-200 dark:border-white/10 rounded-xl bg-white dark:bg-slate-900">
                    <span className="font-medium flex items-center gap-2 text-slate-900 dark:text-white">
                      <Video className="h-4 w-4 text-neutral-900 dark:text-neutral-100" />
                      TikTok for Business
                    </span>
                    <StatusBadge tone={isTtConnected ? "success" : "neutral"}>
                      {isTtConnected ? "Bağlı" : "Bağlı Değil"}
                    </StatusBadge>
                  </div>

                  <div className="flex justify-between items-center p-2.5 border border-slate-200 dark:border-white/10 rounded-xl bg-white dark:bg-slate-900">
                    <span className="font-medium flex items-center gap-2 text-slate-900 dark:text-white">
                      <Video className="h-4 w-4 text-red-500" />
                      YouTube Channel
                    </span>
                    <StatusBadge tone={isYtConnected ? "success" : "neutral"}>
                      {isYtConnected ? "Bağlı" : "Bağlı Değil"}
                    </StatusBadge>
                  </div>

                  <div className="pt-2">
                    <Link
                      href="/settings/integrations"
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
                    >
                      <Plug className="h-3.5 w-3.5" />
                      <span>Kanalları Yönet</span>
                    </Link>
                  </div>
                </div>
              </SectionCard>

              <div className="p-4 rounded-2xl border border-blue-200/70 bg-blue-50/50 dark:border-blue-500/20 dark:bg-blue-500/10 space-y-2 text-xs text-blue-900 dark:text-blue-200">
                <div className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle className="h-4 w-4 text-blue-600" />
                  Çoklu Kanal Güvenliği & Yinelenen Yayın Koruması
                </div>
                <p className="leading-relaxed">
                  Tüm gönderiler platform bazında (Instagram, Facebook, Google, TikTok, YouTube) ayrı kuyruk nesneleri olarak atomik SKIP LOCKED ile işlenir. İdempotency anahtarı ile yinelenen paylaşımlar engellenir.
                </p>
              </div>
            </div>
          </div>
        }
        adsContent={
          <AdsManagementTab
            canMutate={canMutate}
            initialCampaigns={adCampaigns}
          />
        }
        creativeContent={
          <CreativePipelineTab
            canMutate={canMutate}
            initialBriefs={creativeBriefs}
          />
        }
        analyticsContent={<MarketingAnalyticsTab />}
      />
    </div>
  );
}
