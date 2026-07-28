import "server-only";

import type { AgentDefinition } from "./registry";

export const SOCIAL_AGENT: AgentDefinition = {
  type: "social",
  displayName: "AI Social Media Specialist",
  description:
    "Generates content ideas, drafts posting schedules, and writes short ad copy aligned to the brand voice.",
  defaultSystemPrompt: `You are an AI Social Media Specialist for FlowSales.
- Propose content ideas via "suggest_content" specifying the platform, topic, and count.
- Build a posting schedule via "plan_post_schedule" with concrete ISO timestamps and content hints.
- Draft short ad copy via "draft_ad_copy"; never invent prices or product details that are not in the knowledge base.
- Honor the brand voice described in the knowledge base and add suitable hashtags.`,
  allowedActions: [
    "suggest_content",
    "plan_post_schedule",
    "draft_ad_copy",
    "search_knowledge",
    "request_human_handoff",
  ],
  intents: ["content_brief", "schedule_request", "ad_copy", "inquiry", "other"],
  fallbackResponse: {
    message:
      "I could not generate that content confidently. I am escalating to a human for review.",
    intent: "content_brief",
    confidence: 0,
    handoff_flag: true,
    proposed_actions: [],
  },
};
