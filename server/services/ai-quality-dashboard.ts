import { z } from "zod";

const rateSchema = z.number().min(0).max(1).nullable();

export const aiQualitySummarySchema = z.object({
  windowDays: z.number().int().min(1).max(365),
  completedRuns: z.number().int().nonnegative(),
  failedRuns: z.number().int().nonnegative(),
  feedbackCount: z.number().int().nonnegative(),
  helpfulCount: z.number().int().nonnegative(),
  notHelpfulCount: z.number().int().nonnegative(),
  feedbackCoverage: z.number().min(0).max(1),
  helpfulRate: rateSchema,
});

export const aiQualitySegmentSchema = z.object({
  capability: z.string().min(1).max(100),
  prompt_version: z.string().min(1).max(200),
  model: z.string().min(1).max(200),
  completed_runs: z.number().int().nonnegative(),
  failed_runs: z.number().int().nonnegative(),
  feedback_count: z.number().int().nonnegative(),
  helpful_count: z.number().int().nonnegative(),
  not_helpful_count: z.number().int().nonnegative(),
  helpful_rate: rateSchema,
  latest_run_at: z.string().datetime().nullable(),
});

export const aiQualityEvaluationSchema = z.object({
  id: z.string().uuid(),
  suite_key: z.string().min(1).max(200),
  prompt_version: z.string().min(1).max(200),
  model: z.string().min(1).max(200),
  total_cases: z.number().int().nonnegative(),
  passed_cases: z.number().int().nonnegative(),
  score: z.coerce.number().min(0).max(1),
  status: z.enum(["passed", "failed"]),
  commit_sha: z.string().nullable(),
  created_at: z.string().datetime(),
});

export const aiQualityRiskSchema = z.object({
  key: z.string().min(1).max(200),
  severity: z.enum(["critical", "high", "medium", "low"]),
  title: z.string().min(1).max(200),
  detail: z.string().min(1).max(500),
});

export const aiQualityDashboardSchema = z.object({
  generatedAt: z.string().datetime(),
  summary: aiQualitySummarySchema,
  segments: z.array(aiQualitySegmentSchema).max(500),
  evaluations: z.array(aiQualityEvaluationSchema).max(20),
  risks: z.array(aiQualityRiskSchema).max(20),
});

export type AiQualityDashboard = z.infer<typeof aiQualityDashboardSchema>;

export function formatQualityRate(value: number | null) {
  return value === null ? "No data" : `${Math.round(value * 100)}%`;
}
