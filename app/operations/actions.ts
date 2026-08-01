"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const resolutionSchema = z.object({
  organizationId: z.string().uuid(),
  alertKey: z.string().trim().min(3).max(300),
  note: z.string().trim().max(1000).optional(),
});

export async function resolveOperationalAlertAction(formData: FormData) {
  const input = resolutionSchema.parse({
    organizationId: formData.get("organizationId"),
    alertKey: formData.get("alertKey"),
    note: formData.get("note") || undefined,
  });
  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");

  const { error } = await client.rpc("resolve_operational_alert", {
    p_organization_id: input.organizationId,
    p_alert_key: input.alertKey,
    p_note: input.note ?? null,
  });
  if (error) throw new Error(`Unable to resolve operational alert: ${error.message}`);
  revalidatePath("/operations");
}
