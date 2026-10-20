import { z } from "zod";

export const googleCalendarEventSchema = z.object({
  workspaceId: z.string().uuid("Geçerli bir workspace_id gerekli"),
  leadId: z.string().uuid().optional().nullable(),
  taskId: z.string().uuid().optional().nullable(),
  summary: z.string().trim().min(1, "Etkinlik başlığı boş olamaz"),
  description: z.string().trim().optional(),
  startTime: z.string().datetime("Geçerli ISO başlangıç tarihi gerekli"),
  endTime: z.string().datetime("Geçerli ISO bitiş tarihi gerekli"),
  location: z.string().optional(),
  googleEventId: z.string().optional().nullable(),
});

export type GoogleCalendarEventInput = z.infer<typeof googleCalendarEventSchema>;

export function formatGoogleCalendarEventPayload(input: GoogleCalendarEventInput) {
  return {
    summary: input.summary,
    description: input.description || "",
    start: {
      dateTime: input.startTime,
      timeZone: "UTC",
    },
    end: {
      dateTime: input.endTime,
      timeZone: "UTC",
    },
    location: input.location || "",
    extendedProperties: {
      private: {
        flowsales_workspace_id: input.workspaceId,
        flowsales_lead_id: input.leadId || "",
        flowsales_task_id: input.taskId || "",
      },
    },
  };
}
