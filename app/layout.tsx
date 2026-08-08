import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";

import { LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";

export const metadata: Metadata = {
  metadataBase: new URL("https://flowsales.ai"),
  title: {
    default: "FlowSales AI",
    template: "%s | FlowSales AI",
  },
  description: "KOBİ'ler için yapay zekâ destekli CRM, satış ve çok kanallı müşteri iletişimi çalışma alanı.",
  alternates: { canonical: "https://flowsales.ai" },
  openGraph: {
    title: "FlowSales AI",
    description: "KOBİ'ler için yapay zekâ destekli CRM ve satış çalışma alanı.",
    url: "https://flowsales.ai",
    siteName: "FlowSales AI",
    type: "website",
    locale: "tr_TR",
    alternateLocale: ["en_US"],
  },
  twitter: {
    card: "summary_large_image",
    title: "FlowSales AI",
    description: "KOBİ'ler için yapay zekâ destekli CRM ve satış çalışma alanı.",
  },
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const initializeTheme = `
  try {
    const stored = localStorage.getItem("flowsales-theme");
    const theme = stored === "light" || stored === "dark" ? stored : "dark";
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("flowsales-theme", theme);
  } catch {}
`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value);

  return (
    <html lang={locale} className="dark h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: initializeTheme }} />
      </head>
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
