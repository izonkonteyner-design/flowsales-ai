import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ jobId: z.string().uuid() });

function csvCell(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) return NextResponse.json({ error: "Invalid import job." }, { status: 400 });

  const client = await createSupabaseServerClient();
  if (!client) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data: memberships } = await client.from("organization_members").select("organization_id").eq("user_id", auth.user.id);
  const organizationIds = (memberships ?? []).map((membership) => membership.organization_id);
  const { data: job, error } = await client.from("import_jobs").select("id,organization_id,error_report").eq("id", parsed.data.jobId).in("organization_id", organizationIds).maybeSingle();
  if (error || !job) return NextResponse.json({ error: "Import report not found." }, { status: 404 });

  const report = Array.isArray(job.error_report) ? job.error_report : [];
  const headers = new Set<string>();
  for (const item of report) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const values = (item as { values?: unknown }).values;
      if (values && typeof values === "object" && !Array.isArray(values)) Object.keys(values).forEach((key) => headers.add(key));
    }
  }
  const sourceHeaders = [...headers];
  const lines = [
    ["row", "errors", ...sourceHeaders].map(csvCell).join(","),
    ...report.map((item) => {
      const record = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
      const values = record.values && typeof record.values === "object" && !Array.isArray(record.values) ? record.values as Record<string, unknown> : {};
      const errors = Array.isArray(record.errors) ? record.errors.join(" | ") : String(record.errors ?? "Unknown error");
      return [record.row ?? "", errors, ...sourceHeaders.map((header) => values[header] ?? "")].map(csvCell).join(",");
    }),
  ];

  return new NextResponse(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lead-import-errors-${job.id}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
