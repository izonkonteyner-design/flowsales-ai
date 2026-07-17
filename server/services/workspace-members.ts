import { createHash, randomBytes } from "node:crypto";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeMemberEmailValue, normalizeMemberSearchValue, type InviteMemberInput, type RemoveMemberInput, type UpdateMemberRoleInput } from "@/lib/validations/workspace-member";
import { type InvitationAcceptanceInput, type InvitationLookupInput } from "@/lib/validations/workspace-invitation";
import { getWorkspaceContext, type WorkspaceContext, type WorkspaceRole } from "@/server/services/workspace-context";
import { demoTeam } from "@/server/services/workspace-data";

type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

export type WorkspaceMemberRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
  updated_at: string;
};

export type WorkspaceInvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export type WorkspaceInvitationRow = {
  id: string;
  organization_id: string;
  email: string;
  role: WorkspaceRole;
  status: "pending" | "accepted" | "revoked";
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkspaceMemberRecord = WorkspaceMemberRow & {
  full_name: string;
  joined_label: string;
  is_current_user: boolean;
  can_edit_role: boolean;
  can_remove: boolean;
};

export type WorkspaceInvitationRecord = WorkspaceInvitationRow & {
  computed_status: WorkspaceInvitationStatus;
  invited_label: string;
  expires_label: string;
  invitation_url?: string;
};

export type WorkspaceMembersPageData = {
  context: WorkspaceContext;
  members: WorkspaceMemberRecord[];
  invitations: WorkspaceInvitationRecord[];
  can_manage: boolean;
  search: string;
  error: string | null;
};

export type WorkspaceInvitationPreview = {
  invitation: WorkspaceInvitationRecord | null;
  organizationName: string | null;
  organizationSlug: string | null;
  emailMatchesCurrentUser: boolean | null;
  authenticated: boolean;
  userEmail: string | null;
};

export type InviteWorkspaceMemberResult = {
  invitation: WorkspaceInvitationRecord;
  invitationUrl: string;
};

function getAppOrigin() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function buildInvitationUrl(token: string) {
  const url = new URL(`/invite/${token}`, getAppOrigin());
  return url.toString();
}

function generateInvitationToken() {
  return randomBytes(32).toString("base64url");
}

function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeInvitationStatus(invitation: Pick<WorkspaceInvitationRow, "status" | "expires_at">, now = new Date()): WorkspaceInvitationStatus {
  if (invitation.status === "revoked") {
    return "revoked";
  }

  if (invitation.status === "accepted") {
    return "accepted";
  }

  if (new Date(invitation.expires_at).getTime() <= now.getTime()) {
    return "expired";
  }

  return "pending";
}

function formatJoinedLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatExpiryLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function mapDemoMembers(context: WorkspaceContext): WorkspaceMemberRecord[] {
  return demoTeam.map((member, index) => ({
    id: member.id,
    organization_id: context.organization.id,
    user_id: member.id,
    role: member.role,
    created_at: new Date(Date.now() - (index + 1) * 86400000).toISOString(),
    updated_at: new Date(Date.now() - (index + 1) * 43200000).toISOString(),
    full_name: member.name,
    joined_label: `${index + 1} day${index === 0 ? "" : "s"} ago`,
    is_current_user: index === 0,
    can_edit_role: false,
    can_remove: false,
  }));
}

function mapDemoInvitations(): WorkspaceInvitationRecord[] {
  return [];
}

function mapRoleCanEdit(role: WorkspaceRole, isCurrentUser: boolean) {
  return role !== "owner" && !isCurrentUser;
}

function mapRoleCanRemove(role: WorkspaceRole, isCurrentUser: boolean) {
  return role !== "owner" && !isCurrentUser;
}

function mapMemberRecord(row: WorkspaceMemberRow, fullName: string, currentUserId: string | null): WorkspaceMemberRecord {
  const isCurrentUser = row.user_id === currentUserId;
  return {
    ...row,
    full_name: fullName,
    joined_label: formatJoinedLabel(row.created_at),
    is_current_user: isCurrentUser,
    can_edit_role: mapRoleCanEdit(row.role, isCurrentUser),
    can_remove: mapRoleCanRemove(row.role, isCurrentUser),
  };
}

function mapInvitationRecord(row: WorkspaceInvitationRow): WorkspaceInvitationRecord {
  return {
    ...row,
    computed_status: normalizeInvitationStatus(row),
    invited_label: row.email,
    expires_label: formatExpiryLabel(row.expires_at),
  };
}

function normalizeInvitationInputEmail(value: string) {
  return normalizeMemberEmailValue(value);
}

async function getLiveWorkspaceClient() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live") {
    return null;
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    return null;
  }

  return { context, client };
}

function canManageWorkspaceMembers(role: WorkspaceRole | null | undefined) {
  return role === "owner" || role === "admin";
}

export function canManageWorkspaceMembersRole(role: WorkspaceRole | null | undefined) {
  return canManageWorkspaceMembers(role);
}

export function isWorkspaceMemberInOrganization(member: Pick<WorkspaceMemberRow, "organization_id">, organizationId: string) {
  return member.organization_id === organizationId;
}

export function isWorkspaceInvitationInOrganization(
  invitation: Pick<WorkspaceInvitationRow, "organization_id">,
  organizationId: string,
) {
  return invitation.organization_id === organizationId;
}

export function hasPendingWorkspaceInvitationForEmail(
  invitations: Array<Pick<WorkspaceInvitationRow, "email" | "status" | "expires_at">>,
  email: string,
) {
  const normalizedEmail = normalizeInvitationInputEmail(email);
  return invitations.some((invitation) => normalizeInvitationInputEmail(invitation.email) === normalizedEmail && normalizeInvitationStatus(invitation) === "pending");
}

export function hasWorkspaceMemberForUserId(members: Array<Pick<WorkspaceMemberRow, "organization_id" | "user_id">>, organizationId: string, userId: string) {
  return members.some((member) => member.organization_id === organizationId && member.user_id === userId);
}

export function canMutateWorkspaceMembers(context: WorkspaceContext) {
  return context.mode === "live" && canManageWorkspaceMembers(context.role);
}

export function canChangeWorkspaceMemberRole(context: WorkspaceContext, member: WorkspaceMemberRecord) {
  return canMutateWorkspaceMembers(context) && !member.is_current_user && member.role !== "owner";
}

export function canRemoveWorkspaceMember(context: WorkspaceContext, member: WorkspaceMemberRecord) {
  return canMutateWorkspaceMembers(context) && !member.is_current_user && member.role !== "owner";
}

export function canManageWorkspaceInvitations(context: WorkspaceContext) {
  return canMutateWorkspaceMembers(context);
}

export function hashWorkspaceInvitationToken(token: string) {
  return hashInvitationToken(token);
}

export function generateWorkspaceInvitationTokenValue() {
  return generateInvitationToken();
}

export function buildWorkspaceInvitationUrl(token: string) {
  return buildInvitationUrl(token);
}

export function normalizeWorkspaceInvitationStatus(row: Pick<WorkspaceInvitationRow, "status" | "expires_at">) {
  return normalizeInvitationStatus(row);
}

export async function getWorkspaceMembersPageData(search = ""): Promise<WorkspaceMembersPageData> {
  const context = await getWorkspaceContext();
  const normalizedSearch = normalizeMemberSearchValue(search).toLowerCase();

  if (context.mode === "demo") {
    const members = mapDemoMembers(context);
    return {
      context,
      members: normalizedSearch
        ? members.filter((member) => `${member.full_name} ${member.role}`.toLowerCase().includes(normalizedSearch))
        : members,
      invitations: mapDemoInvitations(),
      can_manage: false,
      search: normalizedSearch,
      error: null,
    };
  }

  const live = await getLiveWorkspaceClient();
  if (!live) {
    return {
      context,
      members: [],
      invitations: [],
      can_manage: false,
      search: normalizedSearch,
      error: "Unable to load workspace members right now.",
    };
  }

  const { client } = live;
  const { data: memberRows, error: memberError } = await client
    .from("organization_members")
    .select("id, organization_id, user_id, role, created_at, updated_at")
    .eq("organization_id", context.organization.id)
    .order("created_at", { ascending: false });

  if (memberError) {
    return {
      context,
      members: [],
      invitations: [],
      can_manage: false,
      search: normalizedSearch,
      error: "Unable to load workspace members right now.",
    };
  }

  let memberNames = new Map<string, string>();
  try {
    const { data } = await client.rpc("get_org_member_options", {
      target_org: context.organization.id,
    });

    memberNames = new Map((data ?? []).map((member: { user_id: string; full_name: string }) => [member.user_id, member.full_name]));
  } catch {
    memberNames = new Map();
  }

  const members = (memberRows ?? []).map((row) => mapMemberRecord(row as WorkspaceMemberRow, memberNames.get(row.user_id) ?? "Team member", context.userId));

  const filteredMembers = normalizedSearch
    ? members.filter((member) => `${member.full_name} ${member.role}`.toLowerCase().includes(normalizedSearch))
    : members;

  let invitations: WorkspaceInvitationRecord[] = [];
  if (canManageWorkspaceMembers(context.role)) {
    const { data: inviteRows, error: inviteError } = await client
      .from("workspace_invitations")
      .select("id, organization_id, email, role, status, expires_at, accepted_at, revoked_at, invited_by, created_at, updated_at")
      .eq("organization_id", context.organization.id)
      .order("created_at", { ascending: false });

    if (!inviteError) {
      invitations = (inviteRows ?? []).map((row) => mapInvitationRecord(row as WorkspaceInvitationRow));
    }
  }

  const filteredInvitations = normalizedSearch
    ? invitations.filter((invite) => `${invite.email} ${invite.role} ${invite.computed_status}`.toLowerCase().includes(normalizedSearch))
    : invitations;

  return {
    context,
    members: filteredMembers,
    invitations: filteredInvitations,
    can_manage: canManageWorkspaceMembers(context.role),
    search: normalizedSearch,
    error: null,
  };
}

async function getAuthenticatedUser(client: SupabaseServerClient) {
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    throw new Error("You must be signed in to perform this action.");
  }

  return user;
}

async function assertLiveManageAccess(context: WorkspaceContext) {
  if (context.mode !== "live") {
    throw new Error("Workspace member management requires live Supabase data.");
  }

  if (!canManageWorkspaceMembers(context.role)) {
    throw new Error("You do not have permission to manage workspace members.");
  }
}

async function loadMemberById(client: SupabaseServerClient, organizationId: string, memberId: string) {
  const { data, error } = await client
    .from("organization_members")
    .select("id, organization_id, user_id, role, created_at, updated_at")
    .eq("organization_id", organizationId)
    .eq("id", memberId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Member not found in this workspace.");
  }

  return data as WorkspaceMemberRow;
}

async function countOwners(client: SupabaseServerClient, organizationId: string) {
  const { count, error } = await client
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("role", "owner");

  if (error) {
    throw new Error(error.message || "Unable to verify owner count.");
  }

  return count ?? 0;
}

export async function inviteWorkspaceMember(input: InviteMemberInput) {
  const live = await getLiveWorkspaceClient();
  if (!live) {
    throw new Error("Invite member is unavailable in demo mode.");
  }

  await assertLiveManageAccess(live.context);
  const user = await getAuthenticatedUser(live.client);
  const normalizedEmail = normalizeInvitationInputEmail(input.email);
  const invitationToken = generateInvitationToken();
  const invitationTokenHash = hashInvitationToken(invitationToken);

  const { data: existingPending, error: existingPendingError } = await live.client
    .from("workspace_invitations")
    .select("id")
    .eq("organization_id", live.context.organization.id)
    .ilike("email", normalizedEmail)
    .eq("status", "pending")
    .maybeSingle();

  if (existingPendingError) {
    throw new Error(existingPendingError.message || "Unable to check invitation state.");
  }

  if (existingPending) {
    throw new Error("An invitation is already pending for that email address.");
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await live.client
    .from("workspace_invitations")
    .insert({
      organization_id: live.context.organization.id,
      email: normalizedEmail,
      role: input.role,
      token_hash: invitationTokenHash,
      invited_by: user.id,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id, organization_id, email, role, status, expires_at, accepted_at, revoked_at, invited_by, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Unable to create the invitation.");
  }

  const invitation = mapInvitationRecord(data as WorkspaceInvitationRow);
  return {
    invitation,
    invitationUrl: buildInvitationUrl(invitationToken),
  } satisfies InviteWorkspaceMemberResult;
}

export async function resendWorkspaceInvitation(invitationId: string) {
  const live = await getLiveWorkspaceClient();
  if (!live) {
    throw new Error("Resend invitation is unavailable in demo mode.");
  }

  await assertLiveManageAccess(live.context);
  const currentInvitation = await getWorkspaceInvitationById(live.client, live.context.organization.id, invitationId);
  if (normalizeWorkspaceInvitationStatus(currentInvitation) !== "pending") {
    throw new Error("Only pending invitations can be resent.");
  }

  const token = generateInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await live.client
    .from("workspace_invitations")
    .update({
      token_hash: tokenHash,
      expires_at: expiresAt,
      status: "pending",
      accepted_at: null,
      revoked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", live.context.organization.id)
    .eq("id", invitationId)
    .select("id, organization_id, email, role, status, expires_at, accepted_at, revoked_at, invited_by, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Unable to resend the invitation.");
  }

  return {
    invitation: mapInvitationRecord(data as WorkspaceInvitationRow),
    invitationUrl: buildInvitationUrl(token),
  } satisfies InviteWorkspaceMemberResult;
}

export async function revokeWorkspaceInvitation(invitationId: string) {
  const live = await getLiveWorkspaceClient();
  if (!live) {
    throw new Error("Revoke invitation is unavailable in demo mode.");
  }

  await assertLiveManageAccess(live.context);
  const invitation = await getWorkspaceInvitationById(live.client, live.context.organization.id, invitationId);
  if (normalizeWorkspaceInvitationStatus(invitation) !== "pending") {
    throw new Error("Only pending invitations can be revoked.");
  }

  const { error } = await live.client
    .from("workspace_invitations")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", live.context.organization.id)
    .eq("id", invitationId);

  if (error) {
    throw new Error(error.message || "Unable to revoke the invitation.");
  }
}

export async function updateWorkspaceMemberRole(input: UpdateMemberRoleInput) {
  const live = await getLiveWorkspaceClient();
  if (!live) {
    throw new Error("Role changes are unavailable in demo mode.");
  }

  await assertLiveManageAccess(live.context);
  const member = await loadMemberById(live.client, live.context.organization.id, input.member_id);

  if (!canChangeWorkspaceMemberRole(live.context, mapMemberRecord(member, "Team member", live.context.userId))) {
    throw new Error("You cannot change this member's role.");
  }

  const { error } = await live.client
    .from("organization_members")
    .update({ role: input.role, updated_at: new Date().toISOString() })
    .eq("organization_id", live.context.organization.id)
    .eq("id", input.member_id);

  if (error) {
    throw new Error(error.message || "Unable to update member role.");
  }
}

export async function removeWorkspaceMember(input: RemoveMemberInput) {
  const live = await getLiveWorkspaceClient();
  if (!live) {
    throw new Error("Member removal is unavailable in demo mode.");
  }

  await assertLiveManageAccess(live.context);
  const member = await loadMemberById(live.client, live.context.organization.id, input.member_id);

  if (!canRemoveWorkspaceMember(live.context, mapMemberRecord(member, "Team member", live.context.userId))) {
    throw new Error("You cannot remove this member.");
  }

  if ((await countOwners(live.client, live.context.organization.id)) <= 1 && member.role === "owner") {
    throw new Error("You cannot remove the final owner.");
  }

  const { error } = await live.client
    .from("organization_members")
    .delete()
    .eq("organization_id", live.context.organization.id)
    .eq("id", input.member_id);

  if (error) {
    throw new Error(error.message || "Unable to remove member.");
  }
}

export async function getWorkspaceInvitationPreview(input: InvitationLookupInput): Promise<WorkspaceInvitationPreview> {
  const client = await createSupabaseServerClient();
  if (!client) {
    return {
      invitation: null,
      organizationName: null,
      organizationSlug: null,
      emailMatchesCurrentUser: null,
      authenticated: false,
      userEmail: null,
    };
  }

  const { data: userResult } = await client.auth.getUser();
  const user = userResult.user;
  const { data, error } = await client.rpc("get_workspace_invitation_preview", {
    invitation_token: input.token,
  });

  if (error || !data || !Array.isArray(data) || data.length === 0) {
    return {
      invitation: null,
      organizationName: null,
      organizationSlug: null,
      emailMatchesCurrentUser: null,
      authenticated: Boolean(user),
      userEmail: user?.email ?? null,
    };
  }

  const preview = data[0] as {
    invitation_id: string;
    organization_id: string;
    organization_name: string;
    organization_slug: string;
    email: string;
    role: WorkspaceRole;
    status: "pending" | "accepted" | "revoked";
    expires_at: string;
    accepted_at: string | null;
    revoked_at: string | null;
    invited_by: string | null;
    created_at: string;
    updated_at: string;
  };

  const invitation = mapInvitationRecord({
    id: preview.invitation_id,
    organization_id: preview.organization_id,
    email: preview.email,
    role: preview.role,
    status: preview.status,
    expires_at: preview.expires_at,
    accepted_at: preview.accepted_at,
    revoked_at: preview.revoked_at,
    invited_by: preview.invited_by,
    created_at: preview.created_at,
    updated_at: preview.updated_at,
  });

  return {
    invitation,
    organizationName: preview.organization_name,
    organizationSlug: preview.organization_slug,
    emailMatchesCurrentUser: user ? normalizeInvitationInputEmail(user.email ?? "") === normalizeInvitationInputEmail(preview.email) : null,
    authenticated: Boolean(user),
    userEmail: user?.email ?? null,
  };
}

export async function acceptWorkspaceInvitation(input: InvitationAcceptanceInput) {
  const client = await createSupabaseServerClient();
  if (!client) {
    throw new Error("Authentication is required to accept invitations.");
  }

  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();

  if (userError || !user || !user.email) {
    throw new Error("Authentication is required to accept invitations.");
  }

  const { error } = await client.rpc("accept_workspace_invitation", {
    invitation_token: input.token,
    actor_user_id: user.id,
    actor_email: user.email,
  });

  if (error) {
    throw new Error(error.message || "Unable to accept the invitation.");
  }

  return {
    organizationId: null,
    organizationName: null,
    role: null,
  };
}

async function getWorkspaceInvitationById(client: SupabaseServerClient, organizationId: string, invitationId: string) {
  const { data, error } = await client
    .from("workspace_invitations")
    .select("id, organization_id, email, role, status, expires_at, accepted_at, revoked_at, invited_by, created_at, updated_at")
    .eq("organization_id", organizationId)
    .eq("id", invitationId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Invitation not found in this workspace.");
  }

  return data as WorkspaceInvitationRow;
}
