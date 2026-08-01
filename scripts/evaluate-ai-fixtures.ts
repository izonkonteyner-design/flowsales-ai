import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { aiEvaluationCaseSchema, evaluateAiCase, summarizeAiEvaluation } from "../server/services/ai-sales-agent/evaluation";
import { AI_PROMPT_VERSION } from "../server/services/ai-sales-agent/prompts";

const fixturePath = resolve(process.cwd(), process.env.AI_EVAL_FIXTURES ?? "evals/ai-regression-cases.json");
const reportPath = resolve(process.cwd(), process.env.AI_EVAL_REPORT ?? "artifacts/ai-evaluation-report.json");
const raw = JSON.parse(await readFile(fixturePath, "utf8")) as unknown;
if (!Array.isArray(raw)) throw new Error("AI evaluation fixture must be an array.");

const cases = raw.map((item) => aiEvaluationCaseSchema.parse(item));
const results = cases.map(evaluateAiCase);
const summary = summarizeAiEvaluation(results);
const report = {
  suiteKey: "ai-regression-baseline",
  promptVersion: AI_PROMPT_VERSION,
  model: process.env.GEMINI_MODEL ?? null,
  commitSha: process.env.GITHUB_SHA ?? null,
  createdAt: new Date().toISOString(),
  ...summary,
  results,
};

await import("node:fs/promises").then(({ mkdir }) => mkdir(resolve(reportPath, ".."), { recursive: true }));
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report));
if (summary.status !== "passed") process.exitCode = 1;
