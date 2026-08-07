"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";

interface AuditEvent {
  id: string;
  eventType: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}

const LABELS: Record<string, string> = {
  message_sent: "Message sent",
  message_failed: "Message failed",
  message_retry_requested: "Retry requested",
  template_sent: "Template sent",
  template_failed: "Template failed",
  ai_suggestion_generated: "AI suggestion generated",
  ai_suggestion_reviewed: "AI suggestion reviewed",
  crm_note_added: "CRM note added",
  crm_task_created: "Follow-up created",
  crm_lead_converted: "Lead converted",
  crm_quote_opened: "Quote flow opened",
  conversation_status_changed: "Status changed",
  conversation_assignee_changed: "Assignee changed",
  webhook_reprocess_requested: "Webhook reprocess requested",
  webhook_reprocess_succeeded: "Webhook reprocessed",
  webhook_dead_lettered: "Webhook dead-lettered",
};

export function ConversationAuditPanel({ conversationId, refreshKey = 0 }: { conversationId: string; refreshKey?: number }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<AuditEvent[]>([]);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    fetch(`/api/inbox/conversations/${conversationId}/audit`, { cache: "no-store" })
      .then((res) => res.ok ? res.json() : { events: [] })
      .then((data) => { if (mounted) setEvents(Array.isArray(data.events) ? data.events : []); })
      .catch(() => { if (mounted) setEvents([]); });
    return () => { mounted = false; };
  }, [conversationId, open, refreshKey]);

  return (
    <div className="border-b border-slate-800/70 bg-slate-950/80 px-4 py-2">
      <button onClick={() => setOpen((value) => !value)} className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-200">
        <History className="h-3.5 w-3.5" /> {open ? "Hide audit history" : "Show audit history"}
      </button>
      {open && (
        <div className="mt-2 max-h-32 space-y-1 overflow-y-auto pr-1">
          {events.length === 0 ? <p className="text-[10px] text-slate-600">No WhatsApp audit events yet.</p> : events.map((event) => (
            <div key={event.id} className="flex items-center justify-between rounded-md bg-slate-900/70 px-2 py-1 text-[10px] text-slate-400">
              <span>{LABELS[event.eventType] || event.eventType}</span>
              <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
