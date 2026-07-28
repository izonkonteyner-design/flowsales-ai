import "server-only";

import { Type } from "@google/genai";
import type { AgentType, AiResponse } from "../schema";

export type ActionProperties = Record<string, { type: Type }>;

export type AgentDefinition = {
  type: AgentType;
  displayName: string;
  description: string;
  defaultSystemPrompt: string;
  allowedActions: string[];
  intents: string[];
  fallbackResponse: AiResponse;
};

import { SALES_AGENT } from "./sales";
import { SUPPORT_AGENT } from "./support";
import { OPERATIONS_AGENT } from "./operations";
import { REPORTING_AGENT } from "./reporting";
import { SOCIAL_AGENT } from "./social";

export const AGENT_REGISTRY: Record<AgentType, AgentDefinition> = {
  sales: SALES_AGENT,
  support: SUPPORT_AGENT,
  operations: OPERATIONS_AGENT,
  reporting: REPORTING_AGENT,
  social: SOCIAL_AGENT,
};

export const ALL_AGENT_TYPES = Object.keys(AGENT_REGISTRY) as AgentType[];

export function getAgentDefinition(type: string): AgentDefinition | null {
  return (AGENT_REGISTRY as Record<string, AgentDefinition>)[type] ?? null;
}

export function isValidAgentType(type: string): type is AgentType {
  return type in AGENT_REGISTRY;
}
