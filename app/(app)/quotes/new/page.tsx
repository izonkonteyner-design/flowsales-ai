import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { FlashToast } from "@/components/shared/flash-toast";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { QuoteForm } from "@/components/quotes/quote-form";
import { createQuoteAction } from "@/app/(app)/quotes/actions";
import { getQuoteFormData } from "@/server/services/quotes";

type NewQuotePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewQuotePage({ searchParams }: NewQuotePageProps) {
  const rawSearchParams = await searchParams;
  const leadId = typeof rawSearchParams.lead_id === "string" && rawSearchParams.lead_id.trim() ? rawSearchParams.lead_id.trim() : null;
  const customerId = typeof rawSearchParams.customer_id === "string" && rawSearchParams.customer_id.trim() ? rawSearchParams.customer_id.trim() : null;
  const data = await getQuoteFormData(undefined, { leadId, customerId });
  const redirectTo = typeof rawSearchParams.redirect_to === "string" && rawSearchParams.redirect_to.startsWith("/")
    ? rawSearchParams.redirect_to
    : "/quotes";
  const toastMessage = typeof rawSearchParams.toast === "string" ? rawSearchParams.toast : "";
  const toastTone =
    rawSearchParams.tone === "danger" || rawSearchParams.tone === "warning" || rawSearchParams.tone === "info"
      ? rawSearchParams.tone
      : "success";

  if (data.error) {
    return (
      <EmptyState
        title="Unable to open quote form"
        description={data.error}
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
        title="New quote"
        description="Create a secure commercial proposal with live pricing and manual line items."
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

      <QuoteForm
        mode="create"
        action={createQuoteAction}
        quote={null}
        leadOptions={data.leadOptions}
        customerOptions={data.customerOptions}
        productOptions={data.productOptions}
        defaultQuoteNumber={data.defaultQuoteNumber}
        initialLeadId={data.initialLeadId}
        initialCustomerId={data.initialCustomerId}
        recipientType={data.recipientType}
        recipientMessage={data.recipientMessage}
        canMutate={data.canMutate}
        redirectTo={redirectTo}
        readOnlyMessage={data.error ?? "Connect live Supabase data or create a real quote to edit this record."}
      />
    </div>
  );
}
