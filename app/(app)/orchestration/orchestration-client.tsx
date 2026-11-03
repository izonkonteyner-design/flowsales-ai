"use client";

import { useState, useTransition } from "react";
import {
  Bot, Sparkles, Play, RefreshCw,
  Database, Plug, Send, X, Trash2,
  Zap, TrendingUp, CheckCircle2, Clock,
  FileText, Users, ShieldCheck, Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createMaestroPlanAction,
  executePlanTasksAction,
  toggleAgentStatusAction,
  addBusinessMemoryAction,
  deleteBusinessMemoryAction,
  testConnectorAction,
  cancelTaskAction,
  recoverStaleTasksAction,
  runSalesAutopilotAction,
} from "./actions";
import type { AgentDefinition, OrchestrationPlan, OrchestrationTask, BusinessMemory } from "@/types/orchestration";
import type { SalesAutopilotExecutionReport } from "@/server/services/orchestration/sales-autopilot";

export interface LeadItem {
  id: string;
  full_name?: string;
  company?: string;
  city?: string;
  status?: string;
}

export interface QuoteItem {
  id: string;
  total_amount?: number | string;
  currency?: string;
  status?: string;
  metadata?: {
    model?: string;
  };
}

export interface PendingTaskItem {
  id: string;
  title?: string;
  description?: string;
  due_at?: string;
  priority?: string;
  status?: string;
}

export interface KpiMetrics {
  totalLeads: number;
  totalQuotes: number;
  pendingTasks: number;
  draftQuotes: number;
}

interface OrchestrationClientProps {
  initialAgents: AgentDefinition[];
  plans: OrchestrationPlan[];
  tasks: OrchestrationTask[];
  memories: BusinessMemory[];
  connectors: Array<Record<string, unknown>>;
  canManage?: boolean;
  recentLeads?: LeadItem[];
  recentQuotes?: QuoteItem[];
  pendingTasks?: PendingTaskItem[];
  kpiMetrics?: KpiMetrics;
}

const getErrorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

export function OrchestrationClient({
  initialAgents,
  plans,
  tasks,
  memories,
  connectors: _connectors,
  canManage = true,
  recentLeads = [],
  recentQuotes = [],
  pendingTasks = [],
  kpiMetrics,
}: OrchestrationClientProps) {
  void _connectors;
  const [activeTab, setActiveTab] = useState<"maestro" | "autopilot" | "agents" | "memory" | "connectors">("autopilot");
  const [objectiveInput, setObjectiveInput] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(plans[0]?.id || null);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [autopilotResult, setAutopilotResult] = useState<SalesAutopilotExecutionReport | null>(null);

  // Filtrelenmiş görevler
  const currentPlan = plans.find((p) => p.id === selectedPlanId) || plans[0];
  const currentTasks = tasks.filter((t) => t.planId === currentPlan?.id);

  const handleCreatePlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || !objectiveInput.trim()) return;

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("objective", objectiveInput);
        const res = await createMaestroPlanAction(formData);
        if (res.planId) {
          setSelectedPlanId(res.planId);
        }
        setObjectiveInput("");
        setFeedback({ type: "success", message: "Maestro hedef planı başarıyla oluşturuldu!" });
      } catch (err: unknown) {
        setFeedback({ type: "error", message: getErrorMessage(err, "Plan oluşturulurken hata meydana geldi." ) });
      }
    });
  };

  const handleExecuteTasks = () => {
    if (!canManage || !currentPlan?.id) return;
    const planId = currentPlan.id;
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("planId", planId);
        const res = await executePlanTasksAction(formData);
        setFeedback({
          type: "success",
          message: `Görevler yürütüldü: ${res.outcome.completedCount} tamamlandı, ${res.outcome.waitingApprovalCount} onay bekliyor.`,
        });
      } catch (err: unknown) {
        setFeedback({ type: "error", message: getErrorMessage(err, "Görevler çalıştırılamadı." ) });
      }
    });
  };

  const handleToggleAgent = (agentKey: string, currentStatus: string) => {
    if (!canManage) return;
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("agentKey", agentKey);
        formData.append("status", currentStatus === "active" ? "disabled" : "active");
        await toggleAgentStatusAction(formData);
        setFeedback({ type: "success", message: `Ajan durumu güncellendi.` });
      } catch (err: unknown) {
        setFeedback({ type: "error", message: getErrorMessage(err, "Ajan güncellenemedi." ) });
      }
    });
  };

  const handleAddMemory = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canManage) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        await addBusinessMemoryAction(formData);
        form.reset();
        setFeedback({ type: "success", message: "İşletme kuralı / hafızası başarıyla kaydedildi." });
      } catch (err: unknown) {
        setFeedback({ type: "error", message: getErrorMessage(err, "Hafıza eklenemedi." ) });
      }
    });
  };

  const handleDeleteMemory = (id: string) => {
    if (!canManage) return;
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("memoryId", id);
        await deleteBusinessMemoryAction(formData);
        setFeedback({ type: "success", message: "Hafıza kaydı silindi." });
      } catch (err: unknown) {
        setFeedback({ type: "error", message: getErrorMessage(err, "Silinemedi." ) });
      }
    });
  };

  const handleTestConnector = (providerKey: string) => {
    if (!canManage) return;
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("providerKey", providerKey);
        formData.append("actionName", "health_probe");
        const res = await testConnectorAction(formData);
        setFeedback({
          type: res.success ? "success" : "error",
          message: `${providerKey} bağlantı testi: ${res.success ? "Başarılı" : "Hata"}`,
        });
      } catch (err: unknown) {
        setFeedback({ type: "error", message: getErrorMessage(err, "Test başarısız." ) });
      }
    });
  };

  const handleCancelTask = (taskId: string) => {
    if (!canManage) return;
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("taskId", taskId);
        formData.append("reason", "Kullanıcı arayüzünden iptal edildi");
        await cancelTaskAction(formData);
        setFeedback({ type: "success", message: "Görev başarıyla iptal edildi." });
      } catch (err: unknown) {
        setFeedback({ type: "error", message: getErrorMessage(err, "Görev iptal edilemedi." ) });
      }
    });
  };

  const handleRecoverStale = () => {
    if (!canManage) return;
    startTransition(async () => {
      try {
        const res = await recoverStaleTasksAction();
        setFeedback({
          type: "success",
          message: `Kurtarma tamamlandı: ${res.recoveredCount} görev yeniden denemeye alındı, ${res.failedCount} görev başarısız olarak kapatıldı.`,
        });
      } catch (err: unknown) {
        setFeedback({ type: "error", message: getErrorMessage(err, "Kurtarma başarısız." ) });
      }
    });
  };

  const handleRunAutopilot = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canManage) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        const res = await runSalesAutopilotAction(formData);
        if (res.report) {
          setAutopilotResult(res.report);
          setFeedback({
            type: "success",
            message: `AI Sales Autopilot çalıştırıldı! Teklif: ${res.report.quote.grandTotal.toLocaleString("tr-TR")} TRY. Takip görevi oluşturuldu.`,
          });
        }
      } catch (err: unknown) {
        setFeedback({ type: "error", message: getErrorMessage(err, "Satış otopilotu çalıştırılamadı.") });
      }
    });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-muted border border-border flex items-center justify-center text-foreground">
              <Bot className="h-4 w-4" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Maestro Operasyon & Satış Otopilotu</h1>
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground border border-border">
              Otonom Çoklu Ajan
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Merkezi otonom koordinasyon, dayanıklı görev planlama, insan onay mekanizmaları ve uzman ajan iş birliği.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab("autopilot")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
              activeTab === "autopilot" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Zap className="h-3 w-3" /> AI Sales Autopilot
          </button>
          <button
            onClick={() => setActiveTab("maestro")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
              activeTab === "maestro" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="h-3 w-3" /> Maestro & Görevler
          </button>
          <button
            onClick={() => setActiveTab("agents")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
              activeTab === "agents" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Bot className="h-3 w-3" /> Ajan Havuzu ({initialAgents.length})
          </button>
          <button
            onClick={() => setActiveTab("memory")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
              activeTab === "memory" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Database className="h-3 w-3" /> İşletme Hafızası ({memories.length})
          </button>
          <button
            onClick={() => setActiveTab("connectors")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
              activeTab === "connectors" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Plug className="h-3 w-3" /> Konektörler
          </button>
        </div>
      </div>

      {/* Read-only / Demo Banner */}
      {!canManage && (
        <div className="rounded-md border border-amber-200/80 bg-amber-50 p-3 text-xs font-medium text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
          Görüntüleme Modu: Demo veya salt okunur hesap modundasınız. Görev oluşturma, tetikleme ve hafıza yönetimi işlemleri bu modda kilitlidir.
        </div>
      )}

      {/* Feedback Toast */}
      {feedback && (
        <div
          className={`flex items-center justify-between rounded-md p-3 text-xs font-medium border ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200/80 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-900/60 dark:text-emerald-300"
              : "bg-rose-50 border-rose-200/80 text-rose-900 dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-300"
          }`}
        >
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* TAB 1: MAESTRO & GÖREVLER */}
      {activeTab === "maestro" && (
        <div className="space-y-6">
          {/* Goal Input Card */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              Maestro Hedef Planlayıcı
            </h2>
            <form onSubmit={handleCreatePlan} className="space-y-3">
              <div className="relative">
                <textarea
                  value={objectiveInput}
                  onChange={(e) => setObjectiveInput(e.target.value)}
                  placeholder="İş hedefinizi doğal dilde açıklayın. Örn: 'Son 7 gündeki sıcak lead'leri analiz et, teklif ve indirim taslağı hazırla, QA onayından sonra satış ekibine ilet.'"
                  className="w-full h-24 rounded-md border border-input bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>

              {/* Quick Prompts */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Örnek Hedefler:</span>
                {[
                  "Yeni lead'leri nitelendir ve CRM'e kaydet",
                  "Instagram ve LinkedIn için haftalık kampanya planı yap",
                  "Yüksek tutarlı teklifler için indirim ve risk analizi çıkar",
                ].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => setObjectiveInput(sample)}
                    className="rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    {sample}
                  </button>
                ))}
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  type="submit"
                  disabled={isPending || !objectiveInput.trim()}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-md text-xs flex items-center gap-1.5 shadow-xs"
                >
                  <Send className="h-3.5 w-3.5" />
                  {isPending ? "Planlanıyor..." : "Hedefi Maestro'ya Gönder"}
                </Button>
              </div>
            </form>
          </div>

          {/* Current Plan Overview */}
          {currentPlan ? (
            <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-xs">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                      PLAN #{currentPlan.id ? currentPlan.id.slice(0, 8) : "YENİ"}
                    </span>
                    <h3 className="text-base font-semibold text-foreground">{currentPlan.objective}</h3>
                  </div>
                  {currentPlan.planSummary && (
                    <p className="text-xs text-muted-foreground mt-1">{currentPlan.planSummary}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium uppercase border ${
                      currentPlan.status === "completed"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
                        : currentPlan.status === "failed"
                        ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 border-rose-200 dark:border-rose-500/20"
                        : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200 dark:border-amber-500/20"
                    }`}
                  >
                    {currentPlan.status}
                  </span>

                  <Button
                    onClick={handleRecoverStale}
                    disabled={isPending}
                    variant="outline"
                    className="border-border hover:bg-muted text-foreground rounded-md text-xs flex items-center gap-1"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Kilitleri Kurtar
                  </Button>

                  <Button
                    onClick={handleExecuteTasks}
                    disabled={isPending || currentTasks.length === 0}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs flex items-center gap-1 shadow-xs"
                  >
                    <Play className="h-3 w-3" />
                    Görevleri Çalıştır
                  </Button>
                </div>
              </div>

              {/* Tasks List / Graph */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Görev Akış Çizelgesi (DAG Execution Graph)</span>
                  <span>Toplam {currentTasks.length} Görev</span>
                </div>

                {currentTasks.length === 0 ? (
                  <div className="p-8 text-center border border-dashed border-border rounded-lg text-muted-foreground text-xs">
                    Bu planda henüz atanmış görev bulunmuyor.
                  </div>
                ) : (
                  currentTasks.map((task, idx) => (
                    <div
                      key={task.id}
                      className="rounded-lg border border-border bg-card p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-7 w-7 rounded-md bg-muted border border-border flex items-center justify-center text-xs font-semibold text-foreground">
                          {idx + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{task.title}</span>
                            <span className="rounded bg-primary/10 text-primary text-[10px] px-2 py-0.5 border border-primary/20 font-mono">
                              @{task.assignedAgentKey}
                            </span>
                          </div>
                          {task.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
                          )}
                          {task.outputPayload && (
                            <div className="mt-2 text-xs bg-muted/60 border border-border rounded p-2 text-foreground font-mono">
                              ✓ {JSON.stringify(task.outputPayload).slice(0, 120)}...
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end md:self-center">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase border ${
                            task.status === "completed"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
                              : task.status === "waiting_for_approval"
                              ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200 dark:border-amber-500/20"
                              : task.status === "waiting_for_dependency"
                              ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200 dark:border-blue-500/20"
                              : task.status === "failed"
                              ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 border-rose-200 dark:border-rose-500/20"
                              : "bg-muted text-muted-foreground border-border"
                          }`}
                        >
                          {task.status}
                        </span>

                        {["pending", "queued", "running", "waiting_for_dependency"].includes(task.status) && (
                          <button
                            onClick={() => task.id && handleCancelTask(task.id)}
                            disabled={isPending}
                            title="Görevi İptal Et"
                            className="text-muted-foreground hover:text-rose-600 p-1 transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
              Henüz bir orkestrasyon planı oluşturulmadı. Yukarıdaki hedef kutusunu kullanarak başlayın.
            </div>
          )}
        </div>
      )}

      {/* TAB: AI SALES AUTOPILOT */}
      {activeTab === "autopilot" && (
        <div className="space-y-6">
          {/* 1. Satış Operasyonunun Genel Durumu (KPI Cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Toplam Müşteri Fırsatı</span>
                <Users className="h-4 w-4 text-primary" />
              </div>
              <p className="text-2xl font-bold text-foreground mt-2">
                {kpiMetrics?.totalLeads ?? recentLeads.length}
              </p>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-1 font-medium">
                <TrendingUp className="h-3 w-3" /> Veritabanı Toplamı
              </span>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Hazırlanan Teklifler</span>
                <FileText className="h-4 w-4 text-amber-500" />
              </div>
              <p className="text-2xl font-bold text-foreground mt-2">
                {kpiMetrics?.totalQuotes ?? recentQuotes.length}
              </p>
              <span className="text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1 mt-1 font-medium">
                <Clock className="h-3 w-3" /> {kpiMetrics?.draftQuotes ?? recentQuotes.length} Onay Bekleyen Taslak
              </span>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Bekleyen Takip Görevleri</span>
                <Calendar className="h-4 w-4 text-sky-500" />
              </div>
              <p className="text-2xl font-bold text-foreground mt-2">
                {kpiMetrics?.pendingTasks ?? pendingTasks.length}
              </p>
              <span className="text-[11px] text-muted-foreground mt-1">Açık takip & randevular</span>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Otopilot Güvenlik Standardı</span>
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-2">Fail-Closed</p>
              <span className="text-[11px] text-muted-foreground mt-1">Otomatik Mesaj: KAPALI (Onaylı)</span>
            </div>
          </div>

          {/* 2. Hızlı Otopilot Satış Başlatıcı (Lead Intake to Quote Pipeline) */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  Hızlı Otopilot Satış Başlatıcı (Lead Intake & Quote Pipeline)
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Yeni bir potansiyel müşteri için doğrulama, ihtiyaç analizi, katalog eşleştirme, deterministik teklif ve takip planı oluşturur.
                </p>
              </div>
              <span className="rounded-full bg-primary/10 text-primary text-[10px] font-semibold px-2.5 py-1 border border-primary/20">
                Maestro Supervised
              </span>
            </div>

            <form onSubmit={handleRunAutopilot} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Müşteri Adı Soyadı *</label>
                  <input
                    name="fullName"
                    required
                    placeholder="Örn: Mehmet Özkan"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Şirket / Kurum</label>
                  <input
                    name="company"
                    placeholder="Örn: Ege Lojistik A.Ş."
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Telefon Numarası</label>
                  <input
                    name="phone"
                    placeholder="Örn: 0532 123 45 67"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">E-posta Adresi</label>
                  <input
                    name="email"
                    type="email"
                    placeholder="Örn: info@egelojistik.com"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Teslimat İli / Bölgesi</label>
                  <input
                    name="city"
                    defaultValue="İzmir"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Konteyner Ölçüsü (m²)</label>
                  <select
                    name="requestedM2"
                    defaultValue="21"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
                  >
                    <option value="21">21 m² (Standart)</option>
                    <option value="35">35 m²</option>
                    <option value="42">42 m²</option>
                    <option value="48">48 m²</option>
                    <option value="84">84 m² (Modüler Kompleks)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Kullanım Türü</label>
                  <select
                    name="containerType"
                    defaultValue="ofis"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
                  >
                    <option value="ofis">Ofis Konteyneri</option>
                    <option value="yasam">Yaşam / Konut (1+1)</option>
                    <option value="santiye">Şantiye / Yemekhane</option>
                    <option value="ozel">Özel Üretim Çözüm</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Miktar (Adet)</label>
                  <input
                    name="quantity"
                    type="number"
                    min="1"
                    defaultValue="1"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">İskonto Oranı (%)</label>
                  <input
                    name="discountPercent"
                    type="number"
                    min="0"
                    max="30"
                    defaultValue="5"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Nakliye Bedeli (TL - Opsiyonel)</label>
                  <input
                    name="shippingTRY"
                    type="number"
                    min="0"
                    placeholder="Boş bırakılırsa onay bekler"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Montaj Bedeli (TL - Opsiyonel)</label>
                  <input
                    name="assemblyTRY"
                    type="number"
                    min="0"
                    placeholder="Boş bırakılırsa onay bekler"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-border">
                <span className="text-[11px] text-muted-foreground">
                  İZON KONTEYNER Ticari Politikası: %8 üzeri iskontolar ve eksik lojistik maliyetleri otomatik olarak yönetici onayına sunulur.
                </span>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-md text-xs flex items-center gap-1.5 shadow-xs"
                >
                  <Play className="h-3.5 w-3.5" />
                  {isPending ? "Otopilot Çalışıyor..." : "AI Sales Autopilot'u Başlat"}
                </Button>
              </div>
            </form>
          </div>

          {/* 3. Gerçek Zamanlı Otopilot Çıktısı (Execution Result Preview) */}
          {autopilotResult && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-emerald-500/20 pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-base font-semibold text-foreground">Otopilot İcra Raporu</h3>
                  <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    {autopilotResult.executionId.slice(0, 12)}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(autopilotResult.timestamp).toLocaleTimeString("tr-TR")}
                </span>
              </div>

              {autopilotResult.quote.missingCostItems && autopilotResult.quote.missingCostItems.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.08] p-3 text-xs text-amber-800 dark:text-amber-200">
                  <span className="font-semibold block mb-0.5">⚠️ Eksik Lojistik Maliyet Uyarısı:</span>
                  {autopilotResult.quote.missingCostItems.join(", ")}. Teklif taslak olarak kaydedilmiştir; kesinleştirilmeden önce lojistik/yönetici onayı gerekmektedir.
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-lg border border-border bg-card p-3 space-y-1.5 shadow-2xs">
                  <span className="text-xs font-medium text-muted-foreground">Müşteri Analiz Skoru</span>
                  <p className="text-xl font-bold text-foreground">
                    {autopilotResult.analysis.score} / 100
                    <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400 ml-2">
                      ({autopilotResult.analysis.customerType})
                    </span>
                  </p>
                  <ul className="text-[11px] text-muted-foreground space-y-0.5">
                    {autopilotResult.analysis.scoreReasons.slice(0, 2).map((r: string, idx: number) => (
                      <li key={idx}>• {r}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg border border-border bg-card p-3 space-y-1.5 shadow-2xs">
                  <span className="text-xs font-medium text-muted-foreground">Eşleşen Katalog Ürünü</span>
                  <p className="text-sm font-bold text-foreground line-clamp-1">
                    {autopilotResult.productMatch.primaryProduct?.name || "Konteyner"}
                  </p>
                  <p className="text-xs text-primary font-mono font-medium">
                    Birim: {autopilotResult.productMatch.verifiedUnitPrice?.toLocaleString("tr-TR")} TRY
                  </p>
                  <span className="text-[11px] text-muted-foreground">
                    Ölçü: {autopilotResult.productMatch.specificationsMatched.areaM2 || "21 m²"}
                  </span>
                </div>

                <div className="rounded-lg border border-border bg-card p-3 space-y-1.5 shadow-2xs">
                  <span className="text-xs font-medium text-muted-foreground">Teklif Taslağı (QA Onaylı)</span>
                  <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                    {autopilotResult.quote.grandTotal.toLocaleString("tr-TR")} TRY
                  </p>
                  <span className="text-[11px] text-muted-foreground">
                    Durum: {autopilotResult.quote.status.toUpperCase()} (KDV & İskonto Dahil)
                  </span>
                  {autopilotResult.quote.requiresApproval && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 block font-medium">
                      ⚠️ Yönetici Onayı Bekliyor
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shadow-2xs">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-sky-500 shrink-0" />
                  <span className="text-xs text-foreground">
                    <strong>Planlanan Takip:</strong> {autopilotResult.followUp.title} ({new Date(autopilotResult.followUp.dueAt).toLocaleDateString("tr-TR")})
                  </span>
                </div>
                <span className="text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-500/20 font-medium">
                  ✓ Güvenli Takip: Mesaj gönderilmedi
                </span>
              </div>
            </div>
          )}

          {/* 4. Tablolar: Fırsatlar, Teklifler ve Takip Görevleri */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Öncelikli Müşteri Fırsatları */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-xs">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Öncelikli Müşteri Fırsatları
              </h3>
              <div className="space-y-2">
                {recentLeads.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">Henüz müşteri adayı kaydı yok.</p>
                ) : (
                  recentLeads.slice(0, 5).map((lead: LeadItem) => (
                    <div
                      key={lead.id}
                      className="rounded-lg border border-border bg-background p-3 flex items-center justify-between hover:bg-muted/40 transition-colors"
                    >
                      <div>
                        <h4 className="text-xs font-semibold text-foreground">{lead.full_name}</h4>
                        <span className="text-[11px] text-muted-foreground">{lead.company || lead.city || "Bireysel"}</span>
                      </div>
                      <span className="rounded-full bg-primary/10 text-primary text-[10px] font-medium px-2 py-0.5 border border-primary/20">
                        {lead.status || "qualified"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Hazırlanan Teklif Taslakları */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-xs">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4 text-amber-500" />
                Hazırlanan Teklif Taslakları (Quote Copilot)
              </h3>
              <div className="space-y-2">
                {recentQuotes.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">Henüz teklif taslağı oluşturulmadı.</p>
                ) : (
                  recentQuotes.slice(0, 5).map((quote: QuoteItem) => (
                    <div
                      key={quote.id}
                      className="rounded-lg border border-border bg-background p-3 flex items-center justify-between hover:bg-muted/40 transition-colors"
                    >
                      <div>
                        <h4 className="text-xs font-semibold text-foreground font-mono">
                          {Number(quote.total_amount).toLocaleString("tr-TR")} {quote.currency || "TRY"}
                        </h4>
                        <span className="text-[11px] text-muted-foreground">
                          {quote.metadata?.model || "Ofis Konteyneri"}
                        </span>
                      </div>
                      <span className="rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 text-[10px] font-medium px-2 py-0.5 border border-amber-200 dark:border-amber-500/20">
                        {quote.status?.toUpperCase() || "DRAFT"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Bekleyen Takip Görevleri */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-xs">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4 text-sky-500" />
              Bekleyen Satış Takip Görevleri
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {pendingTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 col-span-3 text-center">Henüz bekleyen takip görevi yok.</p>
              ) : (
                pendingTasks.slice(0, 6).map((task: PendingTaskItem) => (
                  <div
                    key={task.id}
                    className="rounded-lg border border-border bg-background p-3 space-y-1.5 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 px-2 py-0.5 rounded border border-sky-200 dark:border-sky-500/20">
                        Vade: {task.due_at ? new Date(task.due_at).toLocaleDateString("tr-TR") : "Belirtilmedi"}
                      </span>
                      <span className="text-[10px] text-muted-foreground uppercase">{task.priority || "normal"}</span>
                    </div>
                    <h4 className="text-xs font-semibold text-foreground line-clamp-1">{task.title}</h4>
                    <span className="text-[10px] text-muted-foreground">Durum: {task.status || "open"} (İnsan Onaylı)</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: UZMAN AJAN HAVUZU */}
      {activeTab === "agents" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {initialAgents.map((agent) => (
            <div
              key={agent.key}
              className={`rounded-xl border p-4 space-y-3 transition-all shadow-xs ${
                agent.status === "active"
                  ? "border-border bg-card"
                  : "border-border/60 bg-muted/30 opacity-70"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="rounded bg-primary/10 text-primary text-[10px] px-2 py-0.5 font-medium uppercase border border-primary/20">
                    {agent.department}
                  </span>
                  <h3 className="text-base font-semibold text-foreground mt-1">{agent.name}</h3>
                </div>
                <button
                  onClick={() => handleToggleAgent(agent.key, agent.status)}
                  className={`text-xs font-semibold px-2 py-1 rounded-md border transition-colors ${
                    agent.status === "active"
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20 hover:bg-emerald-100"
                      : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                  }`}
                >
                  {agent.status === "active" ? "Aktif" : "Pasif"}
                </button>
              </div>

              <p className="text-xs text-muted-foreground line-clamp-2">{agent.description}</p>

              {/* Permissions & Security Guard */}
              <div className="border-t border-border pt-2 space-y-1 text-[11px] text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>CRM Verisi Okuma:</span>
                  <span className={agent.permissionProfile.canReadCrm ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-muted-foreground"}>
                    {agent.permissionProfile.canReadCrm ? "Yetkili" : "Kapalı"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Harici Eylem Onayı:</span>
                  <span className={agent.permissionProfile.requiresApprovalForExternal ? "text-amber-600 dark:text-amber-400 font-medium" : "text-emerald-600 dark:text-emerald-400 font-medium"}>
                    {agent.permissionProfile.requiresApprovalForExternal ? "İnsan Onayı Zorunlu" : "Otomatik"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Harcama Limiti:</span>
                  <span className="text-foreground font-medium">${agent.permissionProfile.externalSpendLimitUsd} USD</span>
                </div>
              </div>

              {/* Skills */}
              <div className="flex flex-wrap gap-1 pt-1">
                {agent.supportedSkills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono"
                  >
                    #{skill}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: İŞLETME HAFIZASI */}
      {activeTab === "memory" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 rounded-xl border border-border bg-card p-5 space-y-4 shadow-xs">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              Yeni Operasyonel Kural / Hafıza Ekle
            </h3>
            <form onSubmit={handleAddMemory} className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Kategori</label>
                <select
                  name="category"
                  className="w-full rounded-md border border-input bg-background p-2 text-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                >
                  <option value="business_policy">İşletme Politikası & Kuralı</option>
                  <option value="business_profile">İşletme Profili & Marka</option>
                  <option value="customer_insight">Müşteri Görüşü / Tercihi</option>
                  <option value="operational_fact">Operasyonel Gerçek</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-1">Başlık</label>
                <input
                  name="title"
                  required
                  placeholder="Örn: Maksimum İskonto Oranı"
                  className="w-full rounded-md border border-input bg-background p-2 text-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-1">İçerik</label>
                <textarea
                  name="content"
                  required
                  rows={3}
                  placeholder="Örn: Yöneticiden onay alınmadığı sürece hiçbir satış ajanı %15 üzerinde indirim teklif edemez."
                  className="w-full rounded-md border border-input bg-background p-2 text-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-1">Kaynak</label>
                <input
                  name="sourceAttribution"
                  defaultValue="Yönetici Politikası"
                  className="w-full rounded-md border border-input bg-background p-2 text-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                />
              </div>

              <Button
                type="submit"
                disabled={isPending}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-md text-xs shadow-xs"
              >
                Hafızaya Kaydet
              </Button>
            </form>
          </div>

          <div className="lg:col-span-2 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Kayıtlı İşletme Hafızası ve Kuralları</h3>
            {memories.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-border rounded-lg text-muted-foreground text-xs">
                Kayıtlı operasyonel hafıza bulunmuyor.
              </div>
            ) : (
              memories.map((mem) => (
                <div
                  key={mem.id}
                  className="rounded-lg border border-border bg-card p-4 flex items-start justify-between gap-3 shadow-2xs hover:bg-muted/30 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-primary/10 text-primary text-[10px] px-2 py-0.5 border border-primary/20 font-mono uppercase">
                        {mem.category}
                      </span>
                      <h4 className="text-sm font-medium text-foreground">{mem.title}</h4>
                    </div>
                    <p className="text-xs text-muted-foreground">{mem.content}</p>
                    <span className="text-[10px] text-muted-foreground/80">Kaynak: {mem.sourceAttribution}</span>
                  </div>

                  <button
                    onClick={() => mem.id && handleDeleteMemory(mem.id)}
                    className="text-muted-foreground hover:text-rose-600 p-1 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 4: KONEKTÖRLER VE ARAÇLAR */}
      {activeTab === "connectors" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { key: "whatsapp", name: "WhatsApp Business API", type: "Mesajlaşma & 24h Window" },
            { key: "meta", name: "Meta Business & Instagram", type: "Sosyal Medya & DM" },
            { key: "telnyx", name: "Telnyx / Twilio Voice", type: "Sesli Satış & AI Çağrı" },
            { key: "smtp_email", name: "Kurumsal E-posta", type: "Teklif & İletişim" },
            { key: "crm_internal", name: "FlowSales CRM Entegrasyonu", type: "Leads, Quotes, Deals" },
            { key: "lemonsqueezy", name: "LemonSqueezy / Stripe", type: "Tahsilat & Faturalandırma" },
          ].map((conn) => (
            <div
              key={conn.key}
              className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-xs"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">{conn.name}</h4>
                  <span className="text-xs text-muted-foreground">{conn.type}</span>
                </div>
                <span className="rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 text-[10px] font-semibold px-2 py-0.5 border border-emerald-200 dark:border-emerald-500/20">
                  Hazır
                </span>
              </div>

              <div className="pt-2 border-t border-border flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Hata Oranı: %0</span>
                <Button
                  onClick={() => handleTestConnector(conn.key)}
                  disabled={isPending}
                  variant="outline"
                  size="sm"
                  className="text-xs rounded-md border-border hover:bg-muted text-foreground"
                >
                  Sağlık Testi
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
