import { z } from "zod";

export const industryPackKeySchema = z.enum([
  "container_modular",
  "real_estate",
  "automotive",
  "general_services",
]);
export type IndustryPackKey = z.infer<typeof industryPackKeySchema>;

export const industryPackPresetSchema = z.object({
  packKey: industryPackKeySchema,
  name: z.string(),
  description: z.string(),
  version: z.string().default("1.0.0"),
  customFields: z.array(
    z.object({
      fieldKey: z.string(),
      label: z.string(),
      type: z.enum(["text", "number", "select", "boolean", "date"]),
      options: z.array(z.string()).optional(),
      required: z.boolean().default(false),
      targetEntity: z.enum(["lead", "quote", "product"]),
    })
  ),
  pipelineStages: z.array(
    z.object({
      stageKey: z.string(),
      label: z.string(),
      color: z.string(),
      order: z.number(),
    })
  ),
  catalogTemplates: z.array(
    z.object({
      name: z.string(),
      category: z.string(),
      description: z.string(),
      unit: z.string(),
      suggestedUnitPrice: z.number(),
    })
  ),
  quoteTemplatePreset: z.object({
    headerNote: z.string(),
    footerTerms: z.array(z.string()),
    defaultTaxRate: z.number().default(20),
    defaultValidityDays: z.number().default(15),
  }),
  aiSystemInstructions: z.string(),
});
export type IndustryPackPreset = z.infer<typeof industryPackPresetSchema>;

export const tenantIndustryPackConfigSchema = z.object({
  id: z.string().min(1).optional(),
  organizationId: z.string().min(1),
  packKey: industryPackKeySchema,
  isActive: z.boolean().default(true),
  packVersion: z.string(),
  customFields: z.array(z.record(z.string(), z.any())),
  pipelineStages: z.array(z.record(z.string(), z.any())),
  catalogTemplates: z.array(z.record(z.string(), z.any())),
  quoteTemplatePreset: z.record(z.string(), z.any()),
  aiSystemInstructions: z.string(),
  activatedBy: z.string().min(1).nullable().optional(),
  activatedAt: z.string().optional(),
});
export type TenantIndustryPackConfig = z.infer<typeof tenantIndustryPackConfigSchema>;
