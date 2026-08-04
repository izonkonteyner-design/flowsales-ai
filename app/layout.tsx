import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://flowsales.ai"),
  title: {
    default: "FlowSales AI",
    template: "%s | FlowSales AI",
  },
  description:
    "FlowSales AI is a premium AI CRM for SMEs selling containers, prefabricated buildings, tiny houses, and related products.",
  alternates: {
    canonical: "https://flowsales.ai",
  },
  openGraph: {
    title: "FlowSales AI",
    description:
      "A premium AI CRM and sales workspace for SMEs selling industrial and modular products.",
    url: "https://flowsales.ai",
    siteName: "FlowSales AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FlowSales AI",
    description:
      "A premium AI CRM and sales workspace for SMEs selling modular and prefabricated products.",
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: initializeTheme }} />
      </head>
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
