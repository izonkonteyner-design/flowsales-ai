import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { createQuoteAction } from "@/app/(app)/quotes/actions";
import { QuoteForm } from "@/components/quotes/quote-form";
import { FlashToast } from "@/components/shared/flash-toast";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { getQuoteFormData } from "@/server/services/quotes";

type NewQuotePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewQuotePage({ searchParams }: NewQuotePageProps) {
  const rawSearchParams = await searchParams;
  const data = await getQuoteFormData();
  const redirectTo = typeof rawSearchParams.redirect_to === "string" && rawSearchParams.redirect_to.startsWith("/")
    ? rawSearchParams.redirect_to
    : "/quotes";
  const toastMessage = typeof rawSearchParams.toast === "string" ? rawSearchParams.toast : "";
  const toastTone =
    rawSearchParams.tone === "danger" || rawSearchParams.tone === "warning" || rawSearchParams.tone === "info"
      ? rawSearchParams.tone
      : "success";
  const editable = data.context.mode === "live" && (data.context.role === "owner" || data.context.role === "admin" || data.context.role === "sales");

  return (
    <div className="space-y-6">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}

      <PageHeader
        eyebrow="Commercial"
        title="New quote"
        description="Draft professional quotes by pairing a lead with approved products."
        actions={
          <Link
            href="/quotes"
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to quotes
          </Link>
        }
      />

      {data.error ? (
        <EmptyState title="Unable to load quote data" description={data.error} actionHref="/quotes" actionLabel="Back to quotes" />
      ) : (
        <SectionCard title="Quote details" description="Use the validated form to build the quote and recalculate totals server-side.">
          <QuoteForm
            action={createQuoteAction}
            redirectTo={redirectTo}
            leadOptions={data.leadOptions}
            productOptions={data.productOptions}
            nextQuoteNumber={data.nextQuoteNumber}
            submitLabel="Create quote"
            editable={editable}
            restrictionMessage={editable ? undefined : "Connect live Supabase data or create a real quote to edit this record."}
          />
        </SectionCard>
      )}
    </div>
  );
}
