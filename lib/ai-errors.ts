export class AiError extends Error {
  constructor(
    message: string,
    public readonly code: "AI_NOT_CONFIGURED" | "AI_TRANSIENT" | "AI_PERMANENT",
    public readonly statusCode: number,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "AiError";
  }

  static notConfigured(): AiError {
    return new AiError(
      "AI service is not configured. Please contact your administrator.",
      "AI_NOT_CONFIGURED",
      503
    );
  }

  static transient(message: string, cause?: unknown): AiError {
    return new AiError(message, "AI_TRANSIENT", 502, cause);
  }

  static permanent(message: string, cause?: unknown): AiError {
    return new AiError(message, "AI_PERMANENT", 500, cause);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
    };
  }
}

export function isAiError(error: unknown): error is AiError {
  return error instanceof AiError;
}

export function classifyAiError(error: unknown): AiError {
  if (error instanceof AiError) {
    return error;
  }

  if (error instanceof Error) {
    // Check for API key / configuration errors
    if (
      /not configured|missing.*key|invalid.*key|unauthorized|authentication/i.test(
        error.message
      )
    ) {
      return AiError.notConfigured();
    }

    // Check for rate limiting / transient errors (429, 5xx)
    if (
      /rate.?limit|too many requests|429|5\d\d|network|timeout|econnrefused|etimedout/i.test(
        error.message
      )
    ) {
      return AiError.transient("AI service temporarily unavailable. Please try again.", error);
    }

    // Check for model/config errors (permanent)
    if (
      /model.*not found|invalid model|no longer available|unsupported model/i.test(
        error.message
      )
    ) {
      return AiError.permanent("AI model configuration error. Please contact support.", error);
    }
  }

  // Default to transient for unknown errors
  return AiError.transient("An unexpected error occurred. Please try again.", error);
}