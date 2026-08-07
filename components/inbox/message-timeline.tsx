"use client";

import React from "react";
import { MessageItemDTO } from "@/server/repositories/supabase/omnichannel-inbox";
import { Check, CheckCheck, AlertTriangle, FileText, Image as ImageIcon, Mic, HelpCircle, ExternalLink } from "lucide-react";

interface MessageTimelineProps {
  messages: MessageItemDTO[];
}

export function MessageTimeline({ messages }: MessageTimelineProps) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
        <MessageSquareIcon className="h-10 w-10 text-slate-400 mb-2" />
        <p className="text-sm font-medium">No messages in this conversation yet</p>
        <p className="text-xs text-slate-400">Incoming messages from WhatsApp will appear here automatically.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-4 px-2">
      {messages.map((msg) => {
        const isInbound = msg.direction === "inbound";
        const isFailed = msg.status === "failed";
        const isRead = msg.status === "read";

        return (
          <div
            key={msg.id}
            className={`flex flex-col ${isInbound ? "items-start" : "items-end"}`}
          >
            <div className="flex items-center space-x-2 mb-1 text-[11px] text-slate-400">
              <span>{msg.senderName || (isInbound ? "Contact" : "Agent")}</span>
              <span>•</span>
              <span>{formatMessageTime(msg.sentAt || msg.createdAt)}</span>
            </div>

            <div
              className={`relative max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                isInbound
                  ? "bg-slate-900 border border-slate-800 text-slate-100 rounded-tl-sm"
                  : "bg-emerald-600 text-white rounded-tr-sm"
              }`}
            >
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="mb-2 space-y-2">
                  {msg.attachments.map((att) => (
                    <a
                      key={att.id}
                      href={`/api/inbox/attachments/${att.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className={`flex items-center space-x-2 rounded-lg p-2.5 text-xs transition-colors ${
                        isInbound ? "bg-slate-800/80 text-slate-200 hover:bg-slate-700/80" : "bg-emerald-700/80 text-emerald-50 hover:bg-emerald-700"
                      }`}
                      title="Open securely through FlowSales"
                    >
                      {att.attachmentType === "image" ? (
                        <ImageIcon className="h-4 w-4 shrink-0 text-emerald-400" />
                      ) : att.attachmentType === "voice" || att.attachmentType === "audio" ? (
                        <Mic className="h-4 w-4 shrink-0 text-amber-400" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0 text-blue-400" />
                      )}
                      <div className="truncate flex-1">
                        <p className="font-medium truncate">{att.fileName || `${att.attachmentType} attachment`}</p>
                        <p className="text-[10px] opacity-75">{att.mimeType || att.attachmentType}</p>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    </a>
                  ))}
                </div>
              )}

              {msg.messageType === "unsupported" ? (
                <div className="flex items-center space-x-2 text-xs italic text-amber-300">
                  <HelpCircle className="h-4 w-4 shrink-0" />
                  <span>Unsupported message type ({msg.messageType})</span>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap leading-relaxed break-words">
                  {msg.body || <span className="italic opacity-70">[Empty body]</span>}
                </p>
              )}

              {!isInbound && (
                <div className="mt-1 flex items-center justify-end space-x-1 text-[10px] text-emerald-200">
                  {isFailed ? (
                    <span className="flex items-center text-rose-300 font-medium" title={msg.errorCode ? `Error: ${msg.errorCode}` : "Delivery failed"}>
                      <AlertTriangle className="h-3 w-3 mr-0.5" /> Failed {msg.errorCode ? `(${msg.errorCode})` : ""}
                    </span>
                  ) : isRead ? (
                    <span className="flex items-center text-cyan-300">
                      <CheckCheck className="h-3.5 w-3.5 mr-0.5" /> Read
                    </span>
                  ) : msg.status === "delivered" ? (
                    <span className="flex items-center">
                      <CheckCheck className="h-3.5 w-3.5 mr-0.5 opacity-80" /> Delivered
                    </span>
                  ) : (
                    <span className="flex items-center">
                      <Check className="h-3.5 w-3.5 mr-0.5 opacity-80" /> Sent
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MessageSquareIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}

function formatMessageTime(ts?: string | null): string {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
