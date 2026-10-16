import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { listSocialMediaPosts } from "@/server/services/social-media";

export default async function SocialMediaCalendarPage() {
  const result = await listSocialMediaPosts({ limit: 100 });
  const posts = result.ok ? result.data : [];
  const loadError = result.ok ? null : result.error;

  const scheduled = posts
    .filter((p) => p.status === "scheduled" || p.status === "published")
    .sort((a, b) => {
      const aa = a.scheduled_at || a.published_at || a.created_at;
      const bb = b.scheduled_at || b.published_at || b.created_at;
      return new Date(aa).getTime() - new Date(bb).getTime();
    });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Yayın Takvimi"
        title="Zamanlanmış Yayınlar"
        description="Planlanan ve yayınlanmış gönderilerin zaman sıralı listesi."
      />

      {loadError && (
        <SectionCard title="Yükleme hatası" description={loadError}>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Lütfen tekrar deneyin.
          </p>
        </SectionCard>
      )}

      <SectionCard title="Takvim" description="Yayın kuyruğundaki gönderiler tarihe göre sıralanmıştır.">
        {scheduled.length === 0 ? (
          <EmptyState
            title="Zamanlanmış yayın yok"
            description="İçerik Stüdyosu üzerinden bir gönderi zamanlayın."
          />
        ) : (
          <div className="divide-y divide-slate-200/60 dark:divide-white/10">
            {scheduled.map((post) => (
              <div key={post.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0 dark:bg-blue-900/20">
                    <span className="text-blue-600 dark:text-blue-400 font-medium">📅</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-950 dark:text-white">
                      {post.content}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 capitalize flex items-center gap-1">
                      {post.platform} ·
                      {post.status === "published" ? "Yayınlandı" : "Zamanlandı"}
                    </p>
                  </div>
                </div>
                <time className="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                  {new Date(post.scheduled_at || post.published_at || post.created_at).toLocaleString(
                    "tr-TR",
                  )}
                </time>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
