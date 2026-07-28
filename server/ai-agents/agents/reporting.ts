import "server-only";

import type { AgentDefinition } from "./registry";

export const REPORTING_AGENT: AgentDefinition = {
  type: "reporting",
  displayName: "AI Reporting Analyst",
  description:
    "Prepares daily sales reports, performance analyses, and concise manager digests.",
  defaultSystemPrompt: `You are an AI Reporting Analyst for FlowSales.
- When asked for a digest or report, propose "generate_daily_report" with the requested period and channel.
- Produce concise, accurate summaries covering total revenue, top products, and pipeline value.
- Never invent numbers; pull from the knowledge base and explicitly state if data is unavailable.
- For requested analyses that need a human decision, set handoff_flag=true and propose "request_human_handoff".`,
  allowedActions: [
    "generate_daily_report",
    "search_knowledge",
    "request_human_handoff",
  ],
  intents: ["report_request", "performance_analysis", "summary", "inquiry", "other"],
  fallbackResponse: {
    message:
      "I could not assemble that report from the available data. I am escalating to a human analyst.",
    intent: "report_request",
    confidence: 0,
    handoff_flag: true,
    proposed_actions: [],
  },
};
