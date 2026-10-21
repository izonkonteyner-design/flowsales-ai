import { instagramProvider } from "./providers/instagram";
import { facebookProvider } from "./providers/facebook";
import { tiktokProvider } from "./providers/tiktok";
import { youtubeProvider } from "./providers/youtube";
import { googleBusinessProvider } from "./providers/google-business";
import { linkedinProvider } from "./providers/linkedin";
import { threadsProvider } from "./providers/threads";
import {
  SocialMediaProvider,
  SocialMediaError,
  isSocialMediaError,
} from "./providers/base";
import type { SocialPlatform } from "@/types/social-media";

/**
 * Provider registry. Platforms are registered here; the service layer resolves
 * a provider by platform name. Unknown platforms throw NOT_CONFIGURED so the
 * app never pretends an unsupported platform can publish.
 */

const providers: Record<SocialPlatform, SocialMediaProvider | null> = {
  instagram: instagramProvider,
  facebook: facebookProvider,
  tiktok: tiktokProvider,
  youtube: youtubeProvider,
  google_business: googleBusinessProvider,
  linkedin: linkedinProvider,
  pinterest: null,
  threads: threadsProvider,
  x: null,
  bluesky: null,
  mastodon: null,
};

export function getProvider(platform: SocialPlatform): SocialMediaProvider {
  const provider = providers[platform];
  if (!provider) {
    throw SocialMediaError.notConfigured(
      platform,
      "This platform is not yet implemented. Implement its provider adapter in lib/social-media/providers/.",
    );
  }
  return provider;
}

export function listProviders(): Array<{ platform: SocialPlatform; label: string; implemented: boolean }> {
  return Object.entries(providers).map(([platform, provider]) => ({
    platform: platform as SocialPlatform,
    label: provider?.label ?? platform,
    implemented: Boolean(provider),
  }));
}

export function isImplemented(platform: SocialPlatform): boolean {
  return Boolean(providers[platform]);
}

export { isSocialMediaError };
