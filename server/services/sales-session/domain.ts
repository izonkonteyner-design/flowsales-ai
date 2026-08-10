import { z } from "zod";

export const salesChannelSchema = z.enum([
  "phone",
  "whatsapp",
  "instagram",
  "messenger",
  "web_chat",
]);

export type SalesChannel = z.infer<typeof salesChannelSchema>;

export const salesHandoffStateSchema = z.enum([
  "none",
  "recommended",
  "requested",
  "transferring",
  "transferred",
  "completed",
]);

export const salesQualificationSchema = z.object({
  customerName: z.string().trim().min(1).max(160).nullable().default(null),
  phone: z.string().trim().min(3).max(40).nullable().default(null),
  email: z.string().email().nullable().default(null),
  productInterest: z.string().trim().min(1).max(300).nullable().default(null),
  areaM2: z.number().finite().positive().max(10_000).nullable().default(null),
  roomCount: z.string().trim().min(1).max(40).nullable().default(null),
  budget: z.number().finite().nonnegative().nullable().default(null),
  currency: z.string().trim().length(3).nullable().default(null),
  location: z.string().trim().min(1).max(300).nullable().default(null),
  deliveryLocation: z.string().trim().min(1).max(300).nullable().default(null),
  landReady: z.boolean().nullable().default(null),
  siteAccessKnown: z.boolean().nullable().default(null),
  usagePurpose: z.string().trim().min(1).max(500).nullable().default(null),
  purchaseTiming: z.string().trim().min(1).max(160).nullable().default(null),
  decisionRole: z.enum(["decision_maker", "influencer", "researcher", "unknown"]).nullable().default(null),
  showroomVisitIntent: z.boolean().nullable().default(null),
  preferredVisitDate: z.string().datetime().nullable().default(null),
  preferredContactTime: z.string().trim().min(1).max(160).nullable().default(null),
  quoteRequested: z.boolean().default(false),
  pricingIntent: z.boolean().default(false),
  availabilityIntent: z.boolean().default(false),
  purchaseCommitment: z.boolean().default(false),
  explicitObjection: z.string().trim().min(1).max(300).nullable().default(null),
});

const emptyQualification = {
  customerName: null,
  phone: null,
  email: null,
  productInterest: null,
  areaM2: null,
  roomCount: null,
  budget: null,
  currency: null,
  location: null,
  deliveryLocation: null,
  landReady: null,
  siteAccessKnown: null,
  usagePurpose: null,
  purchaseTiming: null,
  decisionRole: null,
  showroomVisitIntent: null,
  preferredVisitDate: null,
  preferredContactTime: null,
  quoteRequested: false,
  pricingIntent: false,
  availabilityIntent: false,
  purchaseCommitment: false,
  explicitObjection: null,
} as const;

export const salesSessionSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  leadId: z.string().uuid().nullable().default(null),
  customerId: z.string().uuid().nullable().default(null),
  conversationId: z.string().uuid().nullable().default(null),
  channel: salesChannelSchema,
  channelSessionId: z.string().trim().min(1).max(500),
  currentIntent: z.string().trim().min(1).max(500).nullable().default(null),
  qualification: salesQualificationSchema.default(emptyQualification),
  referencedProductIds: z.array(z.string().uuid()).max(20).default([]),
  currentLeadScore: z.number().int().min(0).max(100).nullable().default(null),
  nextBestAction: z.string().trim().min(1).max(1000).nullable().default(null),
  handoffState: salesHandoffStateSchema.default("none"),
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type SalesSession = z.infer<typeof salesSessionSchema>;
export type SalesQualification = z.infer<typeof salesQualificationSchema>;

export function createSalesSession(input: {
  id: string;
  workspaceId: string;
  channel: SalesChannel;
  channelSessionId: string;
  now?: Date;
}): SalesSession {
  const now = (input.now ?? new Date()).toISOString();
  return salesSessionSchema.parse({
    id: input.id,
    workspaceId: input.workspaceId,
    channel: input.channel,
    channelSessionId: input.channelSessionId,
    startedAt: now,
    updatedAt: now,
  });
}

export function updateSalesSessionQualification(
  session: SalesSession,
  patch: Partial<SalesQualification>,
  now: Date = new Date(),
): SalesSession {
  return salesSessionSchema.parse({
    ...session,
    qualification: {
      ...session.qualification,
      ...patch,
    },
    updatedAt: now.toISOString(),
  });
}
