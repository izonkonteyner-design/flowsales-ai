import React from "react";
import { Share2, Clock, CheckCircle, Trash2, CalendarDays, Plus } from "lucide-react";
import { loadWorkspaceContext } from "@/server/services/workspace-context";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { createSocialPostAction, deleteSocialPostAction } from "./actions";

export default async function SocialMediaPage() {
  const ctx = await loadWorkspaceContext();
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

  const admin = createSupabaseAdminClient();

  const [postsResult, queueResult] = await Promise.all([
    admin.from("social_posts")
      .select("*")
      .eq("organization_id", ctx.organization.id)
      .order("created_at", { ascending: false })
      .limit(50),
    admin.from("social_publishing_queue")
      .select("*")
      .eq("organization_id", ctx.organization.id)
      .order("scheduled_for", { ascending: true })
      .limit(50),
  ]);

  const posts = postsResult.data || [];
  const queue = queueResult.data || [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pazarlama & Sosyal Medya"
        title="Sosyal Medya Yönetimi"
        description="Instagram Business ve Facebook Sayfaları için içerik planlama, AI taslak üretimi ve zamanlanmış yayın yönetimi."
        actions={
          <StatusBadge tone="success">
            Erişim Hazır
          </StatusBadge>
        }
      />

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
                  placeholder="Örn: Sonbahar Kampanyası"
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
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
                  placeholder="Sosyal medya gönderi metnini girin..."
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Paylaşım Platformları *
                  </label>
                  <div className="flex gap-4 pt-1">
                    <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" name="platforms" value="instagram" defaultChecked className="rounded border-slate-300 text-primary" />
                      Instagram Business
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" name="platforms" value="facebook" defaultChecked className="rounded border-slate-300 text-primary" />
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
                    className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="submit"
                  name="status"
                  value="draft"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5"
                >
                  Taslak Olarak Kaydet
                </button>
                <button
                  type="submit"
                  name="status"
                  value="scheduled"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
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
                    <form action={async () => {
                      "use server";
                      await deleteSocialPostAction(post.id);
                    }}>
                      <button type="submit" title="Sil" className="text-slate-400 hover:text-rose-600 p-1">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </form>
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
                <StatusBadge tone="success">Hazır</StatusBadge>
              </div>
              <div className="flex justify-between items-center p-2.5 border rounded-xl bg-white dark:bg-slate-900">
                <span className="font-medium flex items-center gap-2">
                  <Share2 className="h-4 w-4 text-blue-500" />
                  Facebook Page
                </span>
                <StatusBadge tone="success">Hazır</StatusBadge>
              </div>
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
