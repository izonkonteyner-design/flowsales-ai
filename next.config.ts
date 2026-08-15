import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Deployment refresh marker: reload current Production environment values.
const nextConfig: NextConfig = {
  experimental: {
    // Product forms upload images directly to Supabase Storage, but the
    // Server Action still receives multipart form metadata. Keep the action
    // payload above Next's 1 MB default so legitimate product submissions
    // cannot fail with "Body exceeded 1 MB limit".
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options
  org: process.env.SENTRY_ORG || "flowsales",
  project: process.env.SENTRY_PROJECT || "flowsales-ai",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
});
