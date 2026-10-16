import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { listSocialMediaAccounts, disconnectSocialAccount } from "@/server/services/social-media";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { ConnectAccountButton } from "@/components/social-media/ConnectAccountButton";
import { resolvePlanState } from "@/lib/entitlements";
import { hasFeature } from "@/lib/entitlements";

export default async function SocialMediaAccountsPage() {
  const workspace = await getWorkspaceContext();
  const result = await listSocialMediaAccounts();
  const accounts = result.ok ? result.data : [];
  const loadError = result.ok ? null : result.error;

  const planState = resolvePlanState(null, workspace.organization.id);
  const canPublish = hasFeature(planState.entitlement, "social_publishing");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sosyal Medya Yönetimi"
        title="Hesaplar"
        description={
          canPublish
            ? "Bağlı sosyal medya profillerinizi yönetin ve yeni hesap ekleyin."
            : "Bu pakette sosyal medya yayınlama dahil değildir. Görüntüleme erişiminiz mevcut."
        }
      />

      {loadError && (
        <SectionCard title="Yükleme hatası" description={loadError}>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Lütfen bağlantınızı kontrol edip tekrar deneyin.
          </p>
        </SectionCard>
      )}

      <SectionCard title="Bağlı hesaplar" description="İZON Konteyner profilleriniz FlowSales ile senkronize kalır.">
        {!canPublish && (
          <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-sm">
            Yayınlama bu pakette kapalıdır. Hesapları görebilir, bağlama/bağlantıyı kesemezsiniz.
          </div>
        )}

        {accounts.length === 0 ? (
          <EmptyState
            title="Henüz hesap bağlanmamış"
            description="Yayın yapmak için en az bir sosyal medya hesabı bağlayın."
          />
        ) : (
          <div className="divide-y divide-slate-200/60 dark:divide-white/10">
            {accounts.map((account) => (
              <div key={account.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 dark:bg-white/5">
                    <span className="text-slate-600 dark:text-slate-400">IG</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-950 dark:text-white">
                      {account.username || account.platform_account_id}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                      {account.platform}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                      account.status === "connected"
                        ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400"
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                    {account.status === "connected" ? "Bağlı" : "Bağlantı koptu"}
                  </span>
                  {canPublish && (
                    <button
                      onClick={() => void disconnectAccount(account.id)}
                      className="text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white text-sm font-medium underline underline-offset-4"
                    >
                      Bağlantıyı Kes
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex items-center gap-2">
          <ConnectAccountButton platform="instagram" disabled={!canPublish} />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            İlk olarak Instagram bağlanıyor; diğer platformlar aşamalı eklenecek.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}

async function disconnectAccount(accountId: string) {
  if (!confirm("Bu hesabı bağlantısını kesmek istediğinize emin misiniz?")) return;
  const result = await disconnectSocialAccount(accountId);
  if (!result.ok) {
    alert(result.error || "Bağlantı kesilemedi.");
  } else {
    location.reload();
  }
}
