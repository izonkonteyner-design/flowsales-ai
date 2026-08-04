import type { SupabaseClient } from "@supabase/supabase-js";

export type UsageBreakdown = {
  capability: string;
  runCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
};

export async function getMonthlyAiUsage(client: SupabaseClient, workspaceId: string, usageMonth: string): Promise<UsageBreakdown[]> {
  const { data, error } = await client
    .from("ai_usage_monthly")
    .select("capability, run_count, input_tokens, output_tokens, estimated_cost_usd")
    .eq("organization_id", workspaceId)
    .eq("usage_month", usageMonth)
    .order("run_count", { ascending: false });

  if (error) throw new Error(`Unable to load AI usage: ${error.message}`);
  return (data ?? []).map((row) => ({
    capability: String(row.capability),
    runCount: Number(row.run_count ?? 0),
    inputTokens: Number(row.input_tokens ?? 0),
    outputTokens: Number(row.output_tokens ?? 0),
    estimatedCostUsd: Number(row.estimated_cost_usd ?? 0),
  }));
}
