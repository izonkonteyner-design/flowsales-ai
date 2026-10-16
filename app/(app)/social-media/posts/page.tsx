import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { listSocialMediaPosts, listSocialMediaAccounts } from "@/server/services/social-media";
import { getSocialAccess } from "@/server/services/social-access";
import { CreatePostForm } from "@/components/social-media/CreatePostForm";
import { PublishPostButton } from "@/components/social-media/PublishPostButton";

export default async function SocialMediaPostsPage() {
  const access = await getSocialAccess();
  const accountResult = await listSocialMediaAccounts();
  const result = await listSocialMediaPosts({ limit: 50 });
  const posts = result.ok ? result.data : [];
  const loadError = result.ok ? null : result.error;

  const canPublish = access.canPublish;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="İçerik Stüdyosu"
        title="Gönderiler"
        description={
          canPublish
            ? "Taslak oluşturun, yayın zamanlayın ve bağlı hesaplarınızda yayınlayın."
            : access.reason || "Gönderileri salt okunur olarak görüntüleyebilirsiniz."
        }
        actions={
          <span className="text-sm text-slate-400">{access.demo ? "Örnek içerik · Salt okunur" : "İnsan kontrollü yayınlama"}</span>
        }
      />

      {loadError && (
        <SectionCard title="Yükleme hatası" description={loadError}>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Lütfen tekrar deneyin.
          </p>
        </SectionCard>
      )}

      <SectionCard title="Yeni içerik" description={access.reason || "Bir yayın hesabı seçin ve içeriğinizi hazırlayın."}><CreatePostForm disabled={!canPublish} accounts={accountResult.ok ? accountResult.data : []} /></SectionCard>
      <SectionCard title="Gönderi listesi" description="Taslak, zamanlanmış, yayınlanmış ve başarısız gönderiler.">
        {!canPublish && (
          <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-sm">
            {access.reason}
          </div>
        )}

        {posts.length === 0 ? (
          <EmptyState
            title="Henüz gönderi yok"
            description="İlk gönderinizi oluşturmak için yukarıdaki formu kullanın."
          />
        ) : (
          <div className="divide-y divide-slate-200/60 dark:divide-white/10">
            {posts.map((post) => (
              <PostRow key={post.id} post={post} canPublish={canPublish} />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function PostRow({
  post,
  canPublish,
}: {
  post: { id: string; platform: string; status: string; content: string; media_urls: string[]; scheduled_at: string | null; published_at: string | null; error_message: string | null };
  canPublish: boolean;
}) {
  const statusLabels: Record<string, { label: string; tone: string }> = {
    draft: { label: "Taslak", tone: "text-slate-500 dark:text-slate-400" },
    scheduled: { label: "Zamanlandı", tone: "text-blue-600 dark:text-blue-400" },
    processing: { label: "Platform doğrulaması bekleniyor", tone: "text-amber-400" },
    published: { label: "Yayınlandı", tone: "text-green-600 dark:text-green-400" },
    failed: { label: "Başarısız", tone: "text-rose-600 dark:text-rose-400" },
    archived: { label: "Arşivlendi", tone: "text-slate-400" },
  };
  const status = statusLabels[post.status] ?? statusLabels.draft;

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border ${
              post.status === "published"
                ? "border-green-200 text-green-700 dark:border-green-800/50 dark:text-green-400"
                : post.status === "failed"
                ? "border-rose-200 text-rose-700 dark:border-rose-800/50 dark:text-rose-400"
                : post.status === "scheduled"
                ? "border-blue-200 text-blue-700 dark:border-blue-800/50 dark:text-blue-400"
                : "border-slate-200 text-slate-700 dark:border-white/10 dark:text-slate-300"
            }`}
          >
            {status.label}
          </span>
          <span className="text-xs text-slate-400 capitalize ml-auto">{post.platform}</span>
        </div>
        <p className="mt-1 text-sm text-slate-700 dark:text-slate-300 break-words">
          {post.content}
        </p>
        {post.media_urls.length > 0 && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {post.media_urls.length} ekli medya
          </p>
        )}
        {post.scheduled_at && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Zamanlama: {new Date(post.scheduled_at).toLocaleString("tr-TR")}
          </p>
        )}
        {post.published_at && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Yayın: {new Date(post.published_at).toLocaleString("tr-TR")}
          </p>
        )}
        {post.error_message && (
          <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
            Hata: {post.error_message}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {canPublish && post.status === "draft" && (
          <PublishPostButton postId={post.id} />
        )}
        {!canPublish && post.status === "draft" && (
          <button disabled className="text-slate-400 cursor-not-allowed underline underline-offset-4 text-sm">
            Yayınlama kapalı
          </button>
        )}
      </div>
    </div>
  );
}
