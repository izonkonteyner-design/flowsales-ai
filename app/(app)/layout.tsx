import { getWorkspaceContext } from "@/server/services/workspace-context";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const workspace = await getWorkspaceContext();
  return <AppShell workspace={workspace}>{children}</AppShell>;
}
