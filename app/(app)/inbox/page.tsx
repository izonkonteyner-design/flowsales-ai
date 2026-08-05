import { Metadata } from "next";
import { InboxShell } from "@/components/inbox/inbox-shell";

export const metadata: Metadata = {
  title: "Omnichannel Inbox | FlowSales AI",
  description: "Unified Omnichannel Inbox for WhatsApp and multi-channel customer communications.",
};

export default function InboxPage() {
  return (
    <div className="container mx-auto p-4 max-w-7xl">
      <InboxShell />
    </div>
  );
}
