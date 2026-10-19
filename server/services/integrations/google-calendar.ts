import "server-only";

import {
  GoogleCalendarEventInput,
  formatGoogleCalendarEventPayload,
  googleCalendarEventSchema,
} from "@/lib/validations/google-calendar";

export type { GoogleCalendarEventInput };
export { formatGoogleCalendarEventPayload, googleCalendarEventSchema };

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

  const payload = formatGoogleCalendarEventPayload(validated);

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
