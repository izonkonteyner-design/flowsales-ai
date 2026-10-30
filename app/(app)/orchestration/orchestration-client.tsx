"use client";

import { useState, useTransition } from "react";
import {
  Bot, Sparkles, Play, RefreshCw,
  Database, Plug, Send, X, Trash2
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
} from "./actions";
import type { AgentDefinition, OrchestrationPlan, OrchestrationTask, BusinessMemory } from "@/types/orchestration";

interface OrchestrationClientProps {
  initialAgents: AgentDefinition[];
  plans: OrchestrationPlan[];
  tasks: OrchestrationTask[];
  memories: BusinessMemory[];
  connectors: Array<Record<string, unknown>>;
  canManage?: boolean;
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
}: OrchestrationClientProps) {
  void _connectors;
  const [activeTab, setActiveTab] = useState<"maestro" | "agents" | "memory" | "connectors">("maestro");
  const [objectiveInput, setObjectiveInput] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(plans[0]?.id || null);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b border-white/[0.08] pb-6">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <Bot className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">AI Operations & Maestro</h1>
            <span className="rounded-full bg-violet-500/10 px-2.5 py-0.5 text-xs font-semibold text-violet-400 border border-violet-500/20">
              Autonomous Multi-Agent
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Wix Symphony yeteneklerinde merkezi otonom koordinasyon, dayanıklı görev planlama, insan onayı ve çoklu ajan iş birliği.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-1">
          <button
            onClick={() => setActiveTab("maestro")}
            className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "maestro" ? "bg-violet-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" /> Maestro & Görevler
          </button>
          <button
            onClick={() => setActiveTab("agents")}
            className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "agents" ? "bg-violet-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            <Bot className="h-3.5 w-3.5" /> Ajan Havuzu ({initialAgents.length})
          </button>
          <button
            onClick={() => setActiveTab("memory")}
            className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "memory" ? "bg-violet-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            <Database className="h-3.5 w-3.5" /> İşletme Hafızası ({memories.length})
          </button>
          <button
            onClick={() => setActiveTab("connectors")}
            className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "connectors" ? "bg-violet-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            <Plug className="h-3.5 w-3.5" /> Konektörler
          </button>
        </div>
      </div>

      {/* Read-only / Demo Banner */}
      {!canManage && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs font-medium text-amber-300">
          Görüntüleme Modu: Demo veya salt okunur hesap modundasınız. Görev oluşturma, tetikleme ve hafıza yönetimi işlemleri bu modda kilitlidir.
        </div>
      )}

      {/* Feedback Toast */}
      {feedback && (
        <div
          className={`flex items-center justify-between rounded-xl p-3 text-sm border ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/10 border-rose-500/30 text-rose-300"
          }`}
        >
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* TAB 1: MAESTRO & GÖREVLER */}
      {activeTab === "maestro" && (
        <div className="space-y-6">
          {/* Goal Input Card */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 backdrop-blur-sm">
            <h2 className="text-base font-semibold text-white flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-violet-400" />
              Maestro Hedef Planlayıcı
            </h2>
            <form onSubmit={handleCreatePlan} className="space-y-3">
              <div className="relative">
                <textarea
                  value={objectiveInput}
                  onChange={(e) => setObjectiveInput(e.target.value)}
                  placeholder="İş hedefinizi doğal dilde açıklayın. Örn: 'Son 7 gündeki sıcak lead'leri analiz et, teklif ve indirim taslağı hazırla, QA onayından sonra satış ekibine ilet.'"
                  className="w-full h-24 rounded-xl border border-white/[0.1] bg-white/[0.03] p-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
                />
              </div>

              {/* Quick Prompts */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">Örnek Hedefler:</span>
                {[
                  "Yeni lead'leri nitelendir ve CRM'e kaydet",
                  "Instagram ve LinkedIn için haftalık kampanya planı yap",
                  "Yüksek tutarlı teklifler için indirim ve risk analizi çıkar",
                ].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => setObjectiveInput(sample)}
                    className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-xs text-slate-400 hover:text-violet-300 hover:border-violet-500/30 transition-colors"
                  >
                    {sample}
                  </button>
                ))}
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  type="submit"
                  disabled={isPending || !objectiveInput.trim()}
                  className="bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs flex items-center gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" />
                  {isPending ? "Planlanıyor..." : "Hedefi Maestro'ya Gönder"}
                </Button>
              </div>
            </form>
          </div>

          {/* Current Plan Overview */}
          {currentPlan ? (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-white/[0.06] pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/20">
                      PLAN #{currentPlan.id ? currentPlan.id.slice(0, 8) : "YENİ"}
                    </span>
                    <h3 className="text-base font-semibold text-white">{currentPlan.objective}</h3>
                  </div>
                  {currentPlan.planSummary && (
                    <p className="text-xs text-slate-400 mt-1">{currentPlan.planSummary}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${
                      currentPlan.status === "completed"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : currentPlan.status === "failed"
                        ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                        : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    }`}
                  >
                    {currentPlan.status}
                  </span>

                  <Button
                    onClick={handleRecoverStale}
                    disabled={isPending}
                    variant="outline"
                    className="border-white/[0.1] hover:bg-white/[0.05] text-slate-300 rounded-xl text-xs flex items-center gap-1"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Kilitleri Kurtar
                  </Button>

                  <Button
                    onClick={handleExecuteTasks}
                    disabled={isPending || currentTasks.length === 0}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs flex items-center gap-1"
                  >
                    <Play className="h-3 w-3" />
                    Görevleri Çalıştır
                  </Button>
                </div>
              </div>

              {/* Tasks List / Graph */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Görev Akış Çizelgesi (DAG Execution Graph)</span>
                  <span>Toplam {currentTasks.length} Görev</span>
                </div>

                {currentTasks.length === 0 ? (
                  <div className="p-8 text-center border border-dashed border-white/[0.08] rounded-xl text-slate-500 text-xs">
                    Bu planda henüz atanmış görev bulunmuyor.
                  </div>
                ) : (
                  currentTasks.map((task, idx) => (
                    <div
                      key={task.id}
                      className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-violet-500/30 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-7 w-7 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-xs font-semibold text-slate-300">
                          {idx + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white">{task.title}</span>
                            <span className="rounded bg-violet-500/10 text-violet-300 text-[10px] px-2 py-0.5 border border-violet-500/20">
                              @{task.assignedAgentKey}
                            </span>
                          </div>
                          {task.description && (
                            <p className="text-xs text-slate-400 mt-0.5">{task.description}</p>
                          )}
                          {task.outputPayload && (
                            <div className="mt-2 text-xs bg-black/40 border border-white/[0.04] rounded p-2 text-slate-300 font-mono">
                              ✓ {JSON.stringify(task.outputPayload).slice(0, 120)}...
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end md:self-center">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            task.status === "completed"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : task.status === "waiting_for_approval"
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              : task.status === "waiting_for_dependency"
                              ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                              : task.status === "failed"
                              ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                              : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                          }`}
                        >
                          {task.status}
                        </span>

                        {["pending", "queued", "running", "waiting_for_dependency"].includes(task.status) && (
                          <button
                            onClick={() => task.id && handleCancelTask(task.id)}
                            disabled={isPending}
                            title="Görevi İptal Et"
                            className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
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
            <div className="rounded-2xl border border-dashed border-white/[0.08] p-12 text-center text-slate-400">
              Henüz bir orkestrasyon planı oluşturulmadı. Yukarıdaki hedef kutusunu kullanarak başlayın.
            </div>
          )}
        </div>
      )}

      {/* TAB 2: UZMAN AJAN HAVUZU */}
      {activeTab === "agents" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {initialAgents.map((agent) => (
            <div
              key={agent.key}
              className={`rounded-2xl border p-4 space-y-3 transition-all ${
                agent.status === "active"
                  ? "border-white/[0.08] bg-white/[0.02]"
                  : "border-white/[0.04] bg-white/[0.005] opacity-60"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="rounded bg-violet-500/10 text-violet-300 text-[10px] px-2 py-0.5 font-medium uppercase border border-violet-500/20">
                    {agent.department}
                  </span>
                  <h3 className="text-base font-semibold text-white mt-1">{agent.name}</h3>
                </div>
                <button
                  onClick={() => handleToggleAgent(agent.key, agent.status)}
                  className={`text-xs font-semibold px-2 py-1 rounded-lg border transition-colors ${
                    agent.status === "active"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                      : "bg-slate-500/10 text-slate-400 border-slate-500/20 hover:bg-slate-500/20"
                  }`}
                >
                  {agent.status === "active" ? "Aktif" : "Pasif"}
                </button>
              </div>

              <p className="text-xs text-slate-400 line-clamp-2">{agent.description}</p>

              {/* Permissions & Security Guard */}
              <div className="border-t border-white/[0.04] pt-2 space-y-1 text-[11px] text-slate-400">
                <div className="flex items-center justify-between">
                  <span>CRM Verisi Okuma:</span>
                  <span className={agent.permissionProfile.canReadCrm ? "text-emerald-400" : "text-slate-500"}>
                    {agent.permissionProfile.canReadCrm ? "Yetkili" : "Kapalı"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Harici Eylem Onayı:</span>
                  <span className={agent.permissionProfile.requiresApprovalForExternal ? "text-amber-400" : "text-emerald-400"}>
                    {agent.permissionProfile.requiresApprovalForExternal ? "İnsan Onayı Zorunlu" : "Otomatik"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Harcama Limiti:</span>
                  <span className="text-slate-300">${agent.permissionProfile.externalSpendLimitUsd} USD</span>
                </div>
              </div>

              {/* Skills */}
              <div className="flex flex-wrap gap-1 pt-1">
                {agent.supportedSkills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-slate-400"
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
          <div className="lg:col-span-1 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Database className="h-4 w-4 text-violet-400" />
              Yeni Operasyonel Kural / Hafıza Ekle
            </h3>
            <form onSubmit={handleAddMemory} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Kategori</label>
                <select
                  name="category"
                  className="w-full rounded-xl border border-white/[0.1] bg-white/[0.03] p-2 text-xs text-white outline-none"
                >
                  <option value="business_policy" className="bg-[#0b1020]">İşletme Politikası & Kuralı</option>
                  <option value="business_profile" className="bg-[#0b1020]">İşletme Profili & Marka</option>
                  <option value="customer_insight" className="bg-[#0b1020]">Müşteri Görüşü / Tercihi</option>
                  <option value="operational_fact" className="bg-[#0b1020]">Operasyonel Gerçek</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Başlık</label>
                <input
                  name="title"
                  required
                  placeholder="Örn: Maksimum İskonto Oranı"
                  className="w-full rounded-xl border border-white/[0.1] bg-white/[0.03] p-2 text-xs text-white outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">İçerik</label>
                <textarea
                  name="content"
                  required
                  rows={3}
                  placeholder="Örn: Yöneticiden onay alınmadığı sürece hiçbir satış ajanı %15 üzerinde indirim teklif edemez."
                  className="w-full rounded-xl border border-white/[0.1] bg-white/[0.03] p-2 text-xs text-white outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Kaynak</label>
                <input
                  name="sourceAttribution"
                  defaultValue="Yönetici Politikası"
                  className="w-full rounded-xl border border-white/[0.1] bg-white/[0.03] p-2 text-xs text-white outline-none"
                />
              </div>

              <Button
                type="submit"
                disabled={isPending}
                className="w-full bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs"
              >
                Hafızaya Kaydet
              </Button>
            </form>
          </div>

          <div className="lg:col-span-2 space-y-3">
            <h3 className="text-sm font-semibold text-white">Kayıtlı İşletme Hafızası ve Kuralları</h3>
            {memories.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-white/[0.08] rounded-xl text-slate-500 text-xs">
                Kayıtlı operasyonel hafıza bulunmuyor.
              </div>
            ) : (
              memories.map((mem) => (
                <div
                  key={mem.id}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 flex items-start justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-violet-500/10 text-violet-300 text-[10px] px-2 py-0.5 border border-violet-500/20 font-mono uppercase">
                        {mem.category}
                      </span>
                      <h4 className="text-sm font-medium text-white">{mem.title}</h4>
                    </div>
                    <p className="text-xs text-slate-300">{mem.content}</p>
                    <span className="text-[10px] text-slate-500">Kaynak: {mem.sourceAttribution}</span>
                  </div>

                  <button
                    onClick={() => mem.id && handleDeleteMemory(mem.id)}
                    className="text-slate-500 hover:text-rose-400 p-1"
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
              className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-white">{conn.name}</h4>
                  <span className="text-xs text-slate-400">{conn.type}</span>
                </div>
                <span className="rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold px-2 py-0.5 border border-emerald-500/20">
                  Hazır
                </span>
              </div>

              <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between">
                <span className="text-[11px] text-slate-500">Hata Oranı: %0</span>
                <Button
                  onClick={() => handleTestConnector(conn.key)}
                  disabled={isPending}
                  variant="outline"
                  size="sm"
                  className="text-xs rounded-xl border-white/[0.1] hover:bg-white/[0.05]"
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
