import { logger } from "@/lib/logger";

export function logAiEvent(event: string, context: Record<string, unknown> = {}) {
  // Strip raw prompts or model responses to prevent leaking PII if accidentally logged
  const safeContext = { ...context };
  
  if (safeContext.prompt) {
    safeContext.prompt = "[REDACTED_PROMPT]";
  }
  
  if (safeContext.modelResponse) {
    safeContext.modelResponse = "[REDACTED_MODEL_RESPONSE]";
  }

  if (safeContext.userMessage) {
    safeContext.userMessage = "[REDACTED_USER_MESSAGE]";
  }

  logger.info(event, safeContext);
}

export function logAiError(event: string, error: unknown, context: Record<string, unknown> = {}) {
  const safeContext = { ...context };
  
  if (safeContext.prompt) {
    safeContext.prompt = "[REDACTED_PROMPT]";
  }

  if (safeContext.modelResponse) {
    safeContext.modelResponse = "[REDACTED_MODEL_RESPONSE]";
  }

  if (safeContext.userMessage) {
    safeContext.userMessage = "[REDACTED_USER_MESSAGE]";
  }

  logger.error(event, error, safeContext);
}
