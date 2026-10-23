import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Share2,
  Clock,
  CheckCircle,
  Trash2,
  CalendarDays,
  Plus,
  Plug,
  AlertTriangle,
  Lock,
  ArrowUpRight,
} from "lucide-react";
import { canWriteSalesRecords } from "@/lib/workspace-roles";
import { createDemoWorkspaceContext, loadWorkspaceContext } from "@/server/services/workspace-context";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { createSocialPostAction, deleteSocialPostAction } from "./actions";

export const metadata: Metadata = {
  title: "Sosyal Medya Yönetimi | FlowSales AI",
  description: "Instagram Business ve Facebook Sayfaları için içerik planlama, AI taslak üretimi ve zamanlanmış yayın yönetimi.",
};

const DEMO_ORGANIZATION_ID = "d3e00000-0000-0000-0000-000000000000";

export default async function SocialMediaPage() {
  const liveCtx = await loadWorkspaceContext();
  const ctx = liveCtx ?? (process.env.NODE_ENV !== "production" ? createDemoWorkspaceContext() : null);

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

  try {
    const admin = createSupabaseAdminClient();
    const [postsResult, queueResult, connectionsResult] = await Promise.all([
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
        .in("provider", ["instagram", "facebook"]),
    ]);

    posts = postsResult.data ?? [];
    queue = queueResult.data ?? [];
    connections = connectionsResult.data ?? [];

    if (postsResult.error || queueResult.error || connectionsResult.error) {
      queryWarning = "Bazı sosyal medya verileri yüklenirken geçici bir gecikme oluştu. Mevcut kayıtlar aşağıda listelenmektedir.";
    }
  } catch {
    queryWarning = "Sosyal medya veritabanı bağlantısı şu anda salt okunur önbellek modunda çalışıyor.";
  }

  const igConnection = connections.find((c) => c.provider === "instagram");
  const fbConnection = connections.find((c) => c.provider === "facebook");
  const isIgConnected = igConnection?.status === "connected" && Boolean(igConnection?.external_account_id);
  const isFbConnected = fbConnection?.status === "connected" && Boolean(fbConnection?.external_account_id);
  const hasAnyConnectedChannel = isIgConnected || isFbConnected;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pazarlama & Sosyal Medya"
        title="Sosyal Medya Yönetimi"
        description="Instagram Business ve Facebook Sayfaları için içerik planlama, AI taslak üretimi ve zamanlanmış yayın yönetimi."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!canMutate ? (
              <StatusBadge tone="neutral">
                {isDemoWorkspace ? "Salt Okunur Demo" : "Salt Okunur Rol"}
              </StatusBadge>
            ) : null}
            <StatusBadge tone={hasAnyConnectedChannel ? "success" : "warning"}>
              {hasAnyConnectedChannel ? "Kanal Bağlı" : "OAuth Bağlantısı Gerekli"}
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
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Plug className="h-4 w-4 text-violet-300" />
                <span>Meta Sosyal Medya Kanallarınızı Bağlayın</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-300">
                Şu anda bağlı bir Instagram Business veya Facebook Sayfası bulunmuyor. Kanallarınız bağlı olmasa bile içerik taslakları hazırlayabilir ve yayın takviminizi planlayabilirsiniz; gerçek zamanlı otomatik paylaşım için Meta OAuth bağlantısını tamamlayın.
              </p>
            </div>
            <Link
              href="/settings/integrations"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-violet-400/30 bg-violet-500/20 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-violet-500/30"
            >
              <span>Entegrasyon Ayarlarına Git</span>
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      ) : null}

      {!canMutate ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-slate-300">
          <Lock className="h-4 w-4 shrink-0 text-slate-400" />
          <span>
            {isDemoWorkspace
              ? "Demo çalışma alanında sosyal medya modülü salt okunur önizleme modundadır. Gönderi oluşturmak ve zamanlamak için canlı çalışma alanınıza geçiş yapın."
              : "Mevcut çalışma alanı rolünüz (Görüntüleyici) yalnızca içerik akışını ve kuyruk durumunu inceleme yetkisine sahiptir."}
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <SectionCard title="Yeni Gönderi & Taslak Oluştur" description="Görsel açıklaması yazın, platformları seçin ve hemen yayınlayın veya zamanlayın.">
            <form action={createSocialPostAction} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Başlık (İsteğe Bağlı)
                </label>
                <input
                  type="text"
                  name="title"
                  disabled={!canMutate}
                  placeholder="Örn: Sonbahar Kampanyası"
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Gönderi Açıklaması (Caption) *
                </label>
                <textarea
                  name="caption"
                  required
                  rows={4}
                  disabled={!canMutate}
                  placeholder="Sosyal medya gönderi metnini girin..."
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Paylaşım Platformları *
                  </label>
                  <div className="flex gap-4 pt-1">
                    <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        name="platforms"
                        value="instagram"
                        defaultChecked
                        disabled={!canMutate}
                        className="rounded border-slate-300 text-primary disabled:cursor-not-allowed disabled:opacity-60"
                      />
                      Instagram Business
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        name="platforms"
                        value="facebook"
                        defaultChecked
                        disabled={!canMutate}
                        className="rounded border-slate-300 text-primary disabled:cursor-not-allowed disabled:opacity-60"
                      />
                      Facebook Page
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Zamanlama (İsteğe Bağlı)
                  </label>
                  <input
                    type="datetime-local"
                    name="scheduledAt"
                    disabled={!canMutate}
                    className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="submit"
                  name="status"
                  value="draft"
                  disabled={!canMutate}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Taslak Olarak Kaydet
                </button>
                <button
                  type="submit"
                  name="status"
                  value="scheduled"
                  disabled={!canMutate}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  Gönderiyi Yayınla / Zamanla
                </button>
              </div>
            </form>
          </SectionCard>

          <SectionCard title="İçerik Akışı ve Taslaklar" description="Kayıtlı taslaklar, zamanlanmış gönderiler ve geçmiş yayınlar.">
            {posts.length === 0 ? (
              <div className="border rounded-2xl p-6 bg-slate-50 dark:bg-white/5 text-center py-8">
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
                      <div className="flex items-center gap-2">
                        {post.title ? <span className="font-semibold text-sm text-slate-900 dark:text-white">{post.title}</span> : null}
                        <StatusBadge tone={post.status === "published" ? "success" : post.status === "scheduled" ? "info" : "neutral"}>
                          {post.status}
                        </StatusBadge>
                        <span className="text-xs text-slate-400">
                          {Array.isArray(post.platforms) ? post.platforms.join(", ") : ""}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap line-clamp-2">
                        {post.caption || post.content}
                      </p>
                      {post.scheduled_at ? (
                        <p className="text-[11px] text-slate-400 flex items-center gap-1">
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
          <SectionCard title="Zamanlanmış Yayın Kuyruğu" description="Otomatik işleyici tarafından sırayla işlenecek yayınlar.">
            {queue.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 dark:bg-white/5 rounded-xl">
                Kuyrukta bekleyen işlem yok.
              </div>
            ) : (
              <div className="space-y-2">
                {queue.map((item) => (
                  <div key={item.id} className="p-3 border rounded-xl bg-white dark:bg-slate-900 text-xs flex justify-between items-center">
                    <div>
                      <p className="font-medium capitalize">{item.platform}</p>
                      <p className="text-[10px] text-slate-400">{new Date(item.scheduled_for).toLocaleString("tr-TR")}</p>
                    </div>
                    <StatusBadge tone={item.status === "completed" ? "success" : item.status === "failed" ? "danger" : "info"}>
                      {item.status}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Bağlı Hesaplar" description="Meta Graph API kanalları">
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center p-2.5 border rounded-xl bg-white dark:bg-slate-900">
                <span className="font-medium flex items-center gap-2">
                  <Share2 className="h-4 w-4 text-pink-500" />
                  Instagram Business
                </span>
                <StatusBadge
                  tone={
                    isIgConnected
                      ? "success"
                      : igConnection?.status === "expired" || igConnection?.status === "error"
                        ? "danger"
                        : "neutral"
                  }
                >
                  {isIgConnected
                    ? "Bağlı"
                    : igConnection?.status === "expired"
                      ? "Süresi Dolmuş"
                      : igConnection?.status === "connecting"
                        ? "Hesap Seçimi Bekleniyor"
                        : "Bağlı Değil"}
                </StatusBadge>
              </div>
              <div className="flex justify-between items-center p-2.5 border rounded-xl bg-white dark:bg-slate-900">
                <span className="font-medium flex items-center gap-2">
                  <Share2 className="h-4 w-4 text-blue-500" />
                  Facebook Page
                </span>
                <StatusBadge
                  tone={
                    isFbConnected
                      ? "success"
                      : fbConnection?.status === "expired" || fbConnection?.status === "error"
                        ? "danger"
                        : "neutral"
                  }
                >
                  {isFbConnected
                    ? "Bağlı"
                    : fbConnection?.status === "expired"
                      ? "Süresi Dolmuş"
                      : fbConnection?.status === "connecting"
                        ? "Sayfa Seçimi Bekleniyor"
                        : "Bağlı Değil"}
                </StatusBadge>
              </div>
              {!hasAnyConnectedChannel ? (
                <div className="pt-2">
                  <Link
                    href="/settings/integrations"
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
                  >
                    <Plug className="h-3.5 w-3.5" />
                    <span>Meta Hesaplarını Bağla</span>
                  </Link>
                </div>
              ) : null}
            </div>
          </SectionCard>

          <div className="p-4 rounded-2xl border border-blue-200/70 bg-blue-50/50 dark:border-blue-500/20 dark:bg-blue-500/10 space-y-2 text-xs text-blue-900 dark:text-blue-200">
            <div className="flex items-center gap-1.5 font-semibold">
              <CheckCircle className="h-4 w-4 text-blue-600" />
              Güvenlik & Yinelenen Yayın Koruması
            </div>
            <p className="leading-relaxed">
              Tüm gönderiler Meta Graph API standartlarına uygun olarak kuyruklanır ve idempotent dedupe anahtarı ile yinelenen paylaşımlar engellenir.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
