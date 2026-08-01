"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseLeadCsv, type LeadColumnMapping } from "@/server/services/csv-import";

const mappingSchema = z.object({
  full_name: z.string().max(500).optional(),
  email: z.string().max(500).optional(),
  phone: z.string().max(500).optional(),
  company: z.string().max(500).optional(),
  source: z.string().max(500).optional(),
  status: z.string().max(500).optional(),
}).strict();

const importSchema = z.object({
  organizationId: z.string().uuid(),
  csv: z.string().min(1).max(5_000_000),
  mapping: z.string().max(10_000).transform((value, context) => {
    try {
      return mappingSchema.parse(JSON.parse(value)) as LeadColumnMapping;
    } catch {
      context.addIssue({ code: "custom", message: "Invalid column mapping." });
      return z.NEVER;
    }
  }),
});

function importRedirect(message: string, tone: "success" | "danger", jobId?: string): never {
  const params = new URLSearchParams({ toast: message, tone });
  if (jobId) params.set("jobId", jobId);
  redirect(`/onboarding/import?${params.toString()}`);
}

export async function importLeadsAction(formData: FormData) {
  const parsed = importSchema.safeParse({
    organizationId: formData.get("organizationId"),
    csv: formData.get("csv"),
    mapping: formData.get("mapping"),
  });
  if (!parsed.success) importRedirect("Invalid CSV or column mapping request.", "danger");

  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: allowed, error: permissionError } = await client.rpc("has_org_permission", {
    p_organization_id: parsed.data.organizationId,
    p_permission: "import_data",
  });
  if (permissionError || allowed !== true) importRedirect("Import permission required.", "danger");

  const { data: isDemo } = await client.rpc("is_demo_organization", { p_organization_id: parsed.data.organizationId });
  if (isDemo === true) importRedirect("Demo workspace is read-only.", "danger");

  let result: ReturnType<typeof parseLeadCsv>;
  try {
    result = parseLeadCsv(parsed.data.csv, parsed.data.mapping);
  } catch (error) {
    importRedirect(error instanceof Error ? error.message : "CSV validation failed.", "danger");
  }

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
    error_report: insertError
      ? [...result.rejected, { row: 0, errors: [insertError.message], values: {} }]
      : result.rejected,
  }).eq("id", job.id).eq("organization_id", parsed.data.organizationId);

  if (insertError) importRedirect("Import failed. Download the error report for details.", "danger", job.id);
  importRedirect(`${rows.length} leads imported; ${result.rejected.length} rejected.`, "success", job.id);
}
