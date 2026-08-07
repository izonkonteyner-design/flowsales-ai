"use client";

import React, { useState, useTransition } from "react";
import { ConversationDetailDTO } from "@/server/repositories/supabase/omnichannel-inbox";
import { MessageTimeline } from "@/components/inbox/message-timeline";
import {
  updateConversationStatusAction,
  updateConversationAssigneeAction,
  fetchApprovedTemplatesAction,
  sendTemplateMessageAction,
} from "@/app/(app)/inbox/actions";
import { validateCustomerWindow } from "@/lib/utils/customer-window";
import { WhatsAppTemplateDTO } from "@/server/services/integrations/whatsapp-template-service";
import {
  User,
  AlertTriangle,
  Send,
  Lock,
  WifiOff,
  Loader2,
  AlertCircle,
  Clock,
  FileText,
  X,
} from "lucide-react";

interface ConversationViewProps {
  conversation: ConversationDetailDTO | null;
  isLoading: boolean;
  userRole: string;
  isDemo: boolean;
  organizationMembers: Array<{ userId: string; name: string; email: string }>;
  onRefresh?: () => void;
}

export function ConversationView({
  conversation,
  isLoading,
  userRole,
  isDemo,
  organizationMembers,
  onRefresh,
}: ConversationViewProps) {
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<{ code: string; message: string } | null>(null);

  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  // Template Modal State
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templates, setTemplates] = useState<WhatsAppTemplateDTO[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplateDTO | null>(null);
  const [bodyParams, setBodyParams] = useState<string[]>([]);
  const [isSendingTemplate, setIsSendingTemplate] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center space-y-3 p-8 text-center text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        <p className="text-sm font-medium">Loading conversation messages...</p>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex h-full flex-col items-center justify-center space-y-3 p-8 text-center text-slate-500">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 border border-slate-800 text-slate-400">
          <MessageSquareIcon className="h-6 w-6" />
        </div>
        <h3 className="text-base font-semibold text-slate-200">No conversation selected</h3>
        <p className="text-xs max-w-sm text-slate-400">
          Select a WhatsApp conversation from the left sidebar to view messages, update status, or assign team members.
        </p>
      </div>
    );
  }

  const isReadOnly = userRole === "viewer" || isDemo;
  const isDisconnected = conversation.connectionStatus !== "connected";

  // Customer 24h Window Check
  const lastInboundMsg = [...conversation.messages].reverse().find((m) => m.direction === "inbound");
  const windowCheck = validateCustomerWindow(lastInboundMsg?.sentAt || lastInboundMsg?.createdAt);
  const isWindowOpen = windowCheck.allowed;

  const handleStatusChange = (newStatus: "open" | "pending" | "resolved" | "closed") => {
    setActionError(null);
    startTransition(async () => {
      const res = await updateConversationStatusAction(conversation.id, newStatus);
      if (!res.success) {
        setActionError(res.error || "Failed to update status.");
      } else if (onRefresh) {
        onRefresh();
      }
    });
  };

  const handleAssigneeChange = (newAssigneeId: string) => {
    setActionError(null);
    const assignedUserId = newAssigneeId === "unassigned" ? null : newAssigneeId;
    startTransition(async () => {
      const res = await updateConversationAssigneeAction(conversation.id, assignedUserId);
      if (!res.success) {
        setActionError(res.error || "Failed to update assignee.");
      } else if (onRefresh) {
        onRefresh();
      }
    });
  };

  const handleOpenTemplateModal = async () => {
    setShowTemplateModal(true);
    setLoadingTemplates(true);
    try {
      const tpls = await fetchApprovedTemplatesAction();
      setTemplates(tpls);
      if (tpls.length > 0) {
        setSelectedTemplate(tpls[0]);
        setupBodyParams(tpls[0]);
      }
    } catch {
      setActionError("Failed to fetch approved WhatsApp templates.");
    } finally {
      setLoadingTemplates(false);
    }
  };

  const setupBodyParams = (tpl: WhatsAppTemplateDTO) => {
    const bodyComp = (tpl.components || []).find((c) => c.type === "BODY");
    const matches = bodyComp?.text?.match(/\{\{\d+\}\}/g) || [];
    setBodyParams(new Array(matches.length).fill(""));
  };

  const handleSelectTemplate = (tpl: WhatsAppTemplateDTO) => {
    setSelectedTemplate(tpl);
    setupBodyParams(tpl);
  };

  const handleSendTemplate = async () => {
    if (!selectedTemplate || isSendingTemplate || isReadOnly || isDisconnected) return;

    setIsSendingTemplate(true);
    setSendError(null);

    try {
      const res = await sendTemplateMessageAction({
        conversationId: conversation.id,
        templateName: selectedTemplate.name,
        languageCode: selectedTemplate.language,
        bodyParameters: bodyParams,
      });

      if (!res.success) {
        setSendError({
          code: res.errorCode || "send_failed",
          message: res.message || "Failed to send template message.",
        });
      } else {
        setShowTemplateModal(false);
        if (onRefresh) onRefresh();
      }
    } catch (err: unknown) {
      setSendError({
        code: "send_failed",
        message: err instanceof Error ? err.message : "Network error while sending template.",
      });
    } finally {
      setIsSendingTemplate(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || isSending || isReadOnly || isDisconnected || !isWindowOpen) return;

    setIsSending(true);
    setSendError(null);

    const clientIdempotencyKey = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `key_${Date.now()}_${Math.random()}`;

    try {
      const res = await fetch(`/api/inbox/conversations/${conversation.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: replyText.trim(),
          clientIdempotencyKey,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setSendError({
          code: json?.error || "send_failed",
          message: json?.message || "Failed to send WhatsApp outbound reply.",
        });
      } else {
        setReplyText("");
        if (onRefresh) onRefresh();
      }
    } catch (err: unknown) {
      setSendError({
        code: "send_failed",
        message: err instanceof Error ? err.message : "Network error while sending reply.",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-slate-950/70 border-l border-slate-800/60 relative">
      {/* Conversation Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 px-6 py-4 bg-slate-900/60 backdrop-blur-md">
        <div className="flex items-center space-x-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-800 border border-slate-700 text-slate-200 font-bold text-base">
            {conversation.contactName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-semibold text-slate-100">{conversation.contactName}</h3>
              <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                WhatsApp
              </span>
              {isWindowOpen ? (
                <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300 border border-emerald-500/20">
                  <Clock className="h-3 w-3 mr-1" /> 24h Window Open
                </span>
              ) : (
                <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-500/20">
                  <Clock className="h-3 w-3 mr-1" /> 24h Window Closed
                </span>
              )}
            </div>
            <p className="text-xs font-mono text-slate-400 mt-0.5">
              {conversation.contactMaskedPhone || "+90 532 *** ** **"}
            </p>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center space-x-3">
          <div className="relative flex items-center">
            <User className="absolute left-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <select
              value={conversation.assignedUserId || "unassigned"}
              onChange={(e) => handleAssigneeChange(e.target.value)}
              disabled={isReadOnly || isPending}
              className="appearance-none bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 cursor-pointer"
            >
              <option value="unassigned">Unassigned</option>
              {organizationMembers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <select
              value={conversation.status}
              onChange={(e) =>
                handleStatusChange(e.target.value as "open" | "pending" | "resolved" | "closed")
              }
              disabled={isReadOnly || isPending}
              className="appearance-none bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 cursor-pointer capitalize"
            >
              <option value="open">Open</option>
              <option value="pending">Pending</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Warning Banners */}
      {!isWindowOpen && !isDisconnected && (
        <div className="flex items-center justify-between bg-amber-950/60 border-b border-amber-800/40 px-6 py-2.5 text-xs text-amber-200">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <span>
              <strong>24-hour WhatsApp reply window closed.</strong> Free-form text messages are blocked by Meta. Send an approved template message to re-open the conversation.
            </span>
          </div>
          <button
            onClick={handleOpenTemplateModal}
            disabled={isReadOnly}
            className="flex items-center rounded-lg bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-50 transition-colors shrink-0"
          >
            <FileText className="h-3.5 w-3.5 mr-1" /> Send Approved Template
          </button>
        </div>
      )}

      {isDisconnected && (
        <div className="flex items-center space-x-2 bg-amber-950/50 border-b border-amber-800/40 px-6 py-2.5 text-xs text-amber-300">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>WhatsApp channel is currently disconnected or expired. Outbound replies are paused.</span>
        </div>
      )}

      {isReadOnly && (
        <div className="flex items-center space-x-2 bg-slate-900 border-b border-slate-800 px-6 py-2 text-xs text-slate-400">
          <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>{isDemo ? "Demo mode is active (read-only)." : "You have read-only access to this conversation."}</span>
        </div>
      )}

      {sendError && (
        <div className="flex items-center justify-between bg-rose-950/70 border-b border-rose-800/50 px-6 py-2.5 text-xs text-rose-200">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>
              {sendError.code === "template_required"
                ? "24-Hour Service Window Closed: A WhatsApp Template Message is required to re-open customer conversation."
                : sendError.message}
            </span>
          </div>
          <button
            onClick={() => setSendError(null)}
            className="text-rose-300 hover:text-white font-bold ml-3"
          >
            ×
          </button>
        </div>
      )}

      {actionError && (
        <div className="flex items-center justify-between bg-rose-950/60 border-b border-rose-800/40 px-6 py-2 text-xs text-rose-300">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            onClick={() => setActionError(null)}
            className="text-rose-400 hover:text-rose-200 font-bold ml-2"
          >
            ×
          </button>
        </div>
      )}

      {/* Message Timeline */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <MessageTimeline messages={conversation.messages} />
      </div>

      {/* Composer Box */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-900/40">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendReply();
          }}
          className="flex items-center space-x-2"
        >
          <input
            type="text"
            placeholder={
              isReadOnly
                ? "Read-only mode active"
                : isDisconnected
                ? "Channel disconnected"
                : !isWindowOpen
                ? "24-hour reply window closed. Use 'Send Template' button."
                : "Type WhatsApp outbound reply..."
            }
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            disabled={isReadOnly || isDisconnected || isSending || !isWindowOpen}
            className="flex-1 bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
          />

          {!isWindowOpen && !isDisconnected && !isReadOnly ? (
            <button
              type="button"
              onClick={handleOpenTemplateModal}
              className="flex items-center justify-center rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-500 transition-colors shrink-0"
            >
              <FileText className="h-4 w-4 mr-1.5" />
              Templates
            </button>
          ) : (
            <button
              type="submit"
              disabled={isReadOnly || isDisconnected || isSending || !isWindowOpen || !replyText.trim()}
              className="flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50 transition-colors shrink-0"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Send className="h-4 w-4 mr-1.5" />
              )}
              Send
            </button>
          )}
        </form>
      </div>

      {/* Template Selection Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <FileText className="h-5 w-5 text-emerald-400" />
                <h3 className="text-sm font-semibold text-slate-100">Approved Meta WhatsApp Templates</h3>
              </div>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {loadingTemplates ? (
              <div className="flex items-center justify-center py-8 text-slate-400 space-x-2 text-xs">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
                <span>Fetching approved templates...</span>
              </div>
            ) : templates.length === 0 ? (
              <div className="py-6 text-center text-xs text-amber-400">
                No approved templates found in the catalog. Please sync templates in Meta WhatsApp Manager.
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Select Approved Template
                  </label>
                  <select
                    value={selectedTemplate?.id || ""}
                    onChange={(e) => {
                      const t = templates.find((item) => item.id === e.target.value);
                      if (t) handleSelectTemplate(t);
                    }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        [{t.status}] {t.name} ({t.language}) — {t.category}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedTemplate && (
                  <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-3">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Category: {selectedTemplate.category}</span>
                      <span className="text-emerald-400 font-semibold">Status: {selectedTemplate.status}</span>
                    </div>

                    {bodyParams.length > 0 && (
                      <div className="space-y-2">
                        <label className="block text-xs font-medium text-slate-300">
                          Template Parameters ({bodyParams.length})
                        </label>
                        {bodyParams.map((paramVal, idx) => (
                          <input
                            key={idx}
                            type="text"
                            placeholder={`Parameter {{${idx + 1}}}`}
                            value={paramVal}
                            onChange={(e) => {
                              const newArr = [...bodyParams];
                              newArr[idx] = e.target.value;
                              setBodyParams(newArr);
                            }}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowTemplateModal(false)}
                    className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSendTemplate}
                    disabled={isSendingTemplate || !selectedTemplate}
                    className="flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {isSendingTemplate ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    ) : (
                      <Send className="h-4 w-4 mr-1.5" />
                    )}
                    Send Template
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
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
