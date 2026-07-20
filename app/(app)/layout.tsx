import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const workspace = await getWorkspaceContext();
  
  if (workspace.mode === "live" && workspace.role === "owner" && workspace.organization.onboarding_completed_at === null) {
    redirect("/onboarding");
  }

  return <AppShell workspace={workspace}>{children}</AppShell>;
}
