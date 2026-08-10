import Link from "next/link";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="sticky top-0 z-50 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/80 px-6 backdrop-blur sm:px-10 lg:px-12">
        <Link href="/" className="font-semibold text-slate-950">
          FlowSales AI
        </Link>
        <nav className="flex items-center gap-6 text-sm font-medium text-slate-600">
          <Link href="/pricing" className="hover:text-slate-950">Fiyatlandırma</Link>
          <Link href="/login" className="hover:text-slate-950">Giriş Yap</Link>
        </nav>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="mt-auto border-t border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500 sm:px-10 lg:px-12">
        <div className="mb-4 flex justify-center gap-6">
          <Link href="/privacy" className="hover:text-slate-900">Gizlilik Politikası</Link>
          <Link href="/terms" className="hover:text-slate-900">Kullanım Koşulları</Link>
          <Link href="/pricing" className="hover:text-slate-900">Fiyatlandırma</Link>
        </div>
        <p>© {new Date().getFullYear()} FlowSales AI. Tüm hakları saklıdır.</p>
      </footer>
    </div>
  );
}
