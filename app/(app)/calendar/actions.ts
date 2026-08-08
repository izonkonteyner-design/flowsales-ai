"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createCalendarEvent } from "@/server/services/productivity";

const eventSchema = z.object({
  title: z.string().trim().min(2),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  event_type: z.enum(["call", "demo", "meeting", "delivery", "follow_up", "other"]),
  location: z.string().trim().max(200).optional(),
});

export async function createCalendarEventAction(formData: FormData) {
  const parsed = eventSchema.safeParse({
    title: formData.get("title"),
    starts_at: formData.get("starts_at"),
    ends_at: formData.get("ends_at"),
    event_type: formData.get("event_type"),
    location: formData.get("location") || "",
  });
  if (!parsed.success) return { ok: false, message: "Etkinlik bilgilerini kontrol edin." };
  try {
    await createCalendarEvent({
      title: parsed.data.title,
      startsAt: new Date(parsed.data.starts_at).toISOString(),
      endsAt: new Date(parsed.data.ends_at).toISOString(),
      eventType: parsed.data.event_type,
      location: parsed.data.location || null,
    });
    revalidatePath("/calendar");
    return { ok: true, message: "Etkinlik oluşturuldu." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Etkinlik oluşturulamadı." };
  }
}
