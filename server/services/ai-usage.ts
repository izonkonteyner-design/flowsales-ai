import "server-only";

import {
  createQuoteAiServiceError,
} from "@/lib/validations/quote-ai";
import { getGeminiModel } from "@/server/services/ai";
import {
  mapReservationErrorCode,
  getReservationStatus,
  serializeSupabaseError,
} from "@/server/services/ai-usage-errors";

type SupabaseServerClient = {
  rpc: (
    procedure: string,
    params: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
};

export type QuoteAiUsageReservation = {
  usageEventId: string;
  remainingUsage: number;
};

type UsageReservationRpcRow = {
  usage_event_id: string;
  remaining_usage: number;
};

function logAiUsageDiagnostic(event: string, details: Record<string, unknown>) {
  console.error(`[quote-ai-usage] ${event}`, details);
}

function serializeError(error: unknown) {
  return serializeSupabaseError(error);
}

export { mapReservationErrorCode, serializeSupabaseError };

export async function reserveQuoteAiUsage(client: SupabaseServerClient, organizationId: string): Promise<QuoteAiUsageReservation> {
  const { data, error } = await client.rpc("reserve_quote_ai_usage", {
    target_org: organizationId,
    target_model: getGeminiModel(),
  });

  if (error) {
    const code = mapReservationErrorCode(error);
    const status = getReservationStatus(code);

    logAiUsageDiagnostic("reserveQuoteAiUsage failure", {
      code,
      status,
      supabaseError: serializeError(error),
    });

    throw createQuoteAiServiceError(code, status);
  }

  const reservation = Array.isArray(data) ? (data[0] as UsageReservationRpcRow | undefined) : (data as UsageReservationRpcRow | null | undefined);
  if (!reservation?.usage_event_id) {
    logAiUsageDiagnostic("reserveQuoteAiUsage returned no row", {
      organizationId,
    });
    throw createQuoteAiServiceError("temporary_failure", 502);
  }

  return {
    usageEventId: reservation.usage_event_id,
    remainingUsage: Number.isFinite(reservation.remaining_usage) ? reservation.remaining_usage : 0,
  };
}

export async function finalizeQuoteAiUsage(
  client: SupabaseServerClient,
  usageEventId: string,
  status: "succeeded" | "failed",
) {
  const { error } = await client.rpc("finalize_quote_ai_usage", {
    target_usage_event_id: usageEventId,
    target_status: status,
  });

  if (error) {
    logAiUsageDiagnostic("finalizeQuoteAiUsage failure", {
      status,
      supabaseError: serializeError(error),
    });
    return false;
  }

  return true;
}
