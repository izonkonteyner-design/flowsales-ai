import type { Metadata } from "next";
import Link from "next/link";
import { MetaAccountSelector } from "@/components/settings/meta-account-selector";

export const metadata: Metadata = { title: "Select Meta account — FlowSales AI" };

export default async function MetaAccountSelectPage({ searchParams }: { searchParams: Promise<{ provider?: string }> }) {
  const params = await searchParams;
  const provider = params.provider === "instagram" ? "instagram" : "facebook";
  return <div className="mx-auto max-w-2xl space-y-6">
    <div>
      <Link href="/settings/integrations" className="text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">← Back to integrations</Link>
      <h1 className="mt-3 text-2xl font-bold text-slate-950 dark:text-white">Select {provider === "instagram" ? "Instagram" : "Facebook Page"} account</h1>
      <p className="mt-2 text-sm text-slate-500">FlowSales found more than one eligible account. Choose the exact account to bind to this workspace. FlowSales never silently picks the first account.</p>
    </div>
    <MetaAccountSelector provider={provider} />
  </div>;
}
