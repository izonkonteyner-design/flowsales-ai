export function isReadOnlyRepairPreview(env: Record<string, string | undefined>) {
  return env.NEXT_PUBLIC_REPAIR_PREVIEW === "true" || (
    env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF === "fix/flowsales-complete-repair"
  );
}
