import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getWorkspaceContext } from "@/server/services/workspace-context";
import { AppShell } from "@/components/layout/app-shell";
import { GlobalCommandShortcut } from "@/components/shared/global-command-shortcut";
import { LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const workspace = await getWorkspaceContext();
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value);

  if (workspace.mode === "live" && workspace.role === "owner" && workspace.organization.onboarding_completed_at === null) {
    redirect("/onboarding");
  }

  return <><GlobalCommandShortcut /><AppShell workspace={workspace} locale={locale}>{children}</AppShell></>;
}