export const SUPPORTED_LOCALES = ["tr", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "tr";
export const LOCALE_COOKIE = "flowsales_locale";

export function normalizeLocale(value: string | null | undefined): Locale {
  return value === "en" ? "en" : "tr";
}

export function getClientLocale(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
  return normalizeLocale(match?.[1]);
}

export const localeMeta: Record<Locale, { label: string; intl: string; currency: string }> = {
  tr: { label: "Türkçe", intl: "tr-TR", currency: "TRY" },
  en: { label: "English", intl: "en-US", currency: "TRY" },
};

const common = {
  tr: {
    workspace: "Çalışma alanı", intelligence: "Zekâ", operations: "Operasyonlar", settings: "Ayarlar",
    demoWorkspace: "Demo çalışma alanı", readOnlyPreview: "Salt okunur önizleme", liveWorkspace: "Canlı çalışma alanı",
    aiRevenueWorkspace: "Yapay zekâ satış çalışma alanı", aiUsage: "YZ kullanımı", view: "Görüntüle", viewAccount: "Hesabı görüntüle",
    searchPlaceholder: "Potansiyel müşteri ara...", search: "Ara", aiCommand: "Komuta merkezi",
    notifications: "Bildirimler", toggleTheme: "Temayı değiştir", logout: "Çıkış yap", openNavigation: "Menüyü aç",
    closeNavigation: "Menüyü kapat", toggleSidebar: "Kenar çubuğunu değiştir", demoUser: "Demo kullanıcı",
    errorTitle: "Bir şeyler ters gitti", errorDescription: "Uygulama beklenmeyen bir hatayla karşılaştı. Tekrar deneyebilir veya kontrol paneline dönebilirsiniz.",
    retry: "Tekrar dene", dashboard: "Kontrol Paneli", back: "Geri", cancel: "İptal", save: "Kaydet", create: "Oluştur",
    edit: "Düzenle", delete: "Sil", close: "Kapat", loading: "Yükleniyor...", noResults: "Sonuç bulunamadı",
    somethingWentWrong: "Bir şeyler ters gitti", unexpectedError: "Beklenmeyen bir hata oluştu.",
    quoteAiTitle: "Yapay zekâ ile taslak oluştur", quoteAiDescription: "Teklif metnini üretin, ön izleyin ve yalnızca onayladığınız alanlara uygulayın.",
    quoteAiBadge: "Metin önerisi", quoteAiDisclaimer: "Yapay zekânın oluşturduğu metni kontrol edin. Kaydetmeden önce doğruluğunu siz onaylamalısınız.",
    quoteAiOpen: "Yapay zekâ ile taslak oluştur", quoteAiDraftTitle: "Taslak oluşturma", quoteAiDraftDescription: "Yapay zekâ yalnızca metin alanlarını günceller; ürün satırları, miktarlar ve toplamlar değişmez.",
    quoteAiClose: "Yapay zekâ yardımcısını kapat", quoteAiInstruction: "Özel talimat", quoteAiInstructionPlaceholder: "Örn. Daha resmi bir ton kullanın; ödeme ve teslim koşullarını kısa tutun.",
    quoteAiGenerating: "Oluşturuluyor...", quoteAiGenerate: "Taslak oluştur", quoteAiClearPreview: "Ön izlemeyi temizle", quoteAiPreviewReady: "Ön izleme hazır",
    quoteAiPreserved: "Ürün satırları ve toplamlar korunur.", quoteAiApply: "Forma uygula", quoteAiPreviewFieldNotes: "Notlar / açıklama", quoteAiPreviewFieldPayment: "Ödeme koşulları", quoteAiPreviewFieldDelivery: "Teslim koşulları", quoteAiPreviewFieldRecommendation: "Dahili öneri",
    quoteAiReadonly: "Bu kayıt salt okunurdur.", quoteAiReadFormError: "Yapay zekâ taslağı için mevcut form verisi okunamadı.", quoteAiFillForm: "Önce teklif formunu doldurun.", quoteAiFailure: "Yapay zekâ taslağı oluşturulamadı.", quoteAiRetry: "Yapay zekâ taslağı şu anda oluşturulamadı. Lütfen tekrar deneyin.",
  },
  en: {
    workspace: "Workspace", intelligence: "Intelligence", operations: "Operations", settings: "Settings",
    demoWorkspace: "Demo workspace", readOnlyPreview: "Read-only preview", liveWorkspace: "Live workspace",
    aiRevenueWorkspace: "AI revenue workspace", aiUsage: "AI usage", view: "View", viewAccount: "View account",
    searchPlaceholder: "Search leads...", search: "Search", aiCommand: "Command center",
    notifications: "Notifications", toggleTheme: "Toggle theme", logout: "Log out", openNavigation: "Open navigation",
    closeNavigation: "Close navigation", toggleSidebar: "Toggle sidebar", demoUser: "Demo user",
    errorTitle: "Something went wrong", errorDescription: "The application encountered an unexpected error. You can retry or return to the dashboard.",
    retry: "Retry", dashboard: "Dashboard", back: "Back", cancel: "Cancel", save: "Save", create: "Create",
    edit: "Edit", delete: "Delete", close: "Close", loading: "Loading...", noResults: "No results found",
    somethingWentWrong: "Something went wrong", unexpectedError: "An unexpected error occurred.",
    quoteAiTitle: "Create a draft with AI", quoteAiDescription: "Generate quote text, preview it, and apply only the fields you approve.",
    quoteAiBadge: "Text suggestion", quoteAiDisclaimer: "Review AI-generated text. You are responsible for confirming accuracy before saving.",
    quoteAiOpen: "Create draft with AI", quoteAiDraftTitle: "Draft generation", quoteAiDraftDescription: "AI updates text fields only; product lines, quantities, and totals remain unchanged.",
    quoteAiClose: "Close AI assistant", quoteAiInstruction: "Custom instruction", quoteAiInstructionPlaceholder: "E.g. Use a more formal tone and keep payment and delivery terms concise.",
    quoteAiGenerating: "Generating...", quoteAiGenerate: "Create draft", quoteAiClearPreview: "Clear preview", quoteAiPreviewReady: "Preview ready",
    quoteAiPreserved: "Product lines and totals are preserved.", quoteAiApply: "Apply to form", quoteAiPreviewFieldNotes: "Notes / description", quoteAiPreviewFieldPayment: "Payment terms", quoteAiPreviewFieldDelivery: "Delivery terms", quoteAiPreviewFieldRecommendation: "Internal recommendation",
    quoteAiReadonly: "This record is read-only.", quoteAiReadFormError: "The current form data could not be read for the AI draft.", quoteAiFillForm: "Fill in the quote form first.", quoteAiFailure: "The AI draft could not be created.", quoteAiRetry: "The AI draft could not be created right now. Please try again.",
  },
} as const;

export type CommonTranslationKey = keyof (typeof common)["tr"];
export function t(locale: Locale, key: CommonTranslationKey): string { return common[locale][key] ?? common.tr[key]; }

const turkishNavigation: Record<string, string> = {
  Dashboard: "Kontrol Paneli", Inbox: "Gelen Kutusu", "Phone Inbox": "Telefon Gelen Kutusu", Leads: "Potansiyel Müşteriler",
  Customers: "Müşteriler", Products: "Ürünler", Quotes: "Teklifler", Tasks: "Görevler", Calendar: "Takvim",
  AI: "Yapay Zekâ", "Sales Operations": "Satış Operasyonları", "Command Center": "Komuta Merkezi", "Sales Analyst": "Satış Analisti",
  "Growth Control": "Büyüme Kontrolü", "Sales Cockpit": "Satış Kokpiti", "Revenue Intelligence": "Gelir Zekâsı", "AI History": "YZ Geçmişi",
  Approvals: "Onaylar", Reports: "Raporlar", Operations: "Operasyonlar", Notifications: "Bildirimler", Usage: "Kullanım",
  Security: "Güvenlik", "Audit Logs": "Denetim Kayıtları", "API Layer": "API Katmanı", API: "API", Integrations: "Entegrasyonlar",
  Account: "Hesap", Settings: "Ayarlar", Billing: "Faturalandırma", Team: "Ekip", Permissions: "Yetkiler", Upgrade: "Planı Yükselt",
};

const englishNavigation: Record<string, string> = {
  Dashboard: "Dashboard", Inbox: "Inbox", "Phone Inbox": "Phone Inbox", Leads: "Leads",
  Customers: "Customers", Products: "Products", Quotes: "Quotes", Tasks: "Tasks", Calendar: "Calendar",
  AI: "AI", "Sales Operations": "Sales Operations", "Command Center": "Command Center", "Sales Analyst": "Sales Analyst",
  "Growth Control": "Growth Control", "Sales Cockpit": "Sales Cockpit", "Revenue Intelligence": "Revenue Intelligence", "AI History": "AI History",
  Approvals: "Approvals", Reports: "Reports", Operations: "Operations", Notifications: "Notifications", Usage: "Usage",
  Security: "Security", "Audit Logs": "Audit Logs", "API Layer": "API Layer", API: "API", Integrations: "Integrations",
  Account: "Account", Settings: "Settings", Billing: "Billing", Team: "Team", Permissions: "Permissions", Upgrade: "Upgrade plan",
};

export const navigationLabels: Record<Locale, Record<string, string>> = {
  tr: turkishNavigation,
  en: englishNavigation,
};

export function navLabel(locale: Locale, label: string): string { return navigationLabels[locale][label] ?? label; }
