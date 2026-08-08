"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createCalendarEvent } from "@/server/services/productivity";

const eventSchema = z.object({
  title: z.string().trim().min(2),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  event_type: z.enum(["call", "demo", "meeting", "delivery", "follow_up", "other"]),
  location: z.string().trim().max(200).optional(),
});

export async function createCalendarEventAction(formData: FormData): Promise<void> {
  const parsed = eventSchema.safeParse({
    title: formData.get("title"),
    starts_at: formData.get("starts_at"),
    ends_at: formData.get("ends_at"),
    event_type: formData.get("event_type"),
    location: formData.get("location") || "",
  });

  if (!parsed.success) {
    redirect("/calendar?toast=Etkinlik%20bilgilerini%20kontrol%20edin.&tone=danger");
  }

  let failureMessage: string | null = null;
  try {
    await createCalendarEvent({
      title: parsed.data.title,
      startsAt: new Date(parsed.data.starts_at).toISOString(),
      endsAt: new Date(parsed.data.ends_at).toISOString(),
      eventType: parsed.data.event_type,
      location: parsed.data.location || null,
    });
  } catch (error) {
    failureMessage = error instanceof Error ? error.message : "Etkinlik oluşturulamadı.";
  }

  if (failureMessage) {
    redirect(`/calendar?toast=${encodeURIComponent(failureMessage)}&tone=danger`);
  }

  revalidatePath("/calendar");
  redirect("/calendar?toast=Etkinlik%20oluşturuldu.&tone=success");
}
