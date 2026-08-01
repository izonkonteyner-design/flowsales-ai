"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseLeadCsv } from "@/server/services/csv-import";

const importSchema = z.object({
  organizationId: z.string().uuid(),
  csv: z.string().min(1).max(5_000_000),
});

export async function importLeadsAction(formData: FormData) {
  const parsed = importSchema.safeParse({
    organizationId: formData.get("organizationId"),
    csv: formData.get("csv"),
  });
  if (!parsed.success) redirect("/onboarding/import?tone=danger&toast=Invalid+CSV+request");

  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: allowed, error: permissionError } = await client.rpc("has_org_permission", {
    p_organization_id: parsed.data.organizationId,
    p_permission: "import_data",
  });
  if (permissionError || allowed !== true) redirect("/onboarding/import?tone=danger&toast=Import+permission+required");

  const { data: isDemo } = await client.rpc("is_demo_organization", { p_organization_id: parsed.data.organizationId });
  if (isDemo === true) redirect("/onboarding/import?tone=danger&toast=Demo+workspace+is+read-only");

  const result = parseLeadCsv(parsed.data.csv);
  const { data: job, error: jobError } = await client.from("import_jobs").insert({
    organization_id: parsed.data.organizationId,
    actor_id: auth.user.id,
    entity_type: "leads",
    status: "processing",
    total_rows: result.accepted.length + result.rejected.length,
    rejected_rows: result.rejected.length,
    error_report: result.rejected,
  }).select("id").single();
  if (jobError) throw new Error(`Unable to start import: ${jobError.message}`);

  const rows = result.accepted.map((row) => ({
    organization_id: parsed.data.organizationId,
    full_name: row.full_name,
    email: row.email || null,
    phone: row.phone || null,
    company: row.company || null,
    source: row.source || "CSV Import",
    status: row.status || "new",
  }));
  const { error: insertError } = rows.length ? await client.from("leads").insert(rows) : { error: null };
  await client.from("import_jobs").update({
    status: insertError ? "failed" : "completed",
    imported_rows: insertError ? 0 : rows.length,
    completed_at: new Date().toISOString(),
    error_report: insertError ? [...result.rejected, { row: 0, errors: [insertError.message] }] : result.rejected,
  }).eq("id", job.id).eq("organization_id", parsed.data.organizationId);

  if (insertError) redirect("/onboarding/import?tone=danger&toast=Import+failed");
  redirect(`/onboarding/import?tone=success&toast=${encodeURIComponent(`${rows.length} leads imported; ${result.rejected.length} rejected`)}`);
}
