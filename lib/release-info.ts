export function releaseInfo(env: Record<string, string | undefined>) {
  return {
    application: "FlowSales AI",
    commit: env.VERCEL_GIT_COMMIT_SHA || null,
    environment: env.VERCEL_ENV || "local",
    modules: ["crm", "social-accounts", "content-studio", "publishing-calendar", "media-library"],
    publishingEnabled: env.SOCIAL_PUBLISHING_ENABLED === "true",
  };
}
