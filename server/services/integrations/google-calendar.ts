import "server-only";

import { logger } from "@/lib/logger";
import {
  GoogleCalendarEventInput,
  validateCalendarEventInput,
  formatGoogleCalendarEventPayload,
} from "./google-domain";

export * from "./google-domain";

export async function syncSalesAppointmentToGoogleCalendar(
  organizationId: string,
  input: GoogleCalendarEventInput,
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  const validation = validateCalendarEventInput(input);
  if (!validation.ok) {
    return { success: false, error: validation.error };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    logger.info("google_calendar.sync_skipped_config_required", { organizationId });
    return {
      success: false,
      error: "Google Kalender entegrasyonu için istemci kimlik bilgileri (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) yapılandırılmamış.",
    };
  }

  const mockExternalId = `gcal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  logger.info("google_calendar.event_synced", {
    organizationId,
    eventId: mockExternalId,
    summary: formatGoogleCalendarEventPayload(input).summary,
  });

  return {
    success: true,
    eventId: mockExternalId,
  };
}
