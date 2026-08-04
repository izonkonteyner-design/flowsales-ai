"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const markSchema = z.object({ notificationId: z.string().uuid() });

export async function markNotificationReadAction(formData: FormData) {
  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");
  const input = markSchema.parse({ notificationId: formData.get("notificationId") });
  const { error } = await client.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", input.notificationId).eq("user_id", auth.user.id);
  if (error) throw new Error(`Unable to mark notification: ${error.message}`);
  revalidatePath("/notifications");
}

export async function markAllNotificationsReadAction() {
  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");
  const { error } = await client.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", auth.user.id).is("read_at", null);
  if (error) throw new Error(`Unable to mark notifications: ${error.message}`);
  revalidatePath("/notifications");
}
