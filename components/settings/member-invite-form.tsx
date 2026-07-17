"use client";

import { useActionState } from "react";

import { inviteMemberAction, type WorkspaceMemberActionState } from "@/app/(app)/settings/members/actions";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/status-badge";

const initialState: WorkspaceMemberActionState = {
  success: false,
  message: "",
  invitationUrl: null,
  fieldErrors: {},
};

type MemberInviteFormProps = {
  canManage: boolean;
};

export function MemberInviteForm({ canManage }: MemberInviteFormProps) {
  const [state, action, pending] = useActionState(inviteMemberAction, initialState);

  return (
    <div className="space-y-4">
      {!canManage ? (
        <StatusBadge tone="warning">Read only</StatusBadge>
      ) : null}

      <form action={action} className="grid gap-4 md:grid-cols-[1.2fr_0.7fr_auto]">
        <label className="space-y-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Email</span>
          <Input
            name="email"
            type="email"
            placeholder="teammate@company.com"
            disabled={!canManage || pending}
            aria-invalid={Boolean(state.fieldErrors.email)}
          />
          {state.fieldErrors.email ? <p className="text-sm text-rose-600 dark:text-rose-300">{state.fieldErrors.email}</p> : null}
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Role</span>
          <Select name="role" defaultValue="viewer" disabled={!canManage || pending} aria-invalid={Boolean(state.fieldErrors.role)}>
            <option value="admin">Admin</option>
            <option value="sales">Sales</option>
            <option value="viewer">Viewer</option>
          </Select>
          {state.fieldErrors.role ? <p className="text-sm text-rose-600 dark:text-rose-300">{state.fieldErrors.role}</p> : null}
        </label>

        <button
          type="submit"
          disabled={!canManage || pending}
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
        >
          {pending ? "Inviting..." : "Invite member"}
        </button>
      </form>

      {state.message ? (
        <div
          className={
            state.success
              ? "rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200"
              : "rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
          }
        >
          <p>{state.message}</p>
          {state.invitationUrl ? (
            <p className="mt-2 break-all rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-300">
              {state.invitationUrl}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
