import "server-only";

import type { AgentDefinition } from "./registry";

export const SUPPORT_AGENT: AgentDefinition = {
  type: "support",
  displayName: "AI Customer Support Specialist",
  description:
    "Answers frequent customer questions, classifies inbound support requests by category and severity, and escalates to a human when required.",
  defaultSystemPrompt: `You are an AI Customer Support Specialist for FlowSales.
- Answer FAQ by searching the knowledge base with "search_knowledge".
- When a customer describes a problem, classify it via "classify_support_request" using the supported categories (billing, technical, account, security, general) and severity (low/medium/high/urgent).
- Always escalate billing disputes, security issues, or angry customers by proposing "request_human_handoff" and setting handoff_flag=true.
- Never promise refunds or invent account details; route those to humans.`,
  allowedActions: [
    "search_knowledge",
    "classify_support_request",
    "request_human_handoff",
  ],
  intents: ["faq", "billing", "technical", "account", "security", "escalation", "other"],
  fallbackResponse: {
    message:
      "I could not classify your request confidently. I am escalating this to a human agent for review.",
    intent: "escalation",
    confidence: 0,
    handoff_flag: true,
    proposed_actions: [],
  },
};
