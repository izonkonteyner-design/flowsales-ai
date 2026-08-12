import type { Metadata } from "next";
import { EmailWorkspace } from "@/components/email/email-workspace";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { listEmailConnections, listEmailThreads } from "@/server/services/integrations/email-service";

export const metadata: Metadata = { title: "E-posta Merkezi — FlowSales AI", description: "Gmail ve Microsoft 365 birleşik gelen kutusu." };

export default async function EmailInboxPage() {
  const workspace = await getWorkspaceContext();
  if (workspace.mode !== "live") return <EmailWorkspace connections={[]} threads={[]} messages={[]} />;
  const [connections, data] = await Promise.all([listEmailConnections(workspace.organization.id), listEmailThreads(workspace.organization.id)]);
  return <EmailWorkspace connections={connections} threads={data.threads} messages={data.messages} />;
}
