import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { updateQuoteAction } from "@/app/(app)/quotes/actions";
import { QuoteForm } from "@/components/quotes/quote-form";
import { FlashToast } from "@/components/shared/flash-toast";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { getQuoteFormData } from "@/server/services/quotes";

type QuoteEditPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function QuoteEditPage({ params, searchParams }: QuoteEditPageProps) {
  const [{ id }, rawSearchParams] = await Promise.all([params, searchParams]);
  const data = await getQuoteFormData(id);
  const redirectTo = typeof rawSearchParams.redirect_to === "string" && rawSearchParams.redirect_to.startsWith("/")
    ? rawSearchParams.redirect_to
    : `/quotes/${id}`;
  const toastMessage = typeof rawSearchParams.toast === "string" ? rawSearchParams.toast : "";
  const toastTone =
    rawSearchParams.tone === "danger" || rawSearchParams.tone === "warning" || rawSearchParams.tone === "info"
      ? rawSearchParams.tone
      : "success";
  const editable = data.context.mode === "live" && (data.context.role === "owner" || data.context.role === "admin" || data.context.role === "sales");

  if (data.error && !data.quote) {
    return (
      <div className="space-y-6">
        {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}
        <PageHeader
          eyebrow="Commercial"
          title="Edit quote"
          description="Adjust the quote details before sending it back to the customer."
          actions={
            <Link href="/quotes" className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          }
        />
        <EmptyState title="Quote not available" description={data.error} actionHref="/quotes" actionLabel="Back to quotes" />
      </div>
    );
  }

  if (!data.quote) {
    return null;
  }

  return (
    <div className="space-y-6">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}

      <PageHeader
        eyebrow="Commercial"
        title={`Edit ${data.quote.quote_number}`}
        description="Adjust the quote details before sending it back to the customer."
        actions={
          <Link href={`/quotes/${data.quote.id}`} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" />
            Back to quote
          </Link>
        }
      />

      <SectionCard title="Quote editor" description="This foundation keeps the layout ready for a server-backed update flow.">
        <QuoteForm
          action={updateQuoteAction}
          redirectTo={redirectTo}
          leadOptions={data.leadOptions}
          productOptions={data.productOptions}
          quote={data.quote}
          quoteId={data.quote.id}
          nextQuoteNumber={data.quote.quote_number}
          submitLabel="Save changes"
          editable={editable}
          restrictionMessage={editable ? undefined : "Connect live Supabase data or create a real quote to edit this record."}
        />
      </SectionCard>
    </div>
  );
}
