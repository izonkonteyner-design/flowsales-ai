import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";

export default async function SocialMediaMediaPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Medya Kütüphanesi"
        title="Medya"
        description="Gönderilerde kullanmak için görsel ve video medya dosyalarınızı buradan yönetin."
      />

      <SectionCard title="Medya dosyaları" description="Yüklü medya listeniz burada görünür.">
        <EmptyState
          title="Henüz medya yok"
          description="Medya yükleme altyapısı sonraki fazda eklenecek. Şu anda harici medya URL'si ile gönderi oluşturabilirsiniz."
        />
      </SectionCard>
    </div>
  );
}
