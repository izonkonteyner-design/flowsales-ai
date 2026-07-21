import Link from "next/link";
import { Search } from "lucide-react";

import { FlashToast } from "@/components/shared/flash-toast";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { MemberInviteForm } from "@/components/settings/member-invite-form";
import { ConfirmFormButton } from "@/components/settings/confirm-form-button";
import {
  canManageWorkspaceMembersRole,
  getWorkspaceMembersPageData,
  type WorkspaceInvitationRecord,
  type WorkspaceMemberRecord,
} from "@/server/services/workspace-members";
import { removeMemberAction, resendInvitationAction, revokeInvitationAction, updateMemberRoleAction } from "@/app/(app)/settings/members/actions";

type MembersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MembersPage({ searchParams }: MembersPageProps) {
  const rawSearchParams = await searchParams;
  const query = typeof rawSearchParams.query === "string" ? rawSearchParams.query : "";
  const toastMessage = typeof rawSearchParams.toast === "string" ? rawSearchParams.toast : "";
  const toastTone =
    rawSearchParams.tone === "danger" || rawSearchParams.tone === "warning" || rawSearchParams.tone === "info"
      ? rawSearchParams.tone
      : "success";

  const data = await getWorkspaceMembersPageData(query);
  const canManage = canManageWorkspaceMembersRole(data.context.role) && data.context.mode === "live";

  return (
    <div className="space-y-6">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}

      <PageHeader
        eyebrow="Workspace"
        title="Members"
        description="Manage invitations, roles, and workspace access boundaries."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={data.context.mode === "live" ? "success" : "warning"}>
              {data.context.mode === "live" ? "Live workspace" : "Demo workspace"}
            </StatusBadge>
            <Link
              href="/settings"
              className="inline-flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
            >
              Workspace settings
            </Link>
          </div>
        }
      />

      {data.error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100">
          {data.error}
        </div>
      ) : null}

      <SectionCard title="Search" description="Filter by member name, email, role, or invitation status.">
        <form className="flex flex-col gap-3 sm:flex-row" method="get">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input name="query" defaultValue={data.search} placeholder="Search members and invitations" className="pl-10" />
          </label>
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            Search
          </button>
        </form>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.95fr]">
        <SectionCard title="Current members" description="All workspace members with role badges and joined dates.">
          <MembersTable members={data.members} canManage={canManage} />
        </SectionCard>

        <SectionCard
          title="Invite member"
          description={canManage ? "Send a secure invitation link to a teammate." : "Only owners and admins can manage invitations."}
        >
          <MemberInviteForm canManage={canManage} />
        </SectionCard>
      </div>

      <SectionCard title="Pending invitations" description="Track outstanding invitations, resend links, or revoke access.">
        {data.invitations.length > 0 ? (
          <div className="space-y-3">
            {data.invitations.map((invitation) => (
              <InvitationRow key={invitation.id} invitation={invitation} canManage={canManage} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No pending invitations"
            description={canManage ? "Invite a teammate above to start collaborating." : "You can view members but cannot manage invitations in this workspace."}
          />
        )}
      </SectionCard>
    </div>
  );
}

function MembersTable({ members, canManage }: { members: WorkspaceMemberRecord[]; canManage: boolean }) {
  if (members.length === 0) {
    return (
      <EmptyState
        title="No members found"
        description={canManage ? "Invite the first teammate to populate the workspace." : "This workspace currently has no members to show."}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="hidden overflow-hidden rounded-3xl border border-slate-200/80 dark:border-white/10 lg:block">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-white/10">
          <thead className="bg-slate-50 dark:bg-white/5">
            <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white dark:divide-white/10 dark:bg-slate-950/30">
            {members.map((member) => (
              <MemberRow key={member.id} member={member} canManage={canManage} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 lg:hidden">
        {members.map((member) => (
          <MemberCard key={member.id} member={member} canManage={canManage} />
        ))}
      </div>
    </div>
  );
}

function MemberRow({ member, canManage }: { member: WorkspaceMemberRecord; canManage: boolean }) {
  const statusTone = member.role === "owner" ? "success" : member.role === "admin" ? "info" : member.role === "viewer" ? "neutral" : "neutral";

  return (
    <tr className="align-top">
      <td className="px-4 py-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-slate-950 dark:text-white">{member.full_name}</p>
            {member.is_current_user ? <StatusBadge tone="info">You</StatusBadge> : null}
          </div>
          <p className="text-sm text-slate-500">Joined {member.joined_label}</p>
        </div>
      </td>
      <td className="px-4 py-4">
        <StatusBadge tone={statusTone}>{member.role}</StatusBadge>
      </td>
      <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">{member.joined_label}</td>
      <td className="px-4 py-4">
        {member.role === "owner" ? (
          <StatusBadge key="protected" tone="success">Protected</StatusBadge>
        ) : (
          <StatusBadge key="active" tone="neutral">Active</StatusBadge>
        )}
      </td>
      <td className="px-4 py-4">
        {canManage ? (
          <div className="flex justify-end gap-2">
            <form action={updateMemberRoleAction} className="flex items-center gap-2">
              <input type="hidden" name="member_id" value={member.id} />
              <input type="hidden" name="next" value="/settings/members" />
              <Select name="role" defaultValue={member.role} disabled={!member.can_edit_role} className="h-10 w-40">
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="sales">Sales</option>
                <option value="viewer">Viewer</option>
              </Select>
              <button
                type="submit"
                disabled={!member.can_edit_role}
                className="inline-flex h-10 items-center rounded-2xl bg-slate-950 px-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                Save role
              </button>
            </form>

            <form action={removeMemberAction}>
              <input type="hidden" name="member_id" value={member.id} />
              <input type="hidden" name="next" value="/settings/members" />
              <ConfirmFormButton
                confirmMessage="Remove this member from the workspace?"
                disabled={!member.can_remove}
                className="inline-flex h-10 items-center rounded-2xl border border-rose-200 bg-rose-50 px-3 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
              >
                Remove
              </ConfirmFormButton>
            </form>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Read only</p>
        )}
      </td>
    </tr>
  );
}

function MemberCard({ member, canManage }: { member: WorkspaceMemberRecord; canManage: boolean }) {
  return (
    <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-slate-950 dark:text-white">{member.full_name}</p>
            {member.is_current_user ? <StatusBadge tone="info">You</StatusBadge> : null}
          </div>
          <p className="mt-1 text-sm text-slate-500">Joined {member.joined_label}</p>
        </div>
        <StatusBadge tone={member.role === "owner" ? "success" : member.role === "admin" ? "info" : "neutral"}>{member.role}</StatusBadge>
      </div>

      <div className="flex items-center justify-between">
        <StatusBadge tone={member.role === "owner" ? "success" : "neutral"}>{member.role === "owner" ? "Protected" : "Active"}</StatusBadge>
        {canManage ? (
          <div className="flex items-center gap-2">
            <form action={updateMemberRoleAction} className="flex items-center gap-2">
              <input type="hidden" name="member_id" value={member.id} />
              <input type="hidden" name="next" value="/settings/members" />
              <Select name="role" defaultValue={member.role} disabled={!member.can_edit_role} className="h-10">
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="sales">Sales</option>
                <option value="viewer">Viewer</option>
              </Select>
              <button
                type="submit"
                disabled={!member.can_edit_role}
                className="inline-flex h-10 items-center rounded-2xl bg-slate-950 px-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                Save
              </button>
            </form>
          </div>
        ) : null}
      </div>

      {canManage ? (
        <form action={removeMemberAction}>
          <input type="hidden" name="member_id" value={member.id} />
          <input type="hidden" name="next" value="/settings/members" />
          <ConfirmFormButton
            confirmMessage="Remove this member from the workspace?"
            disabled={!member.can_remove}
            className="inline-flex h-10 w-full items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-3 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
          >
            Remove member
          </ConfirmFormButton>
        </form>
      ) : null}
    </div>
  );
}

function InvitationRow({ invitation, canManage }: { invitation: WorkspaceInvitationRecord; canManage: boolean }) {
  const tone =
    invitation.computed_status === "pending"
      ? "warning"
      : invitation.computed_status === "accepted"
        ? "success"
        : invitation.computed_status === "revoked"
          ? "danger"
          : "neutral";

  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-slate-950 dark:text-white">{invitation.email}</p>
            <StatusBadge tone={tone}>{invitation.computed_status}</StatusBadge>
          </div>
          <p className="text-sm text-slate-500">Role {invitation.role} · Expires {invitation.expires_label}</p>
        </div>

        {canManage && invitation.computed_status === "pending" ? (
          <div className="flex flex-wrap gap-2">
            <form action={resendInvitationAction}>
              <input type="hidden" name="invitation_id" value={invitation.id} />
              <button
                type="submit"
                className="inline-flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-950/30 dark:text-slate-300 dark:hover:bg-white/10"
              >
                Resend
              </button>
            </form>

            <form action={revokeInvitationAction}>
              <input type="hidden" name="invitation_id" value={invitation.id} />
              <ConfirmFormButton
                confirmMessage="Revoke this invitation?"
                className="inline-flex h-10 items-center rounded-2xl border border-rose-200 bg-rose-50 px-3 text-sm font-medium text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
              >
                Revoke
              </ConfirmFormButton>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-white/10 dark:bg-white/5">
      <p className="text-sm font-medium text-slate-950 dark:text-white">{title}</p>
      <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">{description}</p>
    </div>
  );
}
