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
  timeZone: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
}).refine(
  (val) => new Date(val.endTime).getTime() > new Date(val.startTime).getTime(),
  { message: "Bitiş zamanı başlangıç zamanından sonra olmalıdır" }
);

export type GoogleCalendarEventInput = z.infer<typeof googleCalendarEventSchema>;

export function formatGoogleCalendarEventPayload(input: GoogleCalendarEventInput) {
  const tz = input.timeZone || "UTC";
  const syncKey =
    input.idempotencyKey ||
    (input.taskId ? `task_${input.workspaceId}_${input.taskId}` : "") ||
    (input.leadId ? `lead_${input.workspaceId}_${input.leadId}_${input.startTime}` : "");

  const privateProps: Record<string, string> = {
    flowsales_workspace_id: input.workspaceId,
    flowsales_lead_id: input.leadId || "",
    flowsales_task_id: input.taskId || "",
  };

  if (syncKey) {
    privateProps.flowsales_sync_key = syncKey;
  }

  return {
    summary: input.summary,
    description: input.description || "",
    start: {
      dateTime: input.startTime,
      timeZone: tz,
    },
    end: {
      dateTime: input.endTime,
      timeZone: tz,
    },
    location: input.location || "",
    extendedProperties: {
      private: privateProps,
    },
  };
}
