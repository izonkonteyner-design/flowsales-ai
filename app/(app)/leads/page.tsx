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
import { LeadStatusMenu } from "@/components/leads/lead-status-menu";
import { LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { getLeadPageData } from "@/server/services/leads";
import { formatLeadFollowUpState, canMutateLeadRecord, getLeadRecordBadge, getLeadRecordRestrictionMessage, getLeadStatusLabel, getLeadStatusTone, type LeadFilterState } from "@/server/services/lead-domain";
import type { WorkspaceRole } from "@/lib/workspace-roles";

type LeadsPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
type Locale = "tr" | "en";
type LeadRole = WorkspaceRole;
type LeadRows = Awaited<ReturnType<typeof getLeadPageData>>["leads"];

const copy = {
  tr: {
    title: "Potansiyel Müşteriler", description: "Fırsatları yapılandırılmış satış hattında arayın, nitelendirin ve ilerletin.", pipelineView: "Satış hattı", tableView: "Liste görünümü", newLead: "Yeni potansiyel müşteri",
    total: "Toplam", orgScoped: "Çalışma alanı kapsamı", new: "Yeni", ready: "Nitelendirmeye hazır", pipelineValue: "Satış hattı değeri", activeOpp: "Aktif fırsatlar", followups: "Takip zamanı gelen", overdue: "gecikmiş",
    workspace: "Potansiyel müşteri çalışma alanı", workspaceDesc: "Satış hattını düzenli tutmak için arama, filtre ve sıralamayı kullanın.", search: "Ara", status: "Durum", allStatuses: "Tüm durumlar", source: "Kaynak", allSources: "Tüm kaynaklar", assigned: "Sorumlu", allMembers: "Tüm ekip", sort: "Sırala", newest: "En yeni", oldest: "En eski", value: "Değer", followup: "Takip", apply: "Uygula", reset: "Sıfırla",
    allLeads: "Tüm potansiyel müşteriler", allLeadsDesc: "Arama, sıralama ve durum bağlamı bulunan responsive liste.", lead: "Potansiyel müşteri", company: "Şirket", noCompany: "Şirket yok", noCity: "Şehir yok", noEmail: "E-posta yok", assignedTo: "Sorumlu", notSet: "Belirtilmedi", view: "Görüntüle", edit: "Düzenle", pipeline: "Satış hattı", pipelineDesc: "Fırsatların aşamalarını panodan yönetin.", noStage: "Bu aşamada kayıt yok.", saveStage: "Aşamayı kaydet", noFollowup: "Takip tarihi yok", noMatches: "Bu filtrelerle eşleşen kayıt yok", noMatchesDesc: "Farklı bir arama deneyin, filtreleri temizleyin veya yeni kayıt oluşturun.", page: "Sayfa", of: "/", previous: "Önceki", next: "Sonraki", liveRecord: "Canlı kayıt", demoRecord: "Demo kayıt",
  },
  en: {
    title: "Leads", description: "Search, qualify, and advance opportunities through a structured pipeline.", pipelineView: "Pipeline view", tableView: "Table view", newLead: "New lead",
    total: "Total leads", orgScoped: "Organization scoped", new: "New leads", ready: "Ready for qualification", pipelineValue: "Pipeline value", activeOpp: "Active opportunities", followups: "Follow-ups due", overdue: "overdue",
    workspace: "Lead workspace", workspaceDesc: "Use search, filters, and sort to keep the pipeline clean.", search: "Search", status: "Status", allStatuses: "All statuses", source: "Source", allSources: "All sources", assigned: "Assigned to", allMembers: "All members", sort: "Sort", newest: "Newest", oldest: "Oldest", value: "Value", followup: "Follow-up", apply: "Apply", reset: "Reset",
    allLeads: "All leads", allLeadsDesc: "A responsive list with search, sort, and status context.", lead: "Lead", company: "Company", noCompany: "No company", noCity: "No city", noEmail: "No email", assignedTo: "Assigned to", notSet: "Not set", view: "View", edit: "Edit", pipeline: "Pipeline", pipelineDesc: "Move leads between stages without leaving the board.", noStage: "No leads in this stage.", saveStage: "Save stage", noFollowup: "No follow-up", noMatches: "No leads match these filters", noMatchesDesc: "Try a different search, clear filters, or create a new lead.", page: "Page", of: "of", previous: "Previous", next: "Next", liveRecord: "Live record", demoRecord: "Demo record",
  },
} as const;

const trLeadStatus: Record<string, string> = { new: "Yeni", contacted: "İletişim kuruldu", qualified: "Nitelikli", quote_sent: "Teklif gönderildi", negotiation: "Görüşme", won: "Kazanıldı", lost: "Kaybedildi" };

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
  const toastTone = rawSearchParams.tone === "danger" || rawSearchParams.tone === "warning" || rawSearchParams.tone === "info" ? rawSearchParams.tone : "success";
  const currentHref = buildLeadHref(data.filters);
  const createLeadHref = `/leads/new?redirect_to=${encodeURIComponent(currentHref)}`;
  const toggleViewHref = buildLeadHref(data.filters, { view: data.filters.view === "table" ? "pipeline" : "table", page: 1 });
  const hasFilters = Boolean(data.filters.query || data.filters.status || data.filters.source || data.filters.assignedTo) || data.filters.sort !== "newest" || data.filters.pageSize !== 8;

  return (
    <div className="space-y-6">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}
      <PageHeader eyebrow="CRM" title={c.title} description={c.description} actions={<><Link href={toggleViewHref} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">{data.filters.view === "table" ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}{data.filters.view === "table" ? c.pipelineView : c.tableView}</Link><Link href={createLeadHref} className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white dark:bg-white dark:text-slate-950"><Plus className="h-4 w-4" />{c.newLead}</Link></>} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><MetricCard label={c.total} value={String(data.summary.totalLeads)} delta={c.orgScoped} icon={Filter} tone="blue" /><MetricCard label={c.new} value={String(data.summary.newLeads)} delta={c.ready} icon={Search} tone="emerald" /><MetricCard label={c.pipelineValue} value={formatCurrency(data.summary.pipelineValue, data.context.organization.currency)} delta={c.activeOpp} icon={Plus} tone="amber" /><MetricCard label={c.followups} value={String(data.summary.followUpsDue + data.summary.overdueFollowUps)} delta={`${data.summary.overdueFollowUps} ${c.overdue}`} icon={LayoutGrid} tone="violet" /></div>

      <SectionCard title={c.workspace} description={c.workspaceDesc}>
        <form method="get" className="grid gap-3 xl:grid-cols-[1.8fr_0.8fr_0.8fr_0.8fr_0.8fr_auto]"><input type="hidden" name="view" value={data.filters.view} /><input type="hidden" name="page" value="1" />
          <label className="space-y-2"><span className="text-sm font-medium text-slate-700 dark:text-slate-300">{c.search}</span><Input name="query" defaultValue={data.filters.query} /></label>
          <label className="space-y-2"><span className="text-sm font-medium text-slate-700 dark:text-slate-300">{c.status}</span><Select name="status" defaultValue={data.filters.status}><option value="">{c.allStatuses}</option>{LEAD_STATUSES.map((status) => <option key={status.value} value={status.value}>{leadStatusLabel(locale, status.value)}</option>)}</Select></label>
          <label className="space-y-2"><span className="text-sm font-medium text-slate-700 dark:text-slate-300">{c.source}</span><Select name="source" defaultValue={data.filters.source}><option value="">{c.allSources}</option>{Array.from(new Set(data.allLeads.map((lead) => lead.source))).map((source) => <option key={source} value={source}>{source}</option>)}</Select></label>
          <label className="space-y-2"><span className="text-sm font-medium text-slate-700 dark:text-slate-300">{c.assigned}</span><Select name="assignedTo" defaultValue={data.filters.assignedTo}><option value="">{c.allMembers}</option>{data.context.members.map((member) => <option key={member.user_id} value={member.user_id}>{member.full_name}</option>)}</Select></label>
          <label className="space-y-2"><span className="text-sm font-medium text-slate-700 dark:text-slate-300">{c.sort}</span><Select name="sort" defaultValue={data.filters.sort}><option value="newest">{c.newest}</option><option value="oldest">{c.oldest}</option><option value="value">{c.value}</option><option value="follow_up">{c.followup}</option></Select></label>
          <div className="flex items-end gap-3"><button type="submit" className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white dark:bg-white dark:text-slate-950">{c.apply}</button>{hasFilters ? <Link href="/leads" className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">{c.reset}</Link> : null}</div>
        </form>
      </SectionCard>

      {data.filters.view === "pipeline" ? <LeadPipelineView leads={data.leads} redirectTo={currentHref} role={data.context.role} locale={locale} /> : <LeadTableView leads={data.leads} redirectTo={currentHref} role={data.context.role} locale={locale} />}

      {data.totalPages > 1 ? <SectionCard><div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-500">{c.page} {data.currentPage} {c.of} {data.totalPages} · {data.total}</p><div className="flex gap-2"><Nav href={buildLeadHref(data.filters, { page: Math.max(1, data.currentPage - 1) })} disabled={data.currentPage === 1}>{c.previous}</Nav><Nav href={buildLeadHref(data.filters, { page: Math.min(data.totalPages, data.currentPage + 1) })} disabled={data.currentPage === data.totalPages}>{c.next}</Nav></div></div></SectionCard> : null}
      {!data.total ? <EmptyState title={c.noMatches} description={c.noMatchesDesc} actionHref={createLeadHref} actionLabel={c.newLead} /> : null}
    </div>
  );
}

function LeadTableView({ leads, redirectTo, role, locale }: { leads: LeadRows; redirectTo: string; role: LeadRole; locale: Locale }) {
  const c = copy[locale];
  return <SectionCard title={c.allLeads} description={c.allLeadsDesc}><div className="space-y-3">{leads.map((lead) => {
    const badge = getLeadRecordBadge(lead.recordMode); const canEdit = canMutateLeadRecord(lead.recordMode, role); const restriction = getLeadRecordRestrictionMessage(lead.recordMode, role); const followState = formatLeadFollowUpState(lead.next_follow_up_at);
    return <article key={lead.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Link href={`/leads/${lead.id}`} className="font-semibold text-slate-950 dark:text-white">{lead.full_name}</Link><StatusBadge tone={getLeadStatusTone(lead.status)}>{leadStatusLabel(locale, lead.status)}</StatusBadge><StatusBadge tone={badge.tone} title={badge.title}>{lead.recordMode === "live" ? c.liveRecord : c.demoRecord}</StatusBadge></div><p className="mt-2 text-sm text-slate-500">{lead.company || c.noCompany} · {lead.city || c.noCity} · {lead.email || c.noEmail}</p><p className="mt-1 text-xs text-slate-500">{c.assignedTo}: {lead.assigned_to_label}</p></div><div className="grid gap-3 sm:grid-cols-2 xl:min-w-[360px]"><Mini label={c.value} value={formatCurrency(lead.estimated_value, lead.currency)} /><Mini label={c.followup} value={lead.next_follow_up_at ? formatDateTime(lead.next_follow_up_at) : c.notSet} /></div></div><div className="mt-4 flex flex-wrap items-center gap-2"><StatusBadge tone={followState.tone}>{locale === "tr" ? localizeFollowUp(followState.label) : followState.label}</StatusBadge><Link href={`/leads/${lead.id}`} className="inline-flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">{c.view}</Link>{canEdit ? <Link href={`/leads/${lead.id}/edit?redirect_to=${encodeURIComponent(redirectTo)}`} className="inline-flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">{c.edit}</Link> : <span title={restriction} className="inline-flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">{c.edit}</span>}<LeadDeleteDialog leadId={lead.id} leadName={lead.full_name} redirectTo={redirectTo} recordMode={lead.recordMode} role={role} /></div></article>;
  })}</div></SectionCard>;
}

function LeadPipelineView({ leads, redirectTo, role, locale }: { leads: LeadRows; redirectTo: string; role: LeadRole; locale: Locale }) {
  const c = copy[locale]; const grouped = Object.fromEntries(LEAD_STATUSES.map((status) => [status.value, leads.filter((lead) => lead.status === status.value)]));
  return <SectionCard title={c.pipeline} description={c.pipelineDesc}><div className="grid gap-4 xl:grid-cols-3 2xl:grid-cols-4">{LEAD_STATUSES.map((status) => <div key={status.value} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-950 dark:text-white">{leadStatusLabel(locale, status.value)}</p><StatusBadge tone={status.tone}>{grouped[status.value].length}</StatusBadge></div><div className="mt-4 space-y-3">{grouped[status.value].length ? grouped[status.value].map((lead) => <article key={lead.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-950/70"><Link href={`/leads/${lead.id}`} className="font-medium text-slate-950 dark:text-white">{lead.full_name}</Link><p className="mt-1 text-sm text-slate-500">{lead.company || c.noCompany}</p><p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{formatCurrency(lead.estimated_value, lead.currency)}</p><div className="mt-4"><LeadStatusMenu leadId={lead.id} currentStatus={lead.status} redirectTo={redirectTo} recordMode={lead.recordMode} role={role} label={c.saveStage} compact /></div></article>) : <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-white/10">{c.noStage}</div>}</div></div>)}</div></SectionCard>;
}

function localizeFollowUp(label: string) { const value = label.toLowerCase(); if (value.includes("overdue")) return "Gecikmiş"; if (value.includes("due")) return "Takip zamanı geldi"; if (value.includes("scheduled")) return "Planlandı"; if (value.includes("not set") || value.includes("no follow")) return "Takip tarihi yok"; return label; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-slate-950/40"><p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p><p className="mt-1 text-sm font-medium text-slate-950 dark:text-white">{value}</p></div>; }
function Nav({ href, children, disabled }: { href: string; children: React.ReactNode; disabled?: boolean }) { return <Link href={href} aria-disabled={disabled} className={`inline-flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 ${disabled ? "pointer-events-none opacity-50" : ""}`}>{children}</Link>; }
