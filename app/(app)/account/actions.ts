"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { updateCurrentUserProfile, parseUpdateProfileInput } from "@/server/services/account";
import { getAuthPublicMessageFromError } from "@/server/services/auth-domain";

export async function updateProfileAction(formData: FormData) {
  let message = "";
  let tone = "success";

  try {
    const input = parseUpdateProfileInput(formData);
    await updateCurrentUserProfile(input);
    message = "Profile updated successfully.";
  } catch (error) {
    tone = "danger";
    if (error instanceof z.ZodError) {
      message = "Please fix the highlighted fields.";
    } else {
      message = getAuthPublicMessageFromError(error, "Unable to update profile.");
    }
  }

  redirect(`/account?toast=${encodeURIComponent(message)}&tone=${tone}`);
}
