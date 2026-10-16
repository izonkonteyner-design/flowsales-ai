/**
 * Type definitions for the social media publishing core (Faz 2).
 *
 * Provider/adapter architecture: a single platform-agnostic data model is
 * served by pluggable providers (Instagram first). These TS types are safe to
 * import from both server and client components.
 */

export type SocialPlatform =
  | "instagram"
  | "facebook"
  | "tiktok"
  | "youtube"
  | "google_business"
  | "linkedin"
  | "pinterest"
  | "threads"
  | "x"
  | "bluesky"
  | "mastodon";

export type SocialPostStatus = "draft" | "scheduled" | "processing" | "published" | "failed" | "archived";

export type SocialAccountStatus = "connected" | "disconnected" | "expired" | "error";

export type SocialMediaAccount = {
  id: string;
  organization_id: string;
  platform: SocialPlatform;
  platform_account_id: string;
  username: string | null;
  profile_picture_url: string | null;
  status: SocialAccountStatus;
  scopes: string[];
  token_expires_at: string | null;
  connected_at: string;
  updated_at: string;
};

export type SocialMediaPost = {
  id: string;
  organization_id: string;
  account_id: string | null;
  platform: SocialPlatform;
  status: SocialPostStatus;
  content: string;
  media_urls: string[];
  scheduled_at: string | null;
  published_at: string | null;
  platform_post_id: string | null;
  platform_post_url: string | null;
  error_message: string | null;
  retry_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Optional organization ID for company-page publishing (LinkedIn Company Page etc.). */
export type SocialMediaPublishInput = {
  content: string;
  media_urls: string[];
  scheduled_at?: string | null;
  organization_id?: string | null;
  scopes?: string[];
};

export type SocialMediaMedia = {
  id: string;
  organization_id: string;
  file_name: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  url: string;
  storage_path: string;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  created_at: string;
};

export type PublishResult = {
  platform_post_id: string;
  platform_post_url: string | null;
};

export type OAuthTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  platform_account_id: string;
  username?: string;
  scopes?: string[];
};

/** Provider capability flags so the UI can hide unsupported actions per platform. */
export type ProviderCapabilities = {
  publishing: boolean;
  analytics: boolean;
  story: boolean;
  reel: boolean;
  scheduling: boolean;
};
