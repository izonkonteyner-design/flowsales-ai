import { z } from "zod";

export const demoConfigSchema = z.object({
  demoOrgId: z.string().uuid().default("d3e00000-0000-0000-0000-000000000000"),
  demoOrgSlug: z.string().default("flowsales-demo"),
});

export type DemoConfig = z.infer<typeof demoConfigSchema>;

let cachedConfig: DemoConfig | null = null;

export function getDemoConfig(): DemoConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const parsed = demoConfigSchema.safeParse({
    demoOrgId: process.env.DEMO_ORG_ID,
    demoOrgSlug: process.env.DEMO_ORG_SLUG,
  });

  if (parsed.success && parsed.data.demoOrgId) {
    cachedConfig = parsed.data;
  } else {
    // Fallback to hardcoded values (only used in development/test)
    cachedConfig = {
      demoOrgId: "d3e00000-0000-0000-0000-000000000000",
      demoOrgSlug: "flowsales-demo",
    };
  }

  return cachedConfig;
}

export function isDemoOrganization(organizationId: string): boolean {
  const config = getDemoConfig();
  return organizationId === config.demoOrgId;
}