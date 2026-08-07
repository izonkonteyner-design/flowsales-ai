import { spawn } from "node:child_process";
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

type EvaluationPayload = {
  run_key: string;
  suite_key: string;
  prompt_version: string;
  model: string;
  total_cases: number;
  passed_cases: number;
  score: number;
  status: "passed" | "failed";
  commit_sha: string;
  evidence: z.infer<typeof reportSchema>;
};

function environment(name: string) {
  return process.env[name]?.trim() || null;
}

function normalizeSupabaseUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("SUPABASE_URL must use HTTPS.");
  if (!url.hostname.endsWith(".supabase.co") && !url.hostname.endsWith(".supabase.in")) {
    throw new Error("SUPABASE_URL must be a Supabase project URL.");
  }
  return url.origin;
}

function normalizeDatabaseUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("Production database URL must use postgres:// or postgresql://.");
  }
  if (!url.hostname || !url.username || !url.pathname.slice(1)) {
    throw new Error("Production database URL is incomplete.");
  }
  return url;
}

function base64(value: string) {
  return Buffer.from(value, "utf8").toString("base64");
}

async function persistViaRest(payload: EvaluationPayload, supabaseUrl: string, serviceRoleKey: string) {
  const response = await fetch(`${normalizeSupabaseUrl(supabaseUrl)}/rest/v1/ai_evaluation_runs?on_conflict=run_key`, {
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
}

async function persistViaPostgres(payload: EvaluationPayload, rawDatabaseUrl: string) {
  const databaseUrl = normalizeDatabaseUrl(rawDatabaseUrl);
  const evidence = base64(JSON.stringify(payload.evidence));
  const sql = `
insert into public.ai_evaluation_runs (
  run_key, suite_key, prompt_version, model, total_cases, passed_cases,
  score, status, commit_sha, evidence
) values (
  convert_from(decode('${base64(payload.run_key)}', 'base64'), 'UTF8'),
  convert_from(decode('${base64(payload.suite_key)}', 'base64'), 'UTF8'),
  convert_from(decode('${base64(payload.prompt_version)}', 'base64'), 'UTF8'),
  convert_from(decode('${base64(payload.model)}', 'base64'), 'UTF8'),
  ${payload.total_cases},
  ${payload.passed_cases},
  ${payload.score},
  convert_from(decode('${base64(payload.status)}', 'base64'), 'UTF8'),
  convert_from(decode('${base64(payload.commit_sha)}', 'base64'), 'UTF8'),
  convert_from(decode('${evidence}', 'base64'), 'UTF8')::jsonb
)
on conflict (run_key) do update set
  suite_key = excluded.suite_key,
  prompt_version = excluded.prompt_version,
  model = excluded.model,
  total_cases = excluded.total_cases,
  passed_cases = excluded.passed_cases,
  score = excluded.score,
  status = excluded.status,
  commit_sha = excluded.commit_sha,
  evidence = excluded.evidence;
`;

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1"], {
      env: {
        ...process.env,
        PGHOST: databaseUrl.hostname,
        PGPORT: databaseUrl.port || "5432",
        PGUSER: decodeURIComponent(databaseUrl.username),
        PGPASSWORD: decodeURIComponent(databaseUrl.password),
        PGDATABASE: decodeURIComponent(databaseUrl.pathname.slice(1)),
        PGSSLMODE: databaseUrl.searchParams.get("sslmode") || "require",
      },
      stdio: ["pipe", "ignore", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 2000) stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => rejectPromise(new Error(`Unable to start PostgreSQL client: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`Unable to persist AI evaluation evidence through PostgreSQL: ${stderr.slice(0, 500).trim() || `psql exited ${code}`}`));
    });
    child.stdin.end(sql);
  });
}

async function main() {
  const reportPath = resolve(process.cwd(), process.env.AI_EVAL_REPORT ?? "artifacts/ai-evaluation-report.json");
  const report = reportSchema.parse(JSON.parse(await readFile(reportPath, "utf8")) as unknown);
  const commitSha = report.commitSha ?? environment("GITHUB_SHA");
  if (!commitSha) throw new Error("A commit SHA is required for persisted evaluation evidence.");

  const model = report.model ?? "unknown";
  const runKey = [report.suiteKey, report.promptVersion, model, commitSha].join(":");
  const payload: EvaluationPayload = {
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

  const supabaseUrl = environment("SUPABASE_URL");
  const serviceRoleKey = environment("SUPABASE_SERVICE_ROLE_KEY");
  const databaseUrl = environment("SUPABASE_DB_URL") ?? environment("SUPABASE_DATABASE_URL") ?? environment("DATABASE_URL");

  if (supabaseUrl && serviceRoleKey) {
    await persistViaRest(payload, supabaseUrl, serviceRoleKey);
  } else if (databaseUrl) {
    await persistViaPostgres(payload, databaseUrl);
  } else {
    throw new Error(
      "AI evaluation persistence requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY or a production PostgreSQL URI.",
    );
  }

  console.log(JSON.stringify({ persisted: true, runKey, status: report.status, score: report.score }));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unable to persist AI evaluation evidence.");
  process.exitCode = 1;
});
