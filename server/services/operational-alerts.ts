import { z } from "zod";

export const operationalSeveritySchema = z.enum(["critical", "high", "medium", "low"]);
export const operationalAlertSchema = z.object({
  key: z.string().min(3).max(300),
  category: z.enum([
    "ai_failure",
    "import_failure",
    "billing_failure",
    "lifecycle_request",
    "stale_approval",
    "entitlement_mismatch",
  ]),
  severity: operationalSeveritySchema,
  title: z.string().min(1).max(200),
  detail: z.string().max(500),
  occurredAt: z.string().datetime(),
  href: z.string().startsWith("/").max(300),
});

export const operationalAlertsSchema = z.array(operationalAlertSchema).max(500);
export type OperationalAlert = z.infer<typeof operationalAlertSchema>;

export function summarizeOperationalAlerts(alerts: OperationalAlert[]) {
  return {
    total: alerts.length,
    critical: alerts.filter((alert) => alert.severity === "critical").length,
    high: alerts.filter((alert) => alert.severity === "high").length,
    medium: alerts.filter((alert) => alert.severity === "medium").length,
  };
}
