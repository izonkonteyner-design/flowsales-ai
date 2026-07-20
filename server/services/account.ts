import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateProfileFormSchema, type UpdateProfileFormInput } from "@/lib/validations/account";

export async function updateCurrentUserProfile(input: UpdateProfileFormInput) {
  const client = await createSupabaseServerClient();
  if (!client) {
    throw new Error("Unable to initialize authentication.");
  }

  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user) {
    throw new Error("You must be signed in to update your profile.");
  }

  const { error } = await client.auth.updateUser({
    data: {
      full_name: input.full_name,
    },
  });

  if (error) {
    throw new Error(error.message || "Unable to update profile.");
  }

  return true;
}

export function parseUpdateProfileInput(formData: FormData): UpdateProfileFormInput {
  return updateProfileFormSchema.parse({
    full_name: formData.get("full_name"),
  });
}
