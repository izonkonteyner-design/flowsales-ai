import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shared/card";
import { Badge } from "@/components/shared/badge";
import { Calendar, Instagram, Facebook, Share2, Sparkles, Plus, Clock, CheckCircle2, AlertCircle } from "lucide-react";

export const metadata = {
  title: "Sosyal Medya Yönetimi — FlowSales AI",
  description: "Instagram ve Facebook için içerik planlama, AI metin yazarı ve gönderi zamanlama.",
};

const mockPosts = [
  {
    id: "post-1",
    platform: "instagram",
    content: "Yeni Konteyner Ofis modellerimiz stokta! Modüler, dayanıklı ve şık tasarımlar ile iş yerinizi dönüştürün. 🚀",
    hashtags: ["#konteynerofis", "#modulerproje", "#flowsalesai"],
    status: "published",
    scheduled_at: null,
    published_at: "2026-03-24T10:00:00Z",
  },
  {
    id: "post-2",
    platform: "both",
    content: "Bahar kampanyamız başladı! Tüm prefabrik yapılarda %15 özel indirim fırsatını kaçırmayın. 🌸",
    hashtags: ["#firsat", "#kampanya", "#prefabrik"],
    status: "scheduled",
    scheduled_at: "2026-03-28T14:30:00Z",
    published_at: null,
  },
  {
    id: "post-3",
    platform: "facebook",
    content: "Şantiye ofis çözümlerimizde ücretsiz keşif hizmetimiz devam ediyor. Detaylı bilgi için bizimle iletişime geçin.",
    hashtags: ["#santiyeofisi", "#insaat"],
    status: "draft",
    scheduled_at: null,
    published_at: null,
  },
];

export default function SocialMediaPage() {
  return (
    <AppShell title="Sosyal Medya Yönetimi">
      <div className="space-y-6 p-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Sosyal Medya Planlayıcı</h1>
            <p className="text-sm text-muted-foreground">
              Instagram ve Facebook hesaplarınız için içerik oluşturun, AI metin yazarı kullanın ve zamanlayın.
            </p>
          </div>
          <button className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90">
            <Plus className="h-4 w-4" />
            Yeni Gönderi Taslağı
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Planlanan Gönderiler</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">1</div>
              <p className="text-xs text-muted-foreground">Önümüzdeki 7 gün içinde yayımlanacak</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Yayımlanan İçerikler</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">12</div>
              <p className="text-xs text-muted-foreground">Bu ay yayımlanan toplam gönderi</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Taslaklar</CardTitle>
              <Share2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">3</div>
              <p className="text-xs text-muted-foreground">Onay bekleyen veya hazırlık aşamasında</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Gönderi Akışı & Takvim</CardTitle>
                <CardDescription>Oluşturulan ve zamanlanan sosyal medya paylaşımları.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {mockPosts.map((post) => (
                  <div key={post.id} className="p-4 rounded-lg border bg-card text-card-foreground shadow-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {post.platform === "instagram" && <Instagram className="h-4 w-4 text-pink-500" />}
                        {post.platform === "facebook" && <Facebook className="h-4 w-4 text-blue-600" />}
                        {post.platform === "both" && (
                          <div className="flex items-center gap-1">
                            <Instagram className="h-4 w-4 text-pink-500" />
                            <Facebook className="h-4 w-4 text-blue-600" />
                          </div>
                        )}
                        <span className="text-xs font-semibold capitalize">{post.platform}</span>
                      </div>

                      {post.status === "published" && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Yayımlandı</Badge>}
                      {post.status === "scheduled" && <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">Zamanlandı</Badge>}
                      {post.status === "draft" && <Badge variant="secondary">Taslak</Badge>}
                    </div>

                    <p className="text-sm leading-relaxed">{post.content}</p>

                    {post.hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {post.hashtags.map((tag) => (
                          <span key={tag} className="text-xs text-primary font-medium">{tag}</span>
                        ))}
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground pt-2 border-t flex items-center justify-between">
                      {post.scheduled_at && <span>Zamanlanmış: {new Date(post.scheduled_at).toLocaleString("tr-TR")}</span>}
                      {post.published_at && <span>Yayımlandı: {new Date(post.published_at).toLocaleString("tr-TR")}</span>}
                      {!post.scheduled_at && !post.published_at && <span>Taslak kayıt</span>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  AI Metin & Başlık Üretici
                </CardTitle>
                <CardDescription>Ürün veya duyurularınız için AI ile Türkçe paylaşım metni hazırlayın.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Konu veya Ürün Detayı</label>
                  <textarea
                    rows={3}
                    placeholder="Örn: 3x7m demonte şantiye konteyneri yaz kampanyası..."
                    className="w-full mt-1 p-2 text-sm rounded-md border bg-background"
                  />
                </div>
                <button className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground hover:bg-secondary/80">
                  <Sparkles className="h-3.5 w-3.5" />
                  Metin ve Hashtag Üret
                </button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Bağlı Hesaplar</CardTitle>
                <CardDescription>Meta Business Manager entegrasyon durumu.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex items-center justify-between p-2 rounded border">
                  <div className="flex items-center gap-2">
                    <Instagram className="h-4 w-4 text-pink-500" />
                    <span className="font-medium">Instagram Business</span>
                  </div>
                  <Badge variant="outline" className="text-emerald-600 border-emerald-300">Aktif</Badge>
                </div>

                <div className="flex items-center justify-between p-2 rounded border">
                  <div className="flex items-center gap-2">
                    <Facebook className="h-4 w-4 text-blue-600" />
                    <span className="font-medium">Facebook Sayfası</span>
                  </div>
                  <Badge variant="outline" className="text-emerald-600 border-emerald-300">Aktif</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
