export const SUPPORTED_LOCALES = ["tr", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "tr";
export const LOCALE_COOKIE = "flowsales_locale";

export function normalizeLocale(value: string | null | undefined): Locale {
  return value === "en" ? "en" : "tr";
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
  },
  en: {
    workspace: "Workspace", intelligence: "Intelligence", operations: "Operations", settings: "Settings",
    demoWorkspace: "Demo workspace", readOnlyPreview: "Read-only preview", liveWorkspace: "Live workspace",
    aiRevenueWorkspace: "AI revenue workspace", aiUsage: "AI usage", view: "View", viewAccount: "View account",
    searchPlaceholder: "Search leads...", search: "Search", aiCommand: "Command center",
    notifications: "Notifications", toggleTheme: "Toggle theme", logout: "Log out", openNavigation: "Open navigation",
    closeNavigation: "Close navigation", toggleSidebar: "Toggle sidebar", demoUser: "Demo user",
  },
} as const;

export type CommonTranslationKey = keyof (typeof common)["tr"];
export function t(locale: Locale, key: CommonTranslationKey): string { return common[locale][key] ?? common.tr[key]; }

export const navigationLabels: Record<Locale, Record<string, string>> = {
  tr: {
    Dashboard: "Kontrol Paneli", Inbox: "Gelen Kutusu", "Phone Inbox": "Telefon Gelen Kutusu", Leads: "Potansiyel Müşteriler",
    Customers: "Müşteriler", Products: "Ürünler", Quotes: "Teklifler", Tasks: "Görevler", Calendar: "Takvim",
    AI: "Yapay Zekâ", "Sales Operations": "Satış Operasyonları", "Command Center": "Komuta Merkezi", "Sales Analyst": "Satış Analisti",
    "Growth Control": "Büyüme Kontrolü", "Sales Cockpit": "Satış Kokpiti", "Revenue Intelligence": "Gelir Zekâsı", "AI History": "YZ Geçmişi",
    Approvals: "Onaylar", Reports: "Raporlar", Operations: "Operasyonlar", Notifications: "Bildirimler", Usage: "Kullanım",
    Security: "Güvenlik", "Audit Logs": "Denetim Kayıtları", "API Layer": "API Katmanı", API: "API", Integrations: "Entegrasyonlar",
    Account: "Hesap", Settings: "Ayarlar", Billing: "Faturalandırma", Team: "Ekip", Permissions: "Yetkiler", Upgrade: "Planı Yükselt",
  },
  en: {},
};

export function navLabel(locale: Locale, label: string): string { return navigationLabels[locale][label] ?? label; }
