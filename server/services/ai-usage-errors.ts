import type { QuoteAiErrorCode } from "@/lib/validations/quote-ai";

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return "";
}

export function getErrorCode(error: unknown) {
  if (
    error instanceof Error &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }

  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }

  return "";
}

export function getErrorDetails(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "details" in error &&
    typeof (error as { details?: unknown }).details === "string"
  ) {
    return (error as { details: string }).details;
  }

  return "";
}

export function getErrorHint(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "hint" in error &&
    typeof (error as { hint?: unknown }).hint === "string"
  ) {
    return (error as { hint: string }).hint;
  }

  return "";
}

export function serializeSupabaseError(error: unknown) {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: getErrorMessage(error) || String(error),
    code: getErrorCode(error) || undefined,
    details: getErrorDetails(error) || undefined,
    hint: getErrorHint(error) || undefined,
  };
}

export function mapReservationErrorCode(error: unknown): QuoteAiErrorCode {
  const message = getErrorMessage(error);

  if (/authentication required/i.test(message)) {
    return "unauthorized";
  }

  if (/workspace membership required|organization not found/i.test(message)) {
    return "workspace_access_error";
  }

  if (/usage limit/i.test(message)) {
    return "usage_limit_reached";
  }

  return "temporary_failure";
}

export function getReservationStatus(code: QuoteAiErrorCode) {
  switch (code) {
    case "unauthorized":
      return 401;
    case "workspace_access_error":
      return 403;
    case "usage_limit_reached":
      return 429;
    default:
      return 502;
  }
}
