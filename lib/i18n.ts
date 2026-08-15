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
    errorTitle: "Bir şeyler ters gitti", errorDescription: "Uygulamada beklenmeyen bir hata oluştu. Tekrar deneyebilir veya kontrol paneline dönebilirsiniz.",
    retry: "Tekrar dene", dashboard: "Kontrol Paneli",
  },
  en: {
    workspace: "Workspace", intelligence: "Intelligence", operations: "Operations", settings: "Settings",
    demoWorkspace: "Demo workspace", readOnlyPreview: "Read-only preview", liveWorkspace: "Live workspace",
    aiRevenueWorkspace: "AI revenue workspace", aiUsage: "AI usage", view: "View", viewAccount: "View account",
    searchPlaceholder: "Search leads...", search: "Search", aiCommand: "Command center",
    notifications: "Notifications", toggleTheme: "Toggle theme", logout: "Log out", openNavigation: "Open navigation",
    closeNavigation: "Close navigation", toggleSidebar: "Toggle sidebar", demoUser: "Demo user",
    errorTitle: "Something went wrong", errorDescription: "The application encountered an unexpected error. You can retry or return to the dashboard.",
    retry: "Retry", dashboard: "Dashboard",
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
  en: {
    Dashboard: "Dashboard", Inbox: "Inbox", "Phone Inbox": "Phone Inbox", Leads: "Leads",
    Customers: "Customers", Products: "Products", Quotes: "Quotes", Tasks: "Tasks", Calendar: "Calendar",
    AI: "AI", "Sales Operations": "Sales Operations", "Command Center": "Command Center", "Sales Analyst": "Sales Analyst",
    "Growth Control": "Growth Control", "Sales Cockpit": "Sales Cockpit", "Revenue Intelligence": "Revenue Intelligence", "AI History": "AI History",
    Approvals: "Approvals", Reports: "Reports", Operations: "Operations", Notifications: "Notifications", Usage: "Usage",
    Security: "Security", "Audit Logs": "Audit Logs", "API Layer": "API Layer", API: "API", Integrations: "Integrations",
    Account: "Account", Settings: "Settings", Billing: "Billing", Team: "Team", Permissions: "Permissions", Upgrade: "Upgrade plan",
  },
};

export function navLabel(locale: Locale, label: string): string { return navigationLabels[locale][label] ?? label; }
