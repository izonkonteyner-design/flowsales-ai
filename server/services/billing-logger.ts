import { logger } from "@/lib/logger";

export function logBillingEvent(event: string, details: Record<string, unknown> = {}) {
  logger.info(event, { scope: "billing", ...details });
}

export function logBillingError(event: string, error: unknown, details: Record<string, unknown> = {}) {
  logger.error(event, error, { scope: "billing", ...details });
}
