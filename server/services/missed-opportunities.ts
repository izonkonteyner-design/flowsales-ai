import "server-only";

import { listStaleOpportunities, type StaleOpportunity } from "@/server/services/sales-intelligence-v3";

export type MissedOpportunity = StaleOpportunity & {
  severity: "critical" | "high" | "medium";
  signal: "follow_up_missed" | "high_intent_idle" | "quote_stage_idle";
};

export async function listMissedOpportunities(params: {
  organizationId: string;
  userId: string;
  userRole: string;
  limit?: number;
}): Promise<MissedOpportunity[]> {
  const risks = await listStaleOpportunities({ ...params, limit: 50 });

  return risks
    .flatMap((item) => {
      const quoteStage = ["quote_ready", "quote_sent", "negotiation"].includes(item.salesStage);
      const followUpMissed = Boolean(item.followUpAt && new Date(item.followUpAt).getTime() < Date.now());
      const highIntentIdle = item.score >= 70 && item.inactiveHours >= 24;
      if (!followUpMissed && !quoteStage && !highIntentIdle) return [];

      const signal: MissedOpportunity["signal"] = followUpMissed
        ? "follow_up_missed"
        : quoteStage
          ? "quote_stage_idle"
          : "high_intent_idle";
      const severity: MissedOpportunity["severity"] = item.riskScore >= 80 || (item.score >= 80 && quoteStage)
        ? "critical"
        : item.riskScore >= 60 || item.score >= 70
          ? "high"
          : "medium";
      return [{ ...item, signal, severity } satisfies MissedOpportunity];
    })
    .sort((a, b) => b.riskScore - a.riskScore || b.score - a.score)
    .slice(0, Math.max(1, Math.min(50, params.limit || 25)));
}
