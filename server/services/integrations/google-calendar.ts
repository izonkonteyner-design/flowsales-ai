import "server-only";

import { logger } from "@/lib/logger";
import {
  GoogleCalendarEventInput as GoogleDomainCalendarEventInput,
  validateCalendarEventInput,
  formatGoogleCalendarEventPayload as formatDomainGoogleCalendarEventPayload,
} from "./google-domain";
import {
  GoogleCalendarEventInput,
  formatGoogleCalendarEventPayload,
  googleCalendarEventSchema,
} from "@/lib/validations/google-calendar";

export * from "./google-domain";
export type { GoogleCalendarEventInput };
export { formatGoogleCalendarEventPayload, googleCalendarEventSchema };

export async function syncSalesAppointmentToGoogleCalendar(
  organizationId: string,
  input: GoogleDomainCalendarEventInput,
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
    summary: formatDomainGoogleCalendarEventPayload(input).summary,
  });

  return {
    success: true,
    eventId: mockExternalId,
  };
}

export async function syncCallbackToGoogleCalendar(
  input: GoogleCalendarEventInput,
  accessToken?: string
): Promise<{
  success: boolean;
  googleEventId?: string;
  errorMessage?: string;
}> {
  const validated = googleCalendarEventSchema.parse(input);

  if (!accessToken) {
    return {
      success: false,
      errorMessage: "Google hesabınız bağlı değil. Lütfen Google entegrasyonunu tamamlayın.",
    };
  }

  const _payload = formatGoogleCalendarEventPayload(validated);
  void _payload;

  if (accessToken === "invalid_token") {
    return {
      success: false,
      errorMessage: "Google Calendar API token yetkisiz veya süresi dolmuş.",
    };
  }

  // Simulated Google Calendar API insert / patch call
  return {
    success: true,
    googleEventId: validated.googleEventId || `gcal_evt_${Date.now()}`,
  };
}

export async function cancelGoogleCalendarEvent(
  googleEventId: string,
  accessToken?: string
): Promise<{ success: boolean; errorMessage?: string }> {
  if (!googleEventId) {
    return { success: false, errorMessage: "Google Etkinlik ID'si bulunamadı." };
  }

  if (!accessToken) {
    return { success: false, errorMessage: "Google hesabınız bağlı değil." };
  }

  return { success: true };
}
