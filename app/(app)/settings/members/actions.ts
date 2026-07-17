"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  acceptWorkspaceInvitation,
  inviteWorkspaceMember,
  removeWorkspaceMember,
  resendWorkspaceInvitation,
  revokeWorkspaceInvitation,
  updateWorkspaceMemberRole,
} from "@/server/services/workspace-members";
import {
  inviteMemberSchema,
  removeMemberSchema,
  updateMemberRoleSchema,
  type InviteMemberInput,
} from "@/lib/validations/workspace-member";
import { invitationAcceptanceSchema } from "@/lib/validations/workspace-invitation";

export type WorkspaceMemberActionState = {
  success: boolean;
  message: string;
  invitationUrl: string | null;
  fieldErrors: Partial<Record<"email" | "role", string>>;
};

function toValidationState(error: z.ZodError): WorkspaceMemberActionState {
  const flattened = error.flatten().fieldErrors as Partial<Record<"email" | "role", string[]>>;
  return {
    success: false,
    message: "Please fix the highlighted fields.",
    invitationUrl: null,
    fieldErrors: {
      email: flattened.email?.[0],
      role: flattened.role?.[0],
    },
  };
}

function redirectWithToast(message: string, tone: "success" | "danger" = "success") {
  redirect(`/settings/members?toast=${encodeURIComponent(message)}&tone=${tone}`);
}

function parseInviteInput(formData: FormData): InviteMemberInput {
  return inviteMemberSchema.parse({
    email: formData.get("email"),
    role: formData.get("role"),
    next: formData.get("next"),
  });
}

export async function inviteMemberAction(_: WorkspaceMemberActionState, formData: FormData): Promise<WorkspaceMemberActionState> {
  try {
    const input = parseInviteInput(formData);
    const result = await inviteWorkspaceMember(input);

    return {
      success: true,
      message: `Invitation sent to ${result.invitation.email}.`,
      invitationUrl: result.invitationUrl,
      fieldErrors: {},
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return toValidationState(error);
    }

    return {
      success: false,
      message: error instanceof Error ? error.message : "Unable to send the invitation.",
      invitationUrl: null,
      fieldErrors: {},
    };
  }
}

export async function updateMemberRoleAction(formData: FormData) {
  try {
    const input = updateMemberRoleSchema.parse({
      member_id: formData.get("member_id"),
      role: formData.get("role"),
      next: formData.get("next"),
    });

    await updateWorkspaceMemberRole(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      redirectWithToast("Please choose a valid member role.", "danger");
    }

    redirectWithToast(error instanceof Error ? error.message : "Unable to update the member role.", "danger");
  }

  revalidatePath("/settings/members");
  revalidatePath("/settings");
  redirectWithToast("Member role updated.");
}

export async function removeMemberAction(formData: FormData) {
  try {
    const input = removeMemberSchema.parse({
      member_id: formData.get("member_id"),
      next: formData.get("next"),
    });

    await removeWorkspaceMember(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      redirectWithToast("Please select a valid member to remove.", "danger");
    }

    redirectWithToast(error instanceof Error ? error.message : "Unable to remove the member.", "danger");
  }

  revalidatePath("/settings/members");
  revalidatePath("/settings");
  redirectWithToast("Member removed.");
}

export async function resendInvitationAction(formData: FormData) {
  const invitationId = String(formData.get("invitation_id") ?? "").trim();
  if (!invitationId) {
    redirectWithToast("Invitation id is required.", "danger");
  }

  try {
    await resendWorkspaceInvitation(invitationId);
  } catch (error) {
    redirectWithToast(error instanceof Error ? error.message : "Unable to resend the invitation.", "danger");
  }

  revalidatePath("/settings/members");
  redirectWithToast("Invitation resent.");
}

export async function revokeInvitationAction(formData: FormData) {
  const invitationId = String(formData.get("invitation_id") ?? "").trim();
  if (!invitationId) {
    redirectWithToast("Invitation id is required.", "danger");
  }

  try {
    await revokeWorkspaceInvitation(invitationId);
  } catch (error) {
    redirectWithToast(error instanceof Error ? error.message : "Unable to revoke the invitation.", "danger");
  }

  revalidatePath("/settings/members");
  redirectWithToast("Invitation revoked.");
}

export async function acceptInvitationAction(formData: FormData) {
  try {
    const input = invitationAcceptanceSchema.parse({
      token: formData.get("token"),
      next: formData.get("next"),
    });

    await acceptWorkspaceInvitation(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const token = String(formData.get("token") ?? "").trim();
      redirect(`/invite/${encodeURIComponent(token)}?status=invalid&tone=danger`);
    }

    const token = String(formData.get("token") ?? "").trim();
    const message = error instanceof Error ? error.message : "Unable to accept the invitation.";
    if (/expired/i.test(message)) {
      redirect(`/invite/${encodeURIComponent(token)}?status=expired&tone=danger`);
    }
    if (/revoked/i.test(message)) {
      redirect(`/invite/${encodeURIComponent(token)}?status=revoked&tone=danger`);
    }
    if (/match/i.test(message)) {
      redirect(`/invite/${encodeURIComponent(token)}?status=mismatch&tone=danger`);
    }

    redirect(`/invite/${encodeURIComponent(token)}?status=invalid&tone=danger`);
  }

  revalidatePath("/settings/members");
  revalidatePath("/settings");
  redirect("/settings/members?toast=Invitation%20accepted&tone=success");
}
