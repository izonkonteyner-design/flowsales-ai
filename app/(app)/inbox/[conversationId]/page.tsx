import { Metadata } from "next";
import { InboxShell } from "@/components/inbox/inbox-shell";
import { InboxChannelTabs } from "@/components/inbox/inbox-channel-tabs";

export const metadata: Metadata = {
  title: "Conversation Detail | Omnichannel Inbox | FlowSales AI",
  description: "View conversation timeline and manage customer messages.",
};

interface ConversationDetailPageProps {
  params: Promise<{
    conversationId: string;
  }>;
}

export default async function ConversationDetailPage({ params }: ConversationDetailPageProps) {
  const { conversationId } = await params;

  return (
    <div className="container mx-auto p-4 max-w-7xl">
      <InboxChannelTabs />
      <InboxShell initialConversationId={conversationId} />
    </div>
  );
}
