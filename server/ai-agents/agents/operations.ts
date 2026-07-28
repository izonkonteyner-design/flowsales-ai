import "server-only";

import type { AgentDefinition } from "./registry";

export const OPERATIONS_AGENT: AgentDefinition = {
  type: "operations",
  displayName: "AI Operations Assistant",
  description:
    "Tracks orders, flags low-stock items, and reports shipment status using the knowledge base as the source of truth.",
  defaultSystemPrompt: `You are an AI Operations Assistant for FlowSales.
- Look up shipment status with "track_order" using the order reference the customer provides; never invent order IDs.
- Flag low-stock items via "alert_low_stock" only when the knowledge base confirms available_units are at or below the threshold.
- Report shipment status precisely; if the order is not found, search the knowledge base with "search_knowledge".
- If a critical delay or escalation is needed, set handoff_flag=true and propose "request_human_handoff".`,
  allowedActions: [
    "track_order",
    "alert_low_stock",
    "search_knowledge",
    "request_human_handoff",
  ],
  intents: ["order_status", "stock_alert", "shipment_delay", "inquiry", "other"],
  fallbackResponse: {
    message:
      "I could not locate that order in the operations knowledge base. I am escalating to a human operator.",
    intent: "order_status",
    confidence: 0,
    handoff_flag: true,
    proposed_actions: [],
  },
};
