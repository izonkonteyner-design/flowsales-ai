import { z } from "zod";

import { salesChannelSchema } from "@/server/services/sales-session/domain";
import { aiCapabilitySchema } from "./domain";

export const aiContextRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  actorId: z.string().uuid(),
  leadId: z.string().uuid(),
  capability: aiCapabilitySchema,
  channel: salesChannelSchema.default("web_chat"),
  salesSessionId: z.string().uuid().nullable().default(null),
});

export type AiContextRequest = z.infer<typeof aiContextRequestSchema>;

export const aiLeadContextSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1),
  status: z.string().trim().min(1),
  source: z.string().trim().nullable(),
  assignedTo: z.string().uuid().nullable(),
  estimatedValue: z.number().finite().nonnegative().nullable(),
  currency: z.string().length(3).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const aiActivityContextSchema = z.object({
  id: z.string().uuid(),
  type: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  occurredAt: z.string().datetime(),
});

export const aiProductContextSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1),
  active: z.boolean(),
  price: z.number().finite().nonnegative().nullable(),
  currency: z.string().length(3).nullable(),
});

export const aiSalesContextSchema = z.object({
  workspaceId: z.string().uuid(),
  actorId: z.string().uuid(),
  channel: salesChannelSchema,
  salesSessionId: z.string().uuid().nullable(),
  isDemoWorkspace: z.boolean(),
  generatedAt: z.string().datetime(),
  lead: aiLeadContextSchema,
  activities: z.array(aiActivityContextSchema).max(100),
  products: z.array(aiProductContextSchema).max(100),
  workspaceRules: z.array(z.string().trim().min(1).max(500)).max(50),
});

export type AiSalesContext = z.infer<typeof aiSalesContextSchema>;

export interface AiContextRepository {
  actorCanAccessWorkspace(input: { workspaceId: string; actorId: string }): Promise<boolean>;
  isDemoWorkspace(workspaceId: string): Promise<boolean>;
  getLead(input: { workspaceId: string; leadId: string }): Promise<z.input<typeof aiLeadContextSchema> | null>;
  listLeadActivities(input: { workspaceId: string; leadId: string; limit: number }): Promise<z.input<typeof aiActivityContextSchema>[]>;
  listActiveProducts(input: { workspaceId: string; limit: number }): Promise<z.input<typeof aiProductContextSchema>[]>;
  listWorkspaceRules(input: { workspaceId: string }): Promise<string[]>;
}

export class AiContextAccessError extends Error {}
export class AiContextNotFoundError extends Error {}

export async function buildAiSalesContext(
  repository: AiContextRepository,
  rawRequest: AiContextRequest,
  now: () => Date = () => new Date(),
): Promise<AiSalesContext> {
  const request = aiContextRequestSchema.parse(rawRequest);
  const allowed = await repository.actorCanAccessWorkspace({
    workspaceId: request.workspaceId,
    actorId: request.actorId,
  });

  if (!allowed) {
    throw new AiContextAccessError("Actor cannot access the requested workspace.");
  }

  const lead = await repository.getLead({
    workspaceId: request.workspaceId,
    leadId: request.leadId,
  });

  if (!lead) {
    throw new AiContextNotFoundError("Lead was not found in the requested workspace.");
  }

  const [isDemoWorkspace, activities, products, workspaceRules] = await Promise.all([
    repository.isDemoWorkspace(request.workspaceId),
    repository.listLeadActivities({ workspaceId: request.workspaceId, leadId: request.leadId, limit: 100 }),
    repository.listActiveProducts({ workspaceId: request.workspaceId, limit: 100 }),
    repository.listWorkspaceRules({ workspaceId: request.workspaceId }),
  ]);

  return aiSalesContextSchema.parse({
    workspaceId: request.workspaceId,
    actorId: request.actorId,
    channel: request.channel,
    salesSessionId: request.salesSessionId,
    isDemoWorkspace,
    generatedAt: now().toISOString(),
    lead,
    activities,
    products,
    workspaceRules,
  });
}
