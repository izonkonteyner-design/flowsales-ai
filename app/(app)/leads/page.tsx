import Link from "next/link";
import { cookies } from "next/headers";
import { Filter, LayoutGrid, List, Plus, Search } from "lucide-react";

import { LEAD_STATUSES } from "@/lib/constants";
import { EmptyState } from "@/components/shared/empty-state";
import { FlashToast } from "@/components/shared/flash-toast";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LeadDeleteDialog } from "@/components/leads/lead-delete-dialog";
import { LeadDuplicatesCard } from "@/components/leads/lead-duplicates-card";
import { LeadStatusMenu } from "@/components/leads/lead-status-menu";
import { LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { getLeadPageData } from "@/server/services/leads";
import {
  formatLeadFollowUpState,
  canMutateLeadRecord,
  getLeadRecordBadge,
  getLeadRecordRestrictionMessage,
  getLeadStatusLabel,
  getLeadStatusTone,
  type LeadFilterState,
} from "@/server/services/lead-domain";
import type { WorkspaceRole } from "@/lib/workspace-roles";

type LeadsPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
type Locale = "tr" | "en";
type LeadRole = WorkspaceRole;
type LeadRows = Awaited<ReturnType<typeof getLeadPageData>>["leads"];

const copy = {
  tr: {
    title: "Potansiyel Müşteriler",
    description: "Fırsatları yapılandırılmış satış hattında arayın, nitelendirin ve ilerletin.",
    pipelineView: "Satış Hattı",
    tableView: "Liste Görünümü",
    newLead: "Yeni Fırsat Ekle",
    total: "Toplam Fırsat",
    orgScoped: "Organizasyon Kapsamı",
    new: "Yeni Fırsatlar",
    ready: "Nitelendirmeye Hazır",
    pipelineValue: "Toplam Huni Değeri",
    activeOpp: "Aktif Fırsatlar",
    followups: "Takip Zamanı Gelen",
    overdue: "gecikmiş",
    workspace: "Filtre ve Arama Çubuğu",
    workspaceDesc: "Satış hattını düzenli tutmak için filtreleri ve sıralamayı kullanın.",
    search: "Arama",
    status: "Durum",
    allStatuses: "Tüm Durumlar",
    source: "Kaynak",
    allSources: "Tüm Kaynaklar",
    assigned: "Sorumlu",
    allMembers: "Tüm Ekip",
    sort: "Sıralama",
    newest: "En Yeni",
    oldest: "En Eski",
    value: "Değer",
    followup: "Takip",
    apply: "Uygula",
    reset: "Sıfırla",
    allLeads: "Potansiyel Müşteri Listesi",
    allLeadsDesc: "Arama ve durum filtrelerine göre sıralanmış operasyonel tablo.",
    lead: "Müşteri / Şirket",
    company: "Şirket",
    noCompany: "Şirket yok",
    noCity: "Şehir yok",
    noEmail: "E-posta yok",
    assignedTo: "Sorumlu",
    notSet: "Belirtilmedi",
    view: "Görüntüle",
    edit: "Düzenle",
    pipeline: "Satış Hattı Panosu (Kanban)",
    pipelineDesc: "Fırsatların aşamalarını kolonlar üzerinden yönetin.",
    noStage: "Bu aşamada kayıt yok.",
    saveStage: "Aşamayı Kaydet",
    noFollowup: "Takip tarihi yok",
    noMatches: "Bu filtrelerle eşleşen kayıt bulunamadı",
    noMatchesDesc: "Farklı bir arama terimi deneyin veya filtreleri temizleyin.",
    page: "Sayfa",
    of: "/",
    previous: "Önceki",
    next: "Sonraki",
    liveRecord: "Canlı",
    demoRecord: "Demo",
  },
  en: {
    title: "Leads",
    description: "Search, qualify, and advance opportunities through a structured pipeline.",
    pipelineView: "Pipeline View",
    tableView: "Table View",
    newLead: "New Lead",
    total: "Total Leads",
    orgScoped: "Organization scoped",
    new: "New Leads",
    ready: "Ready for qualification",
    pipelineValue: "Pipeline Value",
    activeOpp: "Active opportunities",
    followups: "Follow-ups Due",
    overdue: "overdue",
    workspace: "Filter & Search Bar",
    workspaceDesc: "Use search, filters, and sorting to organize the pipeline.",
    search: "Search",
    status: "Status",
    allStatuses: "All statuses",
    source: "Source",
    allSources: "All sources",
    assigned: "Assigned To",
    allMembers: "All members",
    sort: "Sort",
    newest: "Newest",
    oldest: "Oldest",
    value: "Value",
    followup: "Follow-up",
    apply: "Apply",
    reset: "Reset",
    allLeads: "Lead Directory",
    allLeadsDesc: "Operational data table sorted by active filters.",
    lead: "Lead / Company",
    company: "Company",
    noCompany: "No company",
    noCity: "No city",
    noEmail: "No email",
    assignedTo: "Assigned to",
    notSet: "Not set",
    view: "View",
    edit: "Edit",
    pipeline: "Sales Pipeline Board",
    pipelineDesc: "Move leads between stages without leaving the board.",
    noStage: "No leads in this stage.",
    saveStage: "Save Stage",
    noFollowup: "No follow-up",
    noMatches: "No leads match these filters",
    noMatchesDesc: "Try a different search or clear your filters.",
    page: "Page",
    of: "of",
    previous: "Previous",
    next: "Next",
    liveRecord: "Live",
    demoRecord: "Demo",
  },
} as const;

const trLeadStatus: Record<string, string> = {
  new: "Yeni",
  contacted: "İletişim Kuruldu",
  qualified: "Nitelikli",
  quote_sent: "Teklif İletildi",
  negotiation: "Pazarlık",
  won: "Kazanıldı",
  lost: "Kaybedildi",
};

function buildLeadHref(filters: LeadFilterState, overrides: Partial<LeadFilterState> = {}) {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.query) params.set("query", merged.query);
  if (merged.status) params.set("status", merged.status);
  if (merged.source) params.set("source", merged.source);
  if (merged.assignedTo) params.set("assignedTo", merged.assignedTo);
  if (merged.sort !== "newest") params.set("sort", merged.sort);
  if (merged.view !== "table") params.set("view", merged.view);
  if (merged.page > 1) params.set("page", String(merged.page));
  if (merged.pageSize !== 8) params.set("pageSize", String(merged.pageSize));
  const query = params.toString();
  return query ? `/leads?${query}` : "/leads";
}

function leadStatusLabel(locale: Locale, status: string) {
  const fallback = getLeadStatusLabel(status as Parameters<typeof getLeadStatusLabel>[0]);
  return locale === "tr" ? trLeadStatus[status] ?? fallback : fallback;
}

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const rawSearchParams = await searchParams;
  const data = await getLeadPageData(rawSearchParams);
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  const c = copy[locale];
  const toastMessage = typeof rawSearchParams.toast === "string" ? rawSearchParams.toast : "";
  const toastTone =
    rawSearchParams.tone === "danger" ||
    rawSearchParams.tone === "warning" ||
    rawSearchParams.tone === "info"
      ? rawSearchParams.tone
      : "success";
  const currentHref = buildLeadHref(data.filters);
  const createLeadHref = `/leads/new?redirect_to=${encodeURIComponent(currentHref)}`;
  const toggleViewHref = buildLeadHref(data.filters, {
    view: data.filters.view === "table" ? "pipeline" : "table",
    page: 1,
  });
  const hasFilters =
    Boolean(data.filters.query || data.filters.status || data.filters.source || data.filters.assignedTo) ||
    data.filters.sort !== "newest" ||
    data.filters.pageSize !== 8;

  return (
    <div className="space-y-5">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}

      <PageHeader
        eyebrow="Satış & Fırsat Yönetimi"
        title={c.title}
        description={c.description}
        actions={
          <>
            <Link
              href={toggleViewHref}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              {data.filters.view === "table" ? (
                <LayoutGrid className="h-3.5 w-3.5" />
              ) : (
                <List className="h-3.5 w-3.5" />
              )}
              {data.filters.view === "table" ? c.pipelineView : c.tableView}
            </Link>
            <Link
              href={createLeadHref}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              {c.newLead}
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={c.total}
          value={String(data.summary.totalLeads)}
          delta={c.orgScoped}
          icon={Filter}
          tone="blue"
        />
        <MetricCard
          label={c.new}
          value={String(data.summary.newLeads)}
          delta={c.ready}
          icon={Search}
          tone="emerald"
        />
        <MetricCard
          label={c.pipelineValue}
          value={formatCurrency(data.summary.pipelineValue, data.context.organization.currency)}
          delta={c.activeOpp}
          icon={Plus}
          tone="amber"
        />
        <MetricCard
          label={c.followups}
          value={String(data.summary.followUpsDue + data.summary.overdueFollowUps)}
          delta={`${data.summary.overdueFollowUps} ${c.overdue}`}
          icon={LayoutGrid}
          tone="violet"
        />
      </div>

      <SectionCard title={c.workspace} description={c.workspaceDesc}>
        <form
          method="get"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 items-end"
        >
          <input type="hidden" name="view" value={data.filters.view} />
          <input type="hidden" name="page" value="1" />

          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{c.search}</span>
            <Input name="query" defaultValue={data.filters.query} placeholder="İsim, şirket, e-posta..." />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{c.status}</span>
            <Select name="status" defaultValue={data.filters.status}>
              <option value="">{c.allStatuses}</option>
              {LEAD_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {leadStatusLabel(locale, status.value)}
                </option>
              ))}
            </Select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{c.source}</span>
            <Select name="source" defaultValue={data.filters.source}>
              <option value="">{c.allSources}</option>
              {Array.from(new Set(data.allLeads.map((lead) => lead.source))).map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </Select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{c.assigned}</span>
            <Select name="assignedTo" defaultValue={data.filters.assignedTo}>
              <option value="">{c.allMembers}</option>
              {data.context.members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.full_name}
                </option>
              ))}
            </Select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{c.sort}</span>
            <Select name="sort" defaultValue={data.filters.sort}>
              <option value="newest">{c.newest}</option>
              <option value="oldest">{c.oldest}</option>
              <option value="value">{c.value}</option>
              <option value="followup">{c.followup}</option>
            </Select>
          </label>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="inline-flex h-9 flex-1 items-center justify-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors"
            >
              {c.apply}
            </button>
            {hasFilters ? (
              <Link
                href="/leads"
                className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                {c.reset}
              </Link>
            ) : null}
          </div>
        </form>
      </SectionCard>

      <LeadDuplicatesCard
        groups={data.duplicateGroups}
        redirectTo={currentHref}
        role={data.context.role}
        locale={locale}
      />

      {data.leads.length ? (
        data.filters.view === "table" ? (
          <LeadTableView
            leads={data.leads}
            redirectTo={currentHref}
            role={data.context.role}
            locale={locale}
            page={data.filters.page}
            totalPages={data.totalPages}
            hasPrevious={data.currentPage > 1}
            hasNext={data.currentPage < data.totalPages}
            filters={data.filters}
          />
        ) : (
          <LeadPipelineView
            leads={data.allLeads}
            redirectTo={currentHref}
            role={data.context.role}
            locale={locale}
          />
        )
      ) : (
        <EmptyState
          title={c.noMatches}
          description={c.noMatchesDesc}
          actionHref={createLeadHref}
          actionLabel={c.newLead}
        />
      )}
    </div>
  );
}

function LeadTableView({
  leads,
  redirectTo,
  role,
  locale,
  page,
  totalPages,
  hasPrevious,
  hasNext,
  filters,
}: {
  leads: LeadRows;
  redirectTo: string;
  role: LeadRole;
  locale: Locale;
  page: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
  filters: LeadFilterState;
}) {
  const c = copy[locale];

  return (
    <SectionCard title={c.allLeads} description={c.allLeadsDesc}>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border bg-muted/50 font-semibold text-muted-foreground">
            <tr>
              <th className="px-3.5 py-2.5">{c.lead}</th>
              <th className="px-3 py-2.5">{c.status}</th>
              <th className="px-3 py-2.5">{c.assignedTo}</th>
              <th className="px-3 py-2.5">{c.value}</th>
              <th className="px-3 py-2.5">{c.followup}</th>
              <th className="px-3.5 py-2.5 text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {leads.map((lead) => {
              const followState = formatLeadFollowUpState(lead.next_follow_up_at);
              const badge = getLeadRecordBadge(lead.recordMode, locale);
              const canEdit = canMutateLeadRecord(lead.recordMode, role);
              const restriction = getLeadRecordRestrictionMessage(lead.recordMode, role, locale);

              return (
                <tr key={lead.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-3.5 py-2.5">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/leads/${lead.id}`}
                          className="font-semibold text-foreground hover:underline"
                        >
                          {lead.full_name}
                        </Link>
                        <StatusBadge tone={badge.tone} title={badge.title}>
                          {lead.recordMode === "live" ? c.liveRecord : c.demoRecord}
                        </StatusBadge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {lead.company || c.noCompany} · {lead.city || c.noCity}
                        {lead.email ? ` · ${lead.email}` : ""}
                      </p>
                    </div>
                  </td>

                  <td className="px-3 py-2.5">
                    <StatusBadge tone={getLeadStatusTone(lead.status)}>
                      {leadStatusLabel(locale, lead.status)}
                    </StatusBadge>
                  </td>

                  <td className="px-3 py-2.5 font-medium text-foreground">
                    {lead.assigned_to_label || c.notSet}
                  </td>

                  <td className="px-3 py-2.5 font-semibold text-foreground">
                    {formatCurrency(lead.estimated_value, lead.currency)}
                  </td>

                  <td className="px-3 py-2.5">
                    <div className="space-y-0.5">
                      <StatusBadge tone={followState.tone}>
                        {locale === "tr" ? localizeFollowUp(followState.label) : followState.label}
                      </StatusBadge>
                      {lead.next_follow_up_at ? (
                        <p className="text-[10px] text-muted-foreground">
                          {formatDateTime(lead.next_follow_up_at)}
                        </p>
                      ) : null}
                    </div>
                  </td>

                  <td className="px-3.5 py-2.5 text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <Link
                        href={`/leads/${lead.id}`}
                        className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                      >
                        {c.view}
                      </Link>
                      {canEdit ? (
                        <Link
                          href={`/leads/${lead.id}/edit?redirect_to=${encodeURIComponent(redirectTo)}`}
                          className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                        >
                          {c.edit}
                        </Link>
                      ) : (
                        <span
                          title={restriction}
                          className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2 text-xs font-medium text-muted-foreground opacity-50 cursor-not-allowed"
                        >
                          {c.edit}
                        </span>
                      )}
                      <LeadDeleteDialog
                        leadId={lead.id}
                        leadName={lead.full_name}
                        redirectTo={redirectTo}
                        recordMode={lead.recordMode}
                        role={role}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {c.page} {page} {c.of} {totalPages}
        </span>
        <div className="flex items-center gap-1.5">
          <Nav href={buildLeadHref(filters, { page: page - 1 })} disabled={!hasPrevious}>
            {c.previous}
          </Nav>
          <Nav href={buildLeadHref(filters, { page: page + 1 })} disabled={!hasNext}>
            {c.next}
          </Nav>
        </div>
      </div>
    </SectionCard>
  );
}

function LeadPipelineView({
  leads,
  redirectTo,
  role,
  locale,
}: {
  leads: LeadRows;
  redirectTo: string;
  role: LeadRole;
  locale: Locale;
}) {
  const c = copy[locale];
  const grouped = Object.fromEntries(
    LEAD_STATUSES.map((status) => [status.value, leads.filter((lead) => lead.status === status.value)]),
  );

  return (
    <SectionCard title={c.pipeline} description={c.pipelineDesc}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7 overflow-x-auto">
        {LEAD_STATUSES.map((status) => (
          <div
            key={status.value}
            className="rounded-lg border border-border bg-muted/30 p-2.5 flex flex-col min-w-[220px]"
          >
            <div className="flex items-center justify-between border-b border-border pb-2 mb-2">
              <span className="text-xs font-bold text-foreground">
                {leadStatusLabel(locale, status.value)}
              </span>
              <StatusBadge tone={status.tone}>{grouped[status.value].length}</StatusBadge>
            </div>

            <div className="space-y-2 flex-1">
              {grouped[status.value].length ? (
                grouped[status.value].map((lead) => (
                  <div
                    key={lead.id}
                    className="rounded-md border border-border bg-card p-2.5 shadow-xs space-y-1.5"
                  >
                    <Link
                      href={`/leads/${lead.id}`}
                      className="block text-xs font-semibold text-foreground hover:underline truncate"
                    >
                      {lead.full_name}
                    </Link>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {lead.company || c.noCompany}
                    </p>
                    <p className="text-xs font-bold text-foreground">
                      {formatCurrency(lead.estimated_value, lead.currency)}
                    </p>
                    <div className="pt-1 border-t border-border">
                      <LeadStatusMenu
                        leadId={lead.id}
                        currentStatus={lead.status}
                        redirectTo={redirectTo}
                        recordMode={lead.recordMode}
                        role={role}
                        label={c.saveStage}
                        compact
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">
                  {c.noStage}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function localizeFollowUp(label: string) {
  const value = label.toLowerCase();
  if (value.includes("overdue")) return "Gecikmiş";
  if (value.includes("due")) return "Takip Zamanı";
  if (value.includes("scheduled")) return "Planlandı";
  if (value.includes("not set") || value.includes("no follow")) return "Tarih Yok";
  return label;
}

function Nav({
  href,
  children,
  disabled,
}: {
  href: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-disabled={disabled}
      className={`inline-flex h-7 items-center rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted transition-colors ${
        disabled ? "pointer-events-none opacity-40" : ""
      }`}
    >
      {children}
    </Link>
  );
}
