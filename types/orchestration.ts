import { z } from "zod";

export const agentDepartmentSchema = z.enum([
  "executive",
  "sales",
  "marketing",
  "support",
  "operations",
  "quality",
  "research",
]);
export type AgentDepartment = z.infer<typeof agentDepartmentSchema>;

export const agentStatusSchema = z.enum(["active", "disabled", "draft"]);
export type AgentStatus = z.infer<typeof agentStatusSchema>;

export const taskPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

export const orchestrationTaskStatusSchema = z.enum([
  "draft",
  "pending",
  "queued",
  "running",
  "waiting_for_dependency",
  "waiting_for_approval",
  "retrying",
  "completed",
  "failed",
  "cancelled",
]);
export type OrchestrationTaskStatus = z.infer<typeof orchestrationTaskStatusSchema>;

export const orchestrationPlanStatusSchema = z.enum([
  "draft",
  "planned",
  "executing",
  "completed",
  "failed",
  "cancelled",
]);
export type OrchestrationPlanStatus = z.infer<typeof orchestrationPlanStatusSchema>;

export const memoryCategorySchema = z.enum([
  "business_profile",
  "business_policy",
  "customer_insight",
  "project_context",
  "operational_fact",
  "learned_rule",
]);
export type MemoryCategory = z.infer<typeof memoryCategorySchema>;

export const connectorProviderKeySchema = z.enum([
  "whatsapp",
  "meta",
  "instagram",
  "facebook",
  "telnyx",
  "twilio",
  "smtp_email",
  "stripe",
  "lemonsqueezy",
  "crm_internal",
  "webhook_custom",
]);
export type ConnectorProviderKey = z.infer<typeof connectorProviderKeySchema>;

export const workflowTriggerTypeSchema = z.enum([
  "scheduled",
  "event_crm_lead_created",
  "event_message_received",
  "event_quote_requested",
  "manual",
]);
export type WorkflowTriggerType = z.infer<typeof workflowTriggerTypeSchema>;

// Agent Definition Schema
export const agentDefinitionSchema = z.object({
  id: z.string().uuid().optional(),
  organizationId: z.string().uuid(),
  key: z.string().min(2).max(100),
  name: z.string().min(2).max(120),
  description: z.string().max(1000).optional(),
  department: agentDepartmentSchema,
  systemInstructions: z.string().min(10),
  supportedSkills: z.array(z.string()).default([]),
  permittedTools: z.array(z.string()).default([]),
  provider: z.string().default("gemini"),
  model: z.string().default("gemini-3.5-flash-lite"),
  executionLimits: z
    .object({
      maxIterations: z.number().int().min(1).max(50).default(10),
      maxTokens: z.number().int().min(500).max(128000).default(8000),
      timeoutSeconds: z.number().int().min(5).max(300).default(60),
    })
    .default({ maxIterations: 10, maxTokens: 8000, timeoutSeconds: 60 }),
  permissionProfile: z
    .object({
      canReadCrm: z.boolean().default(true),
      canDraftActions: z.boolean().default(true),
      requiresApprovalForExternal: z.boolean().default(true),
      externalSpendLimitUsd: z.number().min(0).default(0),
    })
    .default({
      canReadCrm: true,
      canDraftActions: true,
      requiresApprovalForExternal: true,
      externalSpendLimitUsd: 0,
    }),
  status: agentStatusSchema.default("active"),
  version: z.number().int().positive().default(1),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});
export type AgentDefinition = z.infer<typeof agentDefinitionSchema>;

// Orchestration Plan Schema
export const orchestrationPlanSchema = z.object({
  id: z.string().uuid().optional(),
  organizationId: z.string().uuid(),
  createdBy: z.string().uuid().optional(),
  objective: z.string().min(3).max(4000),
  clarifications: z
    .array(
      z.object({
        question: z.string(),
        answer: z.string().optional(),
      })
    )
    .default([]),
  status: orchestrationPlanStatusSchema.default("draft"),
  planSummary: z.string().optional(),
  budgetLimits: z
    .object({
      maxSubtasks: z.number().int().min(1).max(50).default(15),
      maxTokens: z.number().int().min(1000).max(500000).default(60000),
      maxUsd: z.number().min(0).max(100).default(1.0),
    })
    .default({ maxSubtasks: 15, maxTokens: 60000, maxUsd: 1.0 }),
  metrics: z
    .object({
      totalTokens: z.number().int().min(0).default(0),
      estimatedCostUsd: z.number().min(0).default(0),
      durationMs: z.number().int().min(0).default(0),
    })
    .default({ totalTokens: 0, estimatedCostUsd: 0, durationMs: 0 }),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});
export type OrchestrationPlan = z.infer<typeof orchestrationPlanSchema>;

// Orchestration Task Schema
export const orchestrationTaskSchema = z.object({
  id: z.string().uuid().optional(),
  organizationId: z.string().uuid(),
  planId: z.string().uuid(),
  parentTaskId: z.string().uuid().optional().nullable(),
  agentId: z.string().uuid().optional().nullable(),
  assignedAgentKey: z.string().min(2),
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  priority: taskPrioritySchema.default("medium"),
  status: orchestrationTaskStatusSchema.default("pending"),
  inputPayload: z.record(z.string(), z.unknown()).default({}),
  outputPayload: z.record(z.string(), z.unknown()).optional().nullable(),
  errorInfo: z
    .object({
      message: z.string(),
      code: z.string().optional(),
      stack: z.string().optional(),
    })
    .optional()
    .nullable(),
  retryCount: z.number().int().min(0).default(0),
  maxRetries: z.number().int().min(0).max(10).default(3),
  concurrencyLockId: z.string().optional().nullable(),
  approvalRequestId: z.string().uuid().optional().nullable(),
  startedAt: z.string().datetime().optional().nullable(),
  completedAt: z.string().datetime().optional().nullable(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});
export type OrchestrationTask = z.infer<typeof orchestrationTaskSchema>;

// Multi-Agent Handoff Schema
export const agentHandoffSchema = z.object({
  id: z.string().uuid().optional(),
  organizationId: z.string().uuid(),
  planId: z.string().uuid(),
  sourceTaskId: z.string().uuid().optional().nullable(),
  destinationTaskId: z.string().uuid().optional().nullable(),
  sourceAgentKey: z.string(),
  destinationAgentKey: z.string(),
  handoffPurpose: z.string(),
  sharedContext: z.record(z.string(), z.unknown()).default({}),
  expectedOutputFormat: z.string().optional(),
  status: z.enum(["pending", "accepted", "completed", "rejected"]).default("pending"),
  createdAt: z.string().datetime().optional(),
});
export type AgentHandoff = z.infer<typeof agentHandoffSchema>;

// Business Memory Schema
export const businessMemorySchema = z.object({
  id: z.string().uuid().optional(),
  organizationId: z.string().uuid(),
  category: memoryCategorySchema,
  title: z.string().min(2).max(200),
  content: z.string().min(2).max(10000),
  sourceAttribution: z.string(),
  confidence: z.number().min(0).max(1).default(1.0),
  isVerified: z.boolean().default(true),
  verifiedBy: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});
export type BusinessMemory = z.infer<typeof businessMemorySchema>;
