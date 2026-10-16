
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { getProvider, isSocialMediaError } from "@/lib/social-media/registry";
import { decryptToken } from "@/lib/crypto";

type Fail = { ok: false; error: string };

function fail(message: string): Fail {
  return { ok: false, error: message };
}

function getAdminClient() {
  const env = getSupabaseEnv();
  if (!env.url || !env.serviceRoleKey) {
    throw new Error("Missing Supabase admin configuration.");
  }
  return createClient(env.url, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const MAX_RETRIES = 5;
const BASE_BACKOFF_MINUTES = 5;
const BATCH_SIZE = 25;

/** Calculate the next retry timestamp using exponential backoff. */
export function calculateNextRetry(
  retryCount: number,
): { nextRetryCount: number; nextRetryAt: string | null } {
  const nextRetryCount = retryCount + 1;
  const backoffMinutes = BASE_BACKOFF_MINUTES * Math.pow(2, nextRetryCount - 1);
  const nextRetryAt = nextRetryCount >= MAX_RETRIES
    ? null
    : new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();
  return { nextRetryCount, nextRetryAt };
}

type SocialAccountRow = {
  organization_id: string;
  id: string;
  platform_account_id: string;
  status: string;
  platform: string;
  access_token: string;
  encrypted_access_token: string | null;
  encryption_iv: string | null;
  token_encryption_key_version: number | null;
};

type SocialPostRow = {
  id: string;
  organization_id: string;
  created_by: string | null;
  account_id: string | null;
  platform: string;
  status: string;
  content: string;
  media_urls: string[];
  scheduled_at: string | null;
  retry_count: number;
  next_retry_at: string | null;
  claimed_at: string | null;
  platform_post_id: string | null;
  platform_post_url: string | null;
  social_media_accounts: SocialAccountRow | null;
};

/** Claim due posts for publishing across all organizations. */
export async function claimDuePosts(): Promise<{ ok: true; data: SocialPostRow[] } | Fail> {
  const client = getAdminClient();
  const now = new Date().toISOString();
  // Processing rows are deliberately not reclaimed: a platform may have accepted a timed-out request.

  const { data, error } = await client
    .from("social_media_posts")
    .select(
      "*, social_media_accounts(organization_id, access_token, encrypted_access_token, encryption_iv, token_encryption_key_version, platform_account_id, status, platform)",
    )
    .or(`and(status.eq.scheduled,scheduled_at.lte.${now}),and(status.eq.failed,next_retry_at.lte.${now},retry_count.lt.${MAX_RETRIES})`)
    .order("scheduled_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    return fail(`Failed to claim posts: ${error.message}`);
  }

  return { ok: true, data: (data ?? []) as SocialPostRow[] };
}

/** Mark a post as processing (claimed by this worker). Optimistic: only if still 'scheduled'. */
export function claimPost(client: ReturnType<typeof getAdminClient>, postId: string, expectedStatus = "scheduled") {
  return client
    .from("social_media_posts")
    .update({ status: "processing", claimed_at: new Date().toISOString() })
    .eq("id", postId)
    .eq("status", expectedStatus)
    .select("id")
    .maybeSingle();
}

/** Record a successful publish. */
export async function recordPublishSuccess(
  client: ReturnType<typeof getAdminClient>,
  postId: string,
  platformPostId: string,
  platformPostUrl: string | null,
  status: "published" | "processing" = "published",
) {
  return client
    .from("social_media_posts")
    .update({
      status,
      published_at: status === "published" ? new Date().toISOString() : null,
      platform_post_id: platformPostId,
      platform_post_url: platformPostUrl ?? null,
      error_message: null,
      claimed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId);
}

/** Record a failed publish attempt with exponential backoff. */
export async function recordPublishFailure(
  client: ReturnType<typeof getAdminClient>,
  post: SocialPostRow,
  errorMessage: string,
  safeToRetry = false,
) {
  const { nextRetryCount, nextRetryAt } = calculateNextRetry(post.retry_count ?? 0);

  return client
    .from("social_media_posts")
    .update({
      status: "failed",
      error_message: errorMessage,
      retry_count: nextRetryCount,
      next_retry_at: safeToRetry ? nextRetryAt : null,
      claimed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", post.id);
}


/**
 * Run the full publish queue cycle: claim due posts, publish each one,
 * and record success or failure. Returns a summary of processed posts.
 */
export async function runPublishQueue(): Promise<{
  processed: number;
  published: number;
  failed: number;
  skipped: number;
  errors: string[];
}> {
  const client = getAdminClient();
  const summary = { processed: 0, published: 0, failed: 0, skipped: 0, errors: [] as string[] };

  if (process.env.SOCIAL_PUBLISHING_ENABLED !== "true") { summary.errors.push("Yayınlama yönetici tarafından etkinleştirilmedi."); return summary; }
  const claimResult = await claimDuePosts();
  if (!claimResult.ok) {
    summary.errors.push(claimResult.error);
    return summary;
  }

  const posts = claimResult.data;
  summary.processed = posts.length;

  for (const post of posts) {
    const [{ data: org }, { data: membership }, { data: plan }] = await Promise.all([
      client.from("organizations").select("id,slug").eq("id", post.organization_id).maybeSingle(),
      client.from("organization_members").select("role").eq("organization_id", post.organization_id).eq("user_id", post.created_by || "00000000-0000-0000-0000-000000000000").maybeSingle(),
      client.from("organization_entitlements").select("plan_key,subscription_status,trial_ends_at").eq("organization_id", post.organization_id).maybeSingle(),
    ]);
    const demoOrg = process.env.DEMO_ORG_ID || "d3e00000-0000-0000-0000-000000000000";
    const roleAllowed = ["owner", "admin", "manager", "sales", "sales_rep"].includes(membership?.role || "");
    const planAllowed = ["trial", "growth", "pro", "enterprise"].includes(plan?.plan_key || "") && ["active", "trialing"].includes(plan?.subscription_status || "") && !(plan?.subscription_status === "trialing" && plan.trial_ends_at && Date.parse(plan.trial_ends_at) <= Date.now());
    if (!org || org.id === demoOrg || org.slug === "flowsales-demo" || !roleAllowed || !planAllowed) { summary.skipped++; continue; }
    const claim = await claimPost(client, post.id, post.status);
    if (claim.error || !claim.data) {
      summary.skipped++;
      continue;
    }

    const account = post.social_media_accounts;
    if (!account || account.organization_id !== post.organization_id || account.status !== "connected") {
      await recordPublishFailure(client, post, "Hesap bağlı değil.");
      summary.failed++;
      continue;
    }

    let accessToken: string | null = null;
    if (account.encrypted_access_token && account.encryption_iv) {
      try {
        accessToken = decryptToken({
          encrypted: account.encrypted_access_token,
          iv: account.encryption_iv,
          keyVersion: Number(account.token_encryption_key_version ?? 1),
        });
      } catch {
        // Invalid encrypted credentials must never fall back to plaintext.
      }
    }
    if (!account.encrypted_access_token && !account.encryption_iv && account.access_token) {
      accessToken = account.access_token;
    }

    if (!accessToken) {
      await recordPublishFailure(client, post, "Erişim anahtarı bulunamadı.");
      summary.failed++;
      continue;
    }

    let provider;
    try {
      provider = getProvider(post.platform as never);
    } catch (err) {
      const msg = isSocialMediaError(err) ? err.message : String(err);
      await recordPublishFailure(client, post, "Sağlayıcı yapılandırılmamış: " + msg);
      summary.failed++;
      continue;
    }

    // Idempotency guard: if the post already has a platform_post_id (e.g. worker
    // crashed after a successful publish but before recording it), treat as
    // already published to avoid duplicate posting.
    if (post.platform_post_id) {
      await recordPublishSuccess(
        client,
        post.id,
        post.platform_post_id,
        post.platform_post_url ?? null,
      );
      summary.published++;
      continue;
    }

    try {
      const result = await provider.publish(accessToken, {
        content: post.content,
        media_urls: post.media_urls,
      });
      const saved = await recordPublishSuccess(client, post.id, result.platform_post_id, result.platform_post_url ?? null, result.status);
      if (saved.error) { summary.errors.push("Yayın kabul edildi ancak kayıt güncellenemedi; platformda doğrulama gerekiyor."); summary.failed++; continue; }
      if (result.status === "processing") summary.skipped++; else summary.published++;
    } catch (err) {
      const msg = isSocialMediaError(err) ? err.message : String(err);
      await recordPublishFailure(client, post, msg);
      summary.failed++;
    }
  }

  return summary;
}
