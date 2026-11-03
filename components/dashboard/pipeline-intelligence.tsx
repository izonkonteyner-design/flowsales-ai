import Link from "next/link";
import { AlertTriangle, ArrowUpRight, BarChart3, Flame, Gauge, Target } from "lucide-react";

import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatCurrency } from "@/lib/utils";
import { getPipelineIntelligence } from "@/server/services/sales-intelligence-v3";
import { loadWorkspaceContext } from "@/server/services/workspace-context";

const stageLabels: Record<string, string> = {
  new_lead: "Yeni lead",
  discovery: "İhtiyaç analizi",
  qualified: "Nitelikli",
  quote_ready: "Teklife hazır",
  quote_sent: "Teklif gönderildi",
  negotiation: "Pazarlık",
};

export async function PipelineIntelligence() {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) return null;

  let data;
  try {
    data = await getPipelineIntelligence({
      organizationId: ctx.organization.id,
      userId: ctx.userId,
      userRole: ctx.role,
    });
  } catch {
    return null;
  }

  return (
    <SectionCard
      title="Satış Hunisi Zekâsı (Pipeline Intelligence)"
      description="Açık fırsatların kalite, risk, öncelik ve tahmini değer dağılım özeti."
    >
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <Metric icon={BarChart3} label="Açık Fırsat" value={String(data.totalOpen)} />
        <Metric icon={Gauge} label="Ortalama Lead Score" value={String(data.weightedScore)} />
        <Metric icon={Flame} label="Yüksek Öncelik" value={String(data.highPriorityCount)} />
        <Metric
          icon={AlertTriangle}
          label="Riskli fırsat"
          value={String(data.staleCount)}
          tone={data.staleCount > 0 ? "risk" : undefined}
        />
        <Metric
          icon={Target}
          label="Tahmini Huni Değeri"
          value={formatCurrency(data.estimatedValue, "TRY")}
        />
      </div>

      {data.stages.length ? (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 border-b border-border text-muted-foreground font-semibold">
              <tr>
                <th className="px-3.5 py-2.5">Aşama</th>
                <th className="px-3 py-2.5 text-center">Fırsat Sayısı</th>
                <th className="px-3 py-2.5 text-center">Ortalama Skor</th>
                <th className="px-3 py-2.5 text-center">Riskli</th>
                <th className="px-3.5 py-2.5 text-right">Tahmini Değer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.stages.map((stage) => (
                <tr key={stage.stage} className="hover:bg-muted/30 transition-colors">
                  <td className="px-3.5 py-2.5 font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      <span>{stageLabels[stage.stage] || stage.stage}</span>
                      {stage.highPriorityCount ? (
                        <StatusBadge tone="danger">{stage.highPriorityCount} acil</StatusBadge>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center text-foreground font-semibold">
                    {stage.count}
                  </td>
                  <td className="px-3 py-2.5 text-center font-semibold text-foreground">
                    {stage.averageScore}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span
                      className={
                        stage.staleCount > 0
                          ? "font-semibold text-rose-600 dark:text-rose-400"
                          : "text-muted-foreground"
                      }
                    >
                      {stage.staleCount}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-medium text-foreground">
                    {formatCurrency(stage.estimatedValue, "TRY")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
          Satış hunisi zekâsı için yeterli veri bulunmuyor.
        </div>
      )}

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border">
        <p className="text-[11px] text-muted-foreground">
          Pipeline Intelligence verileri gerçek CRM aktivitelerinden derlenir; aşamalar otomatik değiştirilmez.
        </p>
        <div className="flex items-center gap-2">
          <Link
            href="/opportunities/risk"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 text-xs font-medium text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 transition-colors"
          >
            Risk Kuyruğu <ArrowUpRight className="h-3 w-3" />
          </Link>
          <Link
            href="/follow-ups"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
          >
            Takip Kuyruğu <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </SectionCard>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
  tone?: "risk";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-xs">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon
          className={`h-3.5 w-3.5 ${
            tone === "risk" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
          }`}
        />
        <span className="truncate">{label}</span>
      </div>
      <p
        className={`mt-1.5 text-xl font-bold tracking-tight truncate ${
          tone === "risk" ? "text-rose-600 dark:text-rose-400" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
