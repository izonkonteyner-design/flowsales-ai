import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { FlashToast } from "@/components/shared/flash-toast";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { QuoteForm } from "@/components/quotes/quote-form";
import { updateQuoteAction } from "@/app/(app)/quotes/actions";
import { getQuoteFormData } from "@/server/services/quotes";

type EditQuotePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EditQuotePage({ params, searchParams }: EditQuotePageProps) {
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

  if (!data.quote) {
    return (
      <EmptyState
        title="Quote not found"
        description={data.error ?? "The requested quote cannot be loaded for editing."}
        actionHref="/quotes"
        actionLabel="Back to quotes"
      />
    );
  }

  return (
    <div className="space-y-6">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}

      <PageHeader
        eyebrow="Commercial"
        title={`Edit ${data.quote.quote_number}`}
        description="Update the stored snapshot while keeping organization-level permissions intact."
        actions={
          <Link
            href={`/quotes/${id}`}
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to quote
          </Link>
        }
      />

      <QuoteForm
        mode="edit"
        action={updateQuoteAction}
        quote={data.quote}
        leadOptions={data.leadOptions}
        customerOptions={data.customerOptions}
        productOptions={data.productOptions}
        defaultQuoteNumber={data.defaultQuoteNumber}
        canMutate={data.canMutate}
        redirectTo={redirectTo}
        readOnlyMessage={data.error ?? "Connect live Supabase data or create a real quote to edit this record."}
      />
    </div>
  );
}
