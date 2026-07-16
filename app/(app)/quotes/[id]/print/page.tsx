import { EmptyState } from "@/components/shared/empty-state";
import { QuoteDocument } from "@/components/quotes/quote-document";
import { QuoteDocumentToolbar } from "@/components/quotes/quote-document-toolbar";
import { getQuoteDocumentData } from "@/server/services/quote-document";

type QuotePrintPageProps = {
  params: Promise<{ id: string }>;
};

export default async function QuotePrintPage({ params }: QuotePrintPageProps) {
  const { id } = await params;
  const result = await getQuoteDocumentData(id);

  if (!result.ok) {
    return (
      <div className="min-h-screen bg-slate-100 p-4 text-slate-950 print:bg-white print:p-0">
        <EmptyState
          title={result.status === 400 ? "Invalid quote request" : result.status === 403 ? "Access denied" : "Quote not found"}
          description={result.message}
          actionHref={`/quotes/${id}`}
          actionLabel="Back to quote"
        />
      </div>
    );
  }

  const document = result.document;

  return (
    <div className="min-h-screen bg-slate-100 p-4 text-slate-950 print:bg-white print:p-0">
      <div className="print-page-shell mx-auto max-w-[calc(210mm+2rem)]">
        <QuoteDocumentToolbar quoteId={document.id} pdfHref={`/api/quotes/${document.id}/pdf`} backHref={`/quotes/${document.id}`} />
        <QuoteDocument document={document} />
      </div>
    </div>
  );
}
