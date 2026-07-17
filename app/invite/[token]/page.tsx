import Link from "next/link";

import { acceptInvitationAction } from "@/app/(app)/settings/members/actions";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { getWorkspaceInvitationPreview } from "@/server/services/workspace-members";
import { invitationLookupSchema } from "@/lib/validations/workspace-invitation";

type InvitePageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InvitePage({ params, searchParams }: InvitePageProps) {
  const [{ token }, rawSearchParams] = await Promise.all([params, searchParams]);
  const parsed = invitationLookupSchema.safeParse({ token });
  const preview = parsed.success
    ? await getWorkspaceInvitationPreview(parsed.data)
    : {
        invitation: null,
        organizationName: null,
        organizationSlug: null,
        emailMatchesCurrentUser: null,
        authenticated: false,
        userEmail: null,
      };
  const status = typeof rawSearchParams.status === "string" ? rawSearchParams.status : "";
  const tone =
    rawSearchParams.tone === "danger" || rawSearchParams.tone === "warning" || rawSearchParams.tone === "info"
      ? rawSearchParams.tone
      : "success";

  const invitation = preview.invitation;
  const isAccepted = invitation?.computed_status === "accepted" || status === "accepted";
  const isRevoked = invitation?.computed_status === "revoked" || status === "revoked";
  const isExpired = invitation?.computed_status === "expired" || status === "expired";
  const isInvalid = !parsed.success || (!invitation && !status);
  const canAccept = Boolean(invitation && invitation.computed_status === "pending" && preview.authenticated && preview.emailMatchesCurrentUser);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.12),transparent_28%),linear-gradient(to_bottom,#f8fafc,#eef2ff_45%,#f8fafc)] px-4 py-8 dark:bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.16),transparent_28%),linear-gradient(to_bottom,#020617,#0f172a_45%,#020617)]">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
        <div className="w-full space-y-6">
          <PageHeader
            eyebrow="Invitation"
            title="Workspace invitation"
            description="Review the invitation, confirm your account, and join the workspace securely."
            actions={
              <StatusBadge tone={invitation ? "info" : "warning"}>
                {preview.organizationName ?? "Invitation"}
              </StatusBadge>
            }
          />

          <SectionCard title="Invitation details" description="This invitation is secure and workspace scoped.">
            {isInvalid ? (
              <StateCard title="Invalid invitation" description="This invitation link is invalid or incomplete. Ask the workspace owner to resend it." tone="danger" />
            ) : isExpired ? (
              <StateCard title="Invitation expired" description="This invitation has expired. Ask the workspace owner to resend a fresh link." tone="warning" />
            ) : isRevoked ? (
              <StateCard title="Invitation revoked" description="This invitation was revoked. Ask the workspace owner to send a new one." tone="danger" />
            ) : isAccepted ? (
              <StateCard title="Invitation accepted" description="You have already joined this workspace with this account." tone="success" />
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Info label="Workspace" value={preview.organizationName ?? "Workspace"} />
                  <Info label="Role" value={invitation?.role ?? "viewer"} />
                  <Info label="Invited email" value={invitation?.email ?? "Unknown"} />
                  <Info label="Expires" value={invitation?.expires_label ?? "Unknown"} />
                </div>

                {!preview.authenticated ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                    Sign in with <strong>{invitation?.email ?? "the invited email"}</strong> to accept this invitation.
                    <div className="mt-3">
                      <Link
                        href={`/login?next=/invite/${encodeURIComponent(token)}`}
                        className="inline-flex h-10 items-center rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                      >
                        Sign in
                      </Link>
                    </div>
                  </div>
                ) : preview.emailMatchesCurrentUser === false ? (
                  <StateCard
                    title="Email mismatch"
                    description={`This invitation was sent to ${invitation?.email ?? "another email"}. Sign in with that account to continue.`}
                    tone="warning"
                  />
                ) : canAccept ? (
                  <form action={acceptInvitationAction} className="space-y-4">
                    <input type="hidden" name="token" value={token} />
                    <input type="hidden" name="next" value="/settings/members" />
                    <button
                      type="submit"
                      className="inline-flex h-11 items-center rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                    >
                      Accept invitation
                    </button>
                  </form>
                ) : (
                  <StateCard title="Sign in required" description="Sign in with the invited email to accept this invitation." tone="warning" />
                )}
              </div>
            )}
          </SectionCard>

          {status ? (
            <div
              className={
                tone === "success"
                  ? "rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200"
                  : "rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100"
              }
            >
              {status === "expired"
                ? "This invitation expired. Ask the workspace owner to resend it."
                : status === "revoked"
                  ? "This invitation was revoked and can no longer be used."
                  : status === "mismatch"
                    ? "The signed-in email does not match the invitation email."
                    : status === "invalid"
                      ? "This invitation link is invalid."
                      : "Invitation status updated."}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-1 font-medium text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}

function StateCard({ title, description, tone }: { title: string; description: string; tone: "success" | "warning" | "danger" }) {
  const className =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200"
        : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100";

  return (
    <div className={`rounded-3xl border p-5 ${className}`}>
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-1 text-sm">{description}</p>
    </div>
  );
}
