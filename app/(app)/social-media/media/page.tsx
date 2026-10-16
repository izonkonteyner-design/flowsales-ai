import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { MediaUpload } from "@/components/social-media/MediaUpload";
import { getSocialAccess } from "@/server/services/social-access";
import { listSocialMediaLibrary } from "@/server/services/social-media-library";
import { canEditWorkspace } from "@/lib/workspace-access";

export default async function MediaPage() {
  const access = await getSocialAccess();
  const library = await listSocialMediaLibrary();
  return <div className="space-y-6"><PageHeader eyebrow="Sosyal medya" title="Medya kütüphanesi" description="Çalışma alanına ait görsel ve videoları özel depolamada saklayın ve önizleyin." />
    <SectionCard title="Medya yükle" description={access.demo ? "Demo önizlemesi salt okunurdur; dosya yüklenmez." : "Dosya türü ve boyutu sunucuda doğrulanır."}><MediaUpload disabled={!canEditWorkspace(access.workspace)} /></SectionCard>
    {library.error ? <p role="alert" className="text-amber-300">{library.error}</p> : null}
    <SectionCard title="Dosyalar" description="En yeni 100 dosya gösterilir. Özel önizleme bağlantıları yayın gönderilerinde kalıcı URL olarak kullanılmamalıdır.">
      {library.items.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{library.items.map(item => <article key={item.id} className="rounded-xl border border-white/10 p-4"><h2 className="break-words font-medium">{item.original_name}</h2><p className="mt-2 text-sm text-slate-400">{item.mime_type} · {(Number(item.size_bytes) / 1024 / 1024).toFixed(2)} MB</p>{item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm text-cyan-300">Dosyayı önizle →</a> : <p className="mt-3 text-sm text-amber-300">Önizleme bağlantısı üretilemedi.</p>}</article>)}</div> : <p className="text-sm text-slate-400">{access.demo ? "Demo kütüphanesine gerçek dosya yüklenmez. İçerik stüdyosunda örnek taslakları ve yayın takvimini inceleyebilirsiniz." : "Henüz medya dosyası yok. İlk dosyanızı yukarıdan yükleyin."}</p>}
    </SectionCard></div>;
}
