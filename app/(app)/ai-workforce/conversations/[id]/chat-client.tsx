"use client";

import { useState, useRef, useEffect } from "react";
import { Send, CheckCircle2, XCircle, Clock } from "lucide-react";
import { sendChatMessage, approveAiAction } from "../../actions";
import { useRouter } from "next/navigation";

type Message = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

type ActionRunInputPayload = Record<string, unknown>;

type ActionRun = {
  id: string;
  action_type: string;
  status: string;
  input_payload: ActionRunInputPayload;
};

export function ChatClient({
  conversationId,
  initialMessages,
  initialActions,
  isDemo
}: {
  conversationId: string;
  initialMessages: Message[];
  initialActions: ActionRun[];
  isDemo: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [actions] = useState(initialActions);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, actions]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput("");
    setLoading(true);

    const tempId = `temp-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: tempId,
      role: "user",
      content: userMsg,
      created_at: new Date().toISOString()
    }]);

    try {
      await sendChatMessage(conversationId, userMsg);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      alert("Failed to send message: " + message);
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (actionId: string) => {
    if (isDemo) {
      alert("Mutations are strictly prohibited in Demo Mode.");
      return;
    }
    setApproving(actionId);
    try {
      await approveAiAction(actionId);
      alert("Action approved and executed successfully!");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      alert("Failed to approve action: " + message);
    } finally {
      setApproving(null);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                msg.role === "user"
                  ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                  : "bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}

        {actions.length > 0 && (
          <div className="flex justify-start">
            <div className="w-full max-w-[80%] space-y-3">
              {actions.map(action => (
                <div key={action.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
                  <div className="flex items-center justify-between pb-2">
                    <p className="font-semibold text-sm">Proposed Action: {action.action_type}</p>
                    <span className="flex items-center gap-1 text-xs">
                      {action.status === 'proposed' && <Clock className="w-3 h-3 text-amber-500" />}
                      {action.status === 'approved' && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                      {action.status === 'failed' && <XCircle className="w-3 h-3 text-red-500" />}
                      {action.status}
                    </span>
                  </div>
                  <pre className="text-xs bg-slate-50 dark:bg-black/50 p-2 rounded overflow-x-auto text-slate-600 dark:text-slate-400">
                    {JSON.stringify(action.input_payload, null, 2)}
                  </pre>
                  {action.status === "proposed" && (
                    <div className="pt-3">
                      <button
                        onClick={() => handleApprove(action.id)}
                        disabled={approving === action.id || isDemo}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {approving === action.id ? "Approving..." : isDemo ? "Demo Mode (View Only)" : "Approve & Execute"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-500 dark:bg-white/10 dark:text-slate-400">
              <span className="animate-pulse">Agent is typing...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-950">
        <form onSubmit={handleSend} className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder={isDemo ? "Send a test message (Demo mode)" : "Type your message..."}
            className="w-full rounded-full border border-slate-200 bg-slate-50 py-3 pl-4 pr-12 text-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:focus:border-white/20 dark:focus:ring-white/10"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="absolute right-2 flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
