export const REQUIRED_DEPLOYMENT_MIGRATION = "0039";

const REQUIRED_ENV_GROUPS = [
  { label: "NEXT_PUBLIC_SUPABASE_URL", keys: ["NEXT_PUBLIC_SUPABASE_URL"] },
  {
    label: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    keys: ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  },
  { label: "SUPABASE_SERVICE_ROLE_KEY", keys: ["SUPABASE_SERVICE_ROLE_KEY"] },
  { label: "HEALTH_CHECK_SECRET", keys: ["HEALTH_CHECK_SECRET"] },
  {
    label: "NEXT_PUBLIC_SITE_URL",
    keys: ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_APP_URL", "VERCEL_URL"],
  },
] as const;

const FEATURE_ENV_GROUPS = [
  { feature: "demo", keys: ["DEMO_USER_EMAIL", "DEMO_USER_PASSWORD", "DEMO_RATE_LIMIT_SECRET"] },
  { feature: "ai", keys: ["GEMINI_API_KEY"] },
  {
    feature: "billing-lemonsqueezy",
    keys: [
      "LEMONSQUEEZY_API_KEY",
      "LEMONSQUEEZY_STORE_ID",
      "LEMONSQUEEZY_STARTER_VARIANT_ID",
      "LEMONSQUEEZY_GROWTH_VARIANT_ID",
      "LEMONSQUEEZY_PRO_VARIANT_ID",
      "BILLING_WEBHOOK_SECRET",
    ],
  },
] as const;

export type DeploymentDatabaseStatus = {
  ready: boolean;
  latestMigration: string | null;
  requiredMigration: string;
  missingFunctions: string[];
  missingTables: string[];
};

function isConfigured(key: string) {
  return Boolean(process.env[key]?.trim());
}

export function getDeploymentEnvironmentStatus() {
  const missingRequired = REQUIRED_ENV_GROUPS
    .filter((group) => !group.keys.some(isConfigured))
    .map((group) => group.label);

  const features = Object.fromEntries(
    FEATURE_ENV_GROUPS.map((group) => [
      group.feature,
      {
        configured: group.keys.every(isConfigured),
        missing: group.keys.filter((key) => !isConfigured(key)),
      },
    ]),
  );

  return {
    ready: missingRequired.length === 0,
    missingRequired,
    features,
  };
}

export function normalizeDeploymentDatabaseStatus(value: unknown): DeploymentDatabaseStatus | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const missingFunctions = Array.isArray(record.missingFunctions)
    ? record.missingFunctions.filter((item): item is string => typeof item === "string")
    : [];
  const missingTables = Array.isArray(record.missingTables)
    ? record.missingTables.filter((item): item is string => typeof item === "string")
    : [];
  const latestMigration = typeof record.latestMigration === "string" ? record.latestMigration : null;
  const requiredMigration =
    typeof record.requiredMigration === "string" ? record.requiredMigration : REQUIRED_DEPLOYMENT_MIGRATION;

  return {
    ready:
      record.ready === true &&
      latestMigration !== null &&
      latestMigration >= requiredMigration &&
      missingFunctions.length === 0 &&
      missingTables.length === 0,
    latestMigration,
    requiredMigration,
    missingFunctions,
    missingTables,
  };
}
