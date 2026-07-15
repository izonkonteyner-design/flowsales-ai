import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://flowsales.ai"),
  title: {
    default: "FlowSales AI",
    template: "%s | FlowSales AI",
  },
  description: "FlowSales AI is your AI sales employee for SMEs.",
  openGraph: {
    title: "FlowSales AI",
    description: "Your AI sales employee for SMEs.",
    url: "https://flowsales.ai",
    siteName: "FlowSales AI",
    type: "website",
  },
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
