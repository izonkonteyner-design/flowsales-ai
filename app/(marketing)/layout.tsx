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
          <Link href="/pricing" className="hover:text-slate-950">Pricing</Link>
          <Link href="/login" className="hover:text-slate-950">Sign In</Link>
        </nav>
      </header>

      <div className="flex-1">
        {children}
      </div>

      <footer className="mt-auto border-t border-slate-200 bg-white py-10 px-6 sm:px-10 lg:px-12 text-center text-sm text-slate-500">
        <div className="flex justify-center gap-6 mb-4">
          <Link href="/privacy" className="hover:text-slate-900">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-slate-900">Terms of Service</Link>
          <Link href="/pricing" className="hover:text-slate-900">Pricing</Link>
        </div>
        <p>© {new Date().getFullYear()} FlowSales AI. All rights reserved.</p>
      </footer>
    </div>
  );
}
