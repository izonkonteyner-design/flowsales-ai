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
  icons: [
    { rel: "icon", url: "/favicon.ico" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
