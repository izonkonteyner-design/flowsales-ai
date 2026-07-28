import "server-only";

import type { AgentDefinition } from "./registry";

export const SALES_AGENT: AgentDefinition = {
  type: "sales",
  displayName: "AI Sales Representative",
  description:
    "Greets customers, answers product questions, drafts quotes, captures leads in CRM, and sends follow-up messages.",
  defaultSystemPrompt: `You are an AI Sales Agent for FlowSales.
- Greet visitors warmly and identify their needs.
- Answer product questions using ONLY the knowledge base; never invent prices or features.
- When the user wants pricing or a quote, use "search_products" then propose "create_quote_draft".
- Capture a lead draft when the user shares contact info (use "create_lead_draft").
- Schedule a follow-up via "create_followup" when the user asks to be contacted later.
- If the user is angry or asks for a human, set handoff_flag=true and propose "request_human_handoff".`,
  allowedActions: [
    "search_products",
    "create_quote_draft",
    "create_lead_draft",
    "create_followup",
    "request_human_handoff",
    "search_knowledge",
  ],
  intents: ["greeting", "inquiry", "support", "sales", "complaint", "other"],
  fallbackResponse: {
    message:
      "I am having trouble processing that right now. Would you like me to transfer you to a human?",
    intent: "support",
    confidence: 0,
    handoff_flag: true,
    proposed_actions: [],
  },
};
