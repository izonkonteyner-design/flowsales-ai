import { getQuoteDocumentData } from "@/server/services/quote-document";
import { buildQuotePdfResponse } from "@/server/services/quote-pdf";

type QuotePdfRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: QuotePdfRouteContext) {
  const { id } = await context.params;
  const result = await getQuoteDocumentData(id);

  if (!result.ok) {
    return new Response(JSON.stringify({ message: result.message }), {
      status: result.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  try {
    return await buildQuotePdfResponse(result.document);
  } catch {
    return new Response(JSON.stringify({ message: "Unable to generate quote PDF." }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}

