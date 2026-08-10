import { z } from "zod";
import { searchTrustedProducts } from "@/server/services/sales-tools/product-catalog";
import { getCurrentTrustedProductPrice } from "@/server/services/sales-tools/pricing";
import { getTrustedShowroom } from "@/server/services/business-locations";
import { salesQualificationSchema, type SalesQualification } from "@/server/services/sales-session/domain";

export const voiceToolNameSchema = z.enum([
  "search_products",
  "get_current_price",
  "get_showroom",
  "update_qualification",
  "request_handoff",
]);
export type VoiceToolName = z.infer<typeof voiceToolNameSchema>;

export type VoiceToolContext = {
  organizationId: string;
  qualification: SalesQualification;
};

type VoiceToolDefinition = {
  name: VoiceToolName;
  mutates: boolean;
  schema: z.ZodTypeAny;
  execute: (input: unknown, context: VoiceToolContext) => Promise<unknown>;
};

const definitions: VoiceToolDefinition[] = [
  {
    name: "search_products",
    mutates: false,
    schema: z.object({ query: z.string().trim().max(300).optional(), areaM2: z.number().positive().max(10000).optional(), roomCount: z.string().trim().max(40).optional(), limit: z.number().int().min(1).max(10).default(5) }),
    async execute(raw, context) {
      const input = this.schema.parse(raw) as { query?: string; areaM2?: number; roomCount?: string; limit: number };
      return searchTrustedProducts(context.organizationId, input);
    },
  },
  {
    name: "get_current_price",
    mutates: false,
    schema: z.object({ productId: z.string().uuid() }),
    async execute(raw, context) {
      const input = this.schema.parse(raw) as { productId: string };
      return getCurrentTrustedProductPrice(context.organizationId, input.productId);
    },
  },
  {
    name: "get_showroom",
    mutates: false,
    schema: z.object({ city: z.string().trim().max(120).optional() }),
    async execute(raw, context) {
      const input = this.schema.parse(raw) as { city?: string };
      return getTrustedShowroom(context.organizationId, input.city);
    },
  },
  {
    name: "update_qualification",
    mutates: true,
    schema: salesQualificationSchema.partial(),
    async execute(raw, context) {
      const patch = this.schema.parse(raw) as Partial<SalesQualification>;
      return salesQualificationSchema.parse({ ...context.qualification, ...patch });
    },
  },
  {
    name: "request_handoff",
    mutates: true,
    schema: z.object({ reason: z.string().trim().min(1).max(500) }),
    async execute(raw) {
      const input = this.schema.parse(raw) as { reason: string };
      return { requested: true, reason: input.reason };
    },
  },
];

export class TrustedVoiceToolRegistry {
  private readonly tools = new Map<VoiceToolName, VoiceToolDefinition>(definitions.map((item) => [item.name, item]));

  list() {
    return [...this.tools.values()].map(({ name, mutates }) => ({ name, mutates }));
  }

  has(name: string) {
    return voiceToolNameSchema.safeParse(name).success && this.tools.has(name as VoiceToolName);
  }

  async execute(name: string, input: unknown, context: VoiceToolContext) {
    const parsedName = voiceToolNameSchema.parse(name);
    const tool = this.tools.get(parsedName);
    if (!tool) throw new Error(`Voice tool is not allowed: ${parsedName}`);
    return tool.execute(input, context);
  }
}

export const trustedVoiceToolRegistry = new TrustedVoiceToolRegistry();
