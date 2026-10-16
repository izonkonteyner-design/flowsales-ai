import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {
    // Pin the workspace root so Next does not mis-detect it from adjacent
    // lockfiles (e.g. a stray package-lock.json in the user home directory).
    root: process.cwd(),
  },
};

// Only apply Sentry config when DSN is available to avoid build failures
// in local/preview environments without Sentry configured.
const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN) {
  const { withSentryConfig } = require("@sentry/nextjs");
  module.exports = withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG || "flowsales",
    project: process.env.SENTRY_PROJECT || "flowsales-ai",
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: true,
    widenClientFileUpload: true,
  });
} else {
  module.exports = nextConfig;
}
