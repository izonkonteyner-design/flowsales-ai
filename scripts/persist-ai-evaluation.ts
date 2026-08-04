import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { z } from "zod";

const reportSchema = z.object({
  suiteKey: z.string().min(1).max(200),
  promptVersion: z.string().min(1).max(100),
  model: z.string().min(1).max(200).nullable(),
  commitSha: z.string().min(7).max(100).nullable(),
  totalCases: z.number().int().nonnegative(),
  passedCases: z.number().int().nonnegative(),
  score: z.number().min(0).max(1),
  status: z.enum(["passed", "failed"]),
  results: z.array(z.unknown()),
});

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required to persist AI evaluation evidence.`);
  return value;
}

function normalizeSupabaseUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("SUPABASE_URL must use HTTPS.");
  if (!url.hostname.endsWith(".supabase.co") && !url.hostname.endsWith(".supabase.in")) {
    throw new Error("SUPABASE_URL must be a Supabase project URL.");
  }
  return url.origin;
}

async function main() {
  const reportPath = resolve(process.cwd(), process.env.AI_EVAL_REPORT ?? "artifacts/ai-evaluation-report.json");
  const report = reportSchema.parse(JSON.parse(await readFile(reportPath, "utf8")) as unknown);
  const supabaseUrl = normalizeSupabaseUrl(requiredEnvironment("SUPABASE_URL"));
  const serviceRoleKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  const commitSha = report.commitSha ?? process.env.GITHUB_SHA?.trim() ?? null;
  if (!commitSha) throw new Error("A commit SHA is required for persisted evaluation evidence.");

  const model = report.model ?? "unknown";
  const runKey = [report.suiteKey, report.promptVersion, model, commitSha].join(":");
  const payload = {
    run_key: runKey,
    suite_key: report.suiteKey,
    prompt_version: report.promptVersion,
    model,
    total_cases: report.totalCases,
    passed_cases: report.passedCases,
    score: report.score,
    status: report.status,
    commit_sha: commitSha,
    evidence: report,
  };

  const response = await fetch(`${supabaseUrl}/rest/v1/ai_evaluation_runs?on_conflict=run_key`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Unable to persist AI evaluation evidence (${response.status}): ${detail}`);
  }

  console.log(JSON.stringify({ persisted: true, runKey, status: report.status, score: report.score }));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unable to persist AI evaluation evidence.");
  process.exitCode = 1;
});
