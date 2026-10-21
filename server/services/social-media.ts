import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { getSocialAccess } from "@/server/services/social-access";
import { socialDemoData } from "@/lib/social-media/demo";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProvider, isSocialMediaError } from "@/lib/social-media/registry";
import { encryptToken, decryptToken, isEncryptionConfigured } from "@/lib/crypto";
import {
  connectSocialAccountSchema,
  createSocialMediaPostSchema,
  updateSocialMediaPostSchema,
} from "@/lib/social-media/validation";
import type {
  SocialMediaAccount,
  SocialMediaPost,
  SocialPlatform,
  SocialPostStatus,
} from "@/types/social-media";

type Ok<T> = { ok: true; data: T };
type Fail = { ok: false; error: string; statusCode?: number };
type Result<T> = Ok<T> | Fail;

function fail(message: string, statusCode?: number): Fail {
  return { ok: false, error: message, statusCode };
}

async function getClient() {
  const client = await createSupabaseServerClient();
  if (!client) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return client;
}

function mapAccount(row: Record<string, unknown>): SocialMediaAccount {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    platform: row.platform as SocialPlatform,
    platform_account_id: String(row.platform_account_id ?? ""),
    username: (row.username as string | null) ?? null,
    profile_picture_url: (row.profile_picture_url as string | null) ?? null,
    status: ((row.status as string) ?? "connected") as
      | "connected"
      | "disconnected"
      | "expired"
      | "error",
    scopes: Array.isArray(row.scopes) ? (row.scopes as string[]) : [],
    token_expires_at: (row.token_expires_at as string | null) ?? null,
    connected_at: String(row.connected_at),
    updated_at: String(row.updated_at),
  };
}

function mapPost(row: Record<string, unknown>): SocialMediaPost {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    account_id: (row.account_id as string | null) ?? null,
    platform: row.platform as SocialPlatform,
    status: row.status as SocialPostStatus,
    content: String(row.content ?? ""),
    media_urls: Array.isArray(row.media_urls) ? (row.media_urls as string[]) : [],
    scheduled_at: (row.scheduled_at as string | null) ?? null,
    published_at: (row.published_at as string | null) ?? null,
    platform_post_id: (row.platform_post_id as string | null) ?? null,
    platform_post_url: (row.platform_post_url as string | null) ?? null,
    error_message: (row.error_message as string | null) ?? null,
    retry_count: Number(row.retry_count ?? 0),
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/** Resolve a usable access token for an account row. Prefers the encrypted
 *  column; falls back to the legacy plaintext column for backwards compat. */
function resolveAccountToken(row: Record<string, unknown>): string | null {
  if (row.encrypted_access_token || row.encryption_iv) {
    if (!row.encrypted_access_token || !row.encryption_iv) return null;
    try {
      return decryptToken({
        encrypted: String(row.encrypted_access_token),
        iv: String(row.encryption_iv),
        keyVersion: Number(row.token_encryption_key_version ?? 1),
      });
    } catch {
      return null; // Never bypass failed authenticated decryption.
    }
  }
  const legacy = row.access_token;
  if (legacy && typeof legacy === "string" && legacy.length > 0) {
    return legacy;
  }
  return null;
}

/** List connected social accounts for the current organization. */
export async function listSocialMediaAccounts(): Promise<Result<SocialMediaAccount[]>> {
  const access = await getSocialAccess();
  if (access.demo) return { ok: true, data: socialDemoData(access.workspace.organization.id).accounts };
  if (!access.workspace.userId) return fail("Oturum gerekli.", 401);
  const client = await getClient();
  const { data: authData } = await client.auth.getUser();
  const user = authData.user;
  if (!user) {
    return fail("Authentication required.", 401);
  }
  const userId = user!.id;

  const { data: membership, error: membershipError } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    return fail("No workspace membership found.", 403);
  }

  const { data, error } = await client
    .from("social_media_accounts")
    .select("id, organization_id, platform, platform_account_id, username, profile_picture_url, status, scopes, token_expires_at, connected_at, updated_at")
    .eq("organization_id", membership.organization_id)
    .order("created_at", { ascending: false });

  if (error) {
    return fail("Hesaplar yüklenemedi. Sosyal medya altyapısının kurulu olduğunu yöneticinizle doğrulayın.", 503);
  }

  return { ok: true, data: (data ?? []).map(mapAccount) };
}


/** Connect an account by exchanging an OAuth authorization code via the platform provider. */
export async function connectSocialAccount(input: unknown): Promise<Result<SocialMediaAccount>> {
  const parsed = connectSocialAccountSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      (parsed.error as { issues?: Array<{ message: string }> }).issues?.[0]?.message ??
        "Geçersiz bağlantı istemi.",
      400,
    );
  }
  const { platform, code, redirect_uri } = parsed.data;

  const access = await getSocialAccess();
  if (!access.workspace.userId || !access.canConnect) return fail(access.reason || "Bu işlem için yetkiniz yok.", 403);
  const client = await getClient();
  const { data: authData } = await client.auth.getUser();
  const user = authData.user;
  if (!user) {
    return fail("Authentication required.", 401);
  }
  const userId = user!.id;

  const { data: membership } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!membership) {
    return fail("No workspace membership found.", 403);
  }

  const tokenClient = createSupabaseAdminClient();
  let provider;
  try {
    provider = getProvider(platform);
  } catch (error) {
    if (isSocialMediaError(error)) {
      return fail(error.message, error.statusCode);
    }
    return fail(String(error), 500);
  }

  let tokens;
  try {
    tokens = await provider.exchangeCode(code, redirect_uri);
  } catch (error) {
    if (isSocialMediaError(error)) {
      return fail(error.message, error.statusCode);
    }
    return fail(String(error), 500);
  }

  if (!tokens.platform_account_id) {
    return fail("Provider did not return a platform account id.", 502);
  }

  // Validate the token works by fetching the account identity.
  let accountIdentity;
  try {
    accountIdentity = await provider.getAccount(tokens.access_token);
  } catch (error) {
    if (isSocialMediaError(error)) {
      return fail(`Account validation failed: ${error.message}`, error.statusCode);
    }
    return fail(String(error), 502);
  }

  // Encrypt the access token at rest. Fail closed if encryption is not configured.
  if (!isEncryptionConfigured()) {
    return fail(
      "Token encryption is not configured. Set SOCIAL_TOKEN_ENCRYPTION_KEY in .env.local.",
      503,
    );
  }
  const { encrypted, iv: encryptionIv, keyVersion } = encryptToken(tokens.access_token);

  const refresh = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null;
  const now = new Date().toISOString();
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  const { data, error } = await tokenClient
    .from("social_media_accounts")
    .upsert(
      {
        organization_id: membership.organization_id,
        platform,
        platform_account_id: tokens.platform_account_id,
        username: accountIdentity.username ?? tokens.username ?? null,
        profile_picture_url: accountIdentity.profile_picture_url ?? null,
        access_token: "", // placeholder; real token lives in encrypted_access_token
        refresh_token: null,
        encrypted_refresh_token: refresh?.encrypted ?? null,
        refresh_encryption_iv: refresh?.iv ?? null,
        encrypted_access_token: encrypted,
        encryption_iv: encryptionIv,
        token_encryption_key_version: keyVersion,
        token_expires_at: expiresAt,
        scopes: tokens.scopes ?? [],
        status: "connected",
        updated_at: now,
      },
      { onConflict: "organization_id, platform, platform_account_id" },
    )
    .select("id, organization_id, platform, platform_account_id, username, profile_picture_url, status, scopes, token_expires_at, connected_at, updated_at")
    .single();

  if (error) {
    return fail(`Failed to save account: ${error.message}`, 500);
  }

  return { ok: true, data: mapAccount(data) };
}


/** Disconnect (revoke locally) a social account. */
export async function disconnectSocialAccount(accountId: string): Promise<Result<null>> {
  const access = await getSocialAccess();
  if (!access.workspace.userId || !access.canConnect) return fail(access.reason || "Bu işlem için yetkiniz yok.", 403);
  const client = await getClient();
  const { data: authData } = await client.auth.getUser();
  const user = authData.user;
  if (!user) {
    return fail("Authentication required.", 401);
  }
  const userId = user!.id;

  const { data: membership } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!membership) {
    return fail("No workspace membership found.", 403);
  }

  const tokenClient = createSupabaseAdminClient();
  const { error } = await tokenClient
    .from("social_media_accounts")
    .update({ status: "disconnected", access_token: "", refresh_token: null, encrypted_refresh_token: null, refresh_encryption_iv: null, encrypted_access_token: null, encryption_iv: null, updated_at: new Date().toISOString() })
    .eq("id", accountId)
    .eq("organization_id", membership.organization_id);

  if (error) {
    return fail(`Failed to disconnect account: ${error.message}`, 500);
  }

  return { ok: true, data: null };
}

/** List posts for the current organization, newest first. */
export async function listSocialMediaPosts(filters?: {
  status?: SocialPostStatus;
  platform?: SocialPlatform;
  limit?: number;
}): Promise<Result<SocialMediaPost[]>> {
  const access = await getSocialAccess();
  if (access.demo) return { ok: true, data: socialDemoData(access.workspace.organization.id).posts };
  if (!access.workspace.userId) return fail("Oturum gerekli.", 401);
  const client = await getClient();
  const { data: authData } = await client.auth.getUser();
  const user = authData.user;
  if (!user) {
    return fail("Authentication required.", 401);
  }
  const userId = user!.id;

  const { data: membership } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!membership) {
    return fail("No workspace membership found.", 403);
  }

  let query = client
    .from("social_media_posts")
    .select("*")
    .eq("organization_id", membership.organization_id)
    .order("created_at", { ascending: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.platform) {
    query = query.eq("platform", filters.platform);
  }
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  if (error) {
    return fail("Gönderiler yüklenemedi. Sosyal medya altyapısının kurulu olduğunu yöneticinizle doğrulayın.", 503);
  }

  return { ok: true, data: (data ?? []).map(mapPost) };
}


/** Create a draft or scheduled post. */
export async function createSocialMediaPost(
  input: unknown,
): Promise<Result<SocialMediaPost>> {
  const parsed = createSocialMediaPostSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      (parsed.error as { issues?: Array<{ message: string }> }).issues?.[0]?.message ??
        "Geçersiz gönderi istemi.",
      400,
    );
  }
  const { account_id, platform, status, content, media_urls, scheduled_at } = parsed.data;

  const access = await getSocialAccess();
  if (!access.workspace.userId || !access.canPublish) return fail(access.reason || "Bu işlem için yetkiniz yok.", 403);
  const client = await getClient();
  const { data: authData } = await client.auth.getUser();
  const user = authData.user;
  if (!user) {
    return fail("Authentication required.", 401);
  }
  const userId = user!.id;

  const { data: membership } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!membership) {
    return fail("No workspace membership found.", 403);
  }

  if (status === "scheduled" && (!account_id || !scheduled_at || Date.parse(scheduled_at) <= Date.now())) return fail("Zamanlanmış yayın için bağlı hesap ve gelecekte bir tarih gerekir.", 400);
  if (account_id) {
    const { data: account, error: accountError } = await client
      .from("social_media_accounts")
      .select("id, platform, status")
      .eq("id", account_id)
      .eq("organization_id", membership.organization_id)
      .maybeSingle();
    if (accountError || !account) {
      return fail("Hesap bulunamadı veya bu işleme yetkiniz yok.", 404);
    }
    if (account.platform !== platform) {
      return fail("Hesap platformu gönderi platformuyla eşleşmiyor.", 400);
    }
    if (account.status !== "connected") {
      return fail("Hesap bağlı değil. Lütfen hesabı yeniden bağlayın.", 400);
    }
  }

  const { data, error } = await createSupabaseAdminClient()
    .from("social_media_posts")
    .insert({
      organization_id: membership.organization_id,
      account_id: account_id ?? null,
      platform,
      status,
      content,
      media_urls,
      scheduled_at: scheduled_at ?? null,
      created_by: userId,
    })
    .select("*")
    .single();

  if (error) {
    return fail(`Failed to create post: ${error.message}`, 500);
  }

  return { ok: true, data: mapPost(data) };
}


/** Update a post (content, schedule, status). */
export async function updateSocialMediaPost(
  postId: string,
  input: unknown,
): Promise<Result<SocialMediaPost>> {
  const parsed = updateSocialMediaPostSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      (parsed.error as { issues?: Array<{ message: string }> }).issues?.[0]?.message ??
        "Geçersiz güncelleme istemi.",
      400,
    );
  }

  const access = await getSocialAccess();
  if (!access.workspace.userId || !access.canPublish) return fail(access.reason || "Bu işlem için yetkiniz yok.", 403);
  const client = await getClient();
  const { data: authData } = await client.auth.getUser();
  const user = authData.user;
  if (!user) {
    return fail("Authentication required.", 401);
  }
  const userId = user!.id;

  const { data: membership } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!membership) {
    return fail("No workspace membership found.", 403);
  }

  const { data: existing } = await client.from("social_media_posts").select("status, account_id").eq("id", postId).eq("organization_id", membership.organization_id).maybeSingle();
  if (parsed.data.status === "scheduled" && (!parsed.data.scheduled_at || Date.parse(parsed.data.scheduled_at) <= Date.now())) return fail("Gelecekte bir yayın tarihi seçin.", 400);
  if (!existing || !["draft", "failed"].includes(existing.status)) return fail("Yalnızca taslak veya başarısız gönderiler düzenlenebilir.", 409);
  if (parsed.data.status === "scheduled" && !existing.account_id) return fail("Yayın için bağlı bir hesap gerekir.", 400);
  const updates: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() };
  if (updates.status === "published") {
    updates.published_at = new Date().toISOString();
  }

  const { data, error } = await createSupabaseAdminClient()
    .from("social_media_posts")
    .update(updates)
    .eq("id", postId)
    .eq("organization_id", membership.organization_id)
    .eq("status", existing.status)
    .select("*")
    .single();

  if (error) {
    return fail(`Failed to update post: ${error.message}`, 500);
  }

  return { ok: true, data: mapPost(data) };
}


/** Publish a scheduled/draft post immediately via the platform provider. */
export async function publishSocialMediaPost(postId: string): Promise<Result<SocialMediaPost>> {
  const access = await getSocialAccess();
  if (!access.workspace.userId || !access.canPublish) return fail(access.reason || "Bu işlem için yetkiniz yok.", 403);
  const client = await getClient();
  const { data: authData } = await client.auth.getUser();
  const user = authData.user;
  if (!user) {
    return fail("Authentication required.", 401);
  }
  const userId = user!.id;

  const { data: membership } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!membership) {
    return fail("No workspace membership found.", 403);
  }

  const tokenClient = createSupabaseAdminClient();
  const { data: post, error: postError } = await tokenClient
    .from("social_media_posts")
    .select("*, social_media_accounts(access_token, encrypted_access_token, encryption_iv, token_encryption_key_version, platform_account_id, status, platform)")
    .eq("id", postId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();

  if (postError || !post) {
    return fail("Gönderi bulunamadı.", 404);
  }

  const account = post.social_media_accounts as
    | {
        access_token: string;
        encrypted_access_token: string | null;
        encryption_iv: string | null;
        token_encryption_key_version: number | null;
        platform_account_id: string;
        status: string;
        platform: string;
      }
    | null;

  if (!account || account.status !== "connected") {
    return fail("Hesap bağlı değil. Lütfen hesabı yeniden bağlayın ve tekrar deneyin.", 400);
  }

  // Idempotency guard: if already published, return the existing record instead
  // of publishing again (protects against duplicate posting on retry).
  if (post.platform_post_id) {
    return { ok: true, data: mapPost(post) };
  }

  if (!["draft", "scheduled", "failed"].includes(post.status)) return fail("Gönderi zaten işleniyor veya yayımlanmış.", 409);

  const accessToken = resolveAccountToken(account);
  if (!accessToken) {
    return fail("Hesap için erişim token'ı bulunamadı. Lütfen hesabı yeniden bağlayın.", 400);
  }

  let provider;
  try {
    provider = getProvider(post.platform as SocialPlatform);
  } catch (error) {
    if (isSocialMediaError(error)) {
      return fail(error.message, error.statusCode);
    }
    return fail(String(error), 500);
  }

  const { data: claimed, error: claimError } = await createSupabaseAdminClient().from("social_media_posts").update({ status: "processing", claimed_at: new Date().toISOString() }).eq("id", postId).eq("organization_id", membership.organization_id).eq("status", post.status).select("id").maybeSingle();
  if (claimError || !claimed) return fail("Gönderi başka bir işlem tarafından alındı.", 409);
  let result;
  try {
    result = await provider.publish(accessToken, {
      content: post.content,
      media_urls: post.media_urls,
    });
  } catch {
    await createSupabaseAdminClient().from("social_media_posts").update({ status: "failed", error_message: "Yayın sonucu doğrulanamadı. Tekrar denemeden önce platform hesabını kontrol edin.", claimed_at: null, next_retry_at: null }).eq("id", postId).eq("organization_id", membership.organization_id).eq("status", "processing");
    return fail("Yayın sonucu doğrulanamadı. Tekrar denemeden önce platform hesabını kontrol edin.", 502);
  }

  const { data, error } = await createSupabaseAdminClient()
    .from("social_media_posts")
    .update({
      status: result.status || "published",
      published_at: result.status === "processing" ? null : new Date().toISOString(),
      platform_post_id: result.platform_post_id,
      platform_post_url: result.platform_post_url ?? null,
      error_message: null,
      claimed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId)
    .eq("organization_id", membership.organization_id)
    .select("*")
    .single();

  if (error) {
    return fail("Platform yayını kabul etti ancak kayıt güncellenemedi. Yeniden yayımlamadan önce platform hesabını kontrol edin.", 502);
  }

  return { ok: true, data: mapPost(data) };
}
