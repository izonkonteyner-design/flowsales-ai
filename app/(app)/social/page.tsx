import React from "react";
import { Share2, Clock, Sparkles, CheckCircle } from "lucide-react";

export default function SocialMediaPage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Share2 className="h-6 w-6 text-primary" />
            Sosyal Medya Yönetimi
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Instagram Business ve Facebook Sayfaları için içerik planlama, AI taslak üretimi ve zamanlanmış yayın yönetimi.
          </p>
        </div>
        <button className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 hover:bg-primary/90">
          <Sparkles className="h-4 w-4" />
          Yeni Gönderi Oluştur
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="border rounded-lg p-5 bg-card shadow-sm space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              Zamanlanmış İçerik Akışı
            </h2>
            <div className="border rounded-md p-4 bg-muted/20 text-center py-8">
              <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium">Henüz zamanlanmış gönderi bulunmuyor</p>
              <p className="text-xs text-muted-foreground mt-1">
                AI Asistan ile yeni pazarlama metinleri üretebilir veya doğrudan taslak oluşturabilirsiniz.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="border rounded-lg p-5 bg-card shadow-sm space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Bağlı Kanallar
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center p-2 border rounded-md">
                <span>Instagram Business</span>
                <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">Erişim Hazır</span>
              </div>
              <div className="flex justify-between items-center p-2 border rounded-md">
                <span>Facebook Pages</span>
                <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">Erişim Hazır</span>
              </div>
            </div>
          </div>

          <div className="border rounded-lg p-5 bg-card shadow-sm space-y-3 bg-blue-50/50 border-blue-200">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-blue-900">
              <CheckCircle className="h-4 w-4 text-blue-600" />
              Güvenli Yayıncılık
            </h3>
            <p className="text-xs text-blue-800 leading-relaxed">
              Tüm sosyal medya paylaşımları Meta Graph API standartlarına uygun olarak gerçekleşir. Otomatik yinelenen paylaşımlar engellenmektedir.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
