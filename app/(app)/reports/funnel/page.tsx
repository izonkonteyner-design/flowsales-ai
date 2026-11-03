import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { getSalesFunnel } from "@/server/services/sales-operations-v5";

const LABELS: Record<string, string> = {
  new: "Yeni Lead",
  contacted: "İletişim Kuruldu",
  qualified: "Nitelikli Fırsat",
  quote_sent: "Teklif İletildi",
  negotiation: "Müzakere & Pazarlık",
  won: "Kazanıldı",
};

export default async function FunnelReportPage() {
  const context = await getWorkspaceContext();
  const funnel =
    context.mode === "live" ? await getSalesFunnel(context.organization.id) : { total: 0, stages: [] };
  const lowest = funnel.stages
    .slice(1)
    .sort((a, b) => a.conversionFromPrevious - b.conversionFromPrevious)[0];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Dönüşüm & Huni Analitiği"
        title="Satış Hunisi Raporu"
        description="Aday edinimi → Temas → Nitelik → Teklif → Müzakere → Satış aşamalarının dönüşüm oranları."
      />

      <SectionCard title="Genel Huni Özeti" description="Toplam aday hacmi ve huni içindeki en zayıf geçiş noktası.">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-xs text-muted-foreground font-medium">Toplam İşlenen Aday</span>
            <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">{funnel.total} Aday</p>
          </div>
          {lowest ? (
            <div className="rounded-md border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
              <span className="font-semibold">Kritik Dönüşüm Kaybı:</span> {LABELS[lowest.stage] || lowest.stage} aşamasına geçiş oranı yalnızca %{lowest.conversionFromPrevious}
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Aşama Bazlı Dönüşüm Tablosu" description="Her aşamada kalan aday sayısı ve bir önceki aşamadan geçiş oranı.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {funnel.stages.map((stage) => (
            <div
              key={stage.stage}
              className="rounded-lg border border-border bg-card p-3.5 shadow-xs"
            >
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {LABELS[stage.stage] || stage.stage}
              </span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold text-foreground">{stage.count}</span>
                <span className="text-xs font-semibold text-primary">
                  Geçiş: %{stage.conversionFromPrevious}
                </span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
