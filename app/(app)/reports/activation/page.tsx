import { redirect } from "next/navigation";
import { AlertTriangle, Bot, Clock, UploadCloud, UserPlus } from "lucide-react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { MetricCard } from "@/components/shared/metric-card";
import { formatDateTime } from "@/lib/utils";
import { getActivationAnalytics } from "@/server/services/activation-analytics";
import {
  FIRST_AI_VALUE_ABANDONMENT_HOURS,
  FIRST_LEAD_ABANDONMENT_HOURS,
  formatActivationDuration,
  type ActivationMilestoneMetric,
} from "@/server/services/activation-analytics-domain";

export const metadata = { title: "Activation Report | FlowSales AI" };

export default async function ActivationReportPage() {
  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");

  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: membership } = await client
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", auth.user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/onboarding");

  const { data: allowed, error: permissionError } = await client.rpc("has_org_permission", {
    p_organization_id: membership.organization_id,
    p_permission: "manage_workspace",
  });
  if (permissionError || allowed !== true) redirect("/dashboard");

  const report = await getActivationAnalytics(membership.organization_id);

  const abandonmentNotice = report.abandonment.isAbandoned ? (
    <div className="flex items-start gap-3 rounded-md border border-amber-200/80 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <span className="font-semibold">Onboarding appears stalled.</span>{" "}
        {report.abandonment.abandonedReasons
          .map((reason) =>
            reason === "no_lead_created_within_24h"
              ? `No lead created within ${FIRST_LEAD_ABANDONMENT_HOURS}h of workspace creation`
              : `No AI run completed within ${FIRST_AI_VALUE_ABANDONMENT_HOURS}h of workspace creation`,
          )
          .join("; ")}
        .
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Owner and admin only"
        title="Activation & Onboarding Report"
        description={`Time-to-first-value and onboarding abandonment for this workspace, measured from creation on ${formatDateTime(report.workspaceCreatedAt)}.`}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MilestoneCard
          label="Time to first lead"
          icon={UserPlus}
          metric={report.metrics.firstLead}
          abandoned={report.abandonment.firstLeadStatus === "abandoned"}
        />
        <MilestoneCard
          label="Time to first completed import"
          icon={UploadCloud}
          metric={report.metrics.firstImport}
          abandoned={false}
        />
        <MilestoneCard
          label="Time to first AI value"
          icon={Bot}
          metric={report.metrics.firstAiRun}
          abandoned={report.abandonment.firstAiRunStatus === "abandoned"}
        />
      </div>

      <SectionCard
        title="Onboarding abandonment"
        description={`A workspace is flagged as stalled once it exceeds a milestone's expected window with no activity: no lead within ${FIRST_LEAD_ABANDONMENT_HOURS}h, or no completed AI run within ${FIRST_AI_VALUE_ABANDONMENT_HOURS}h.`}
      >
        <div className="space-y-3">
          {abandonmentNotice}
          <div className="grid gap-2 sm:grid-cols-2">
            <StatusRow
              label="First lead"
              status={report.abandonment.firstLeadStatus}
              windowLabel={`${FIRST_LEAD_ABANDONMENT_HOURS}h window`}
            />
            <StatusRow
              label="First AI value"
              status={report.abandonment.firstAiRunStatus}
              windowLabel={`${FIRST_AI_VALUE_ABANDONMENT_HOURS}h window`}
            />
          </div>
          <Row
            label="Onboarding checklist completed at"
            value={report.onboardingCompletedAt ? formatDateTime(report.onboardingCompletedAt) : "Not completed yet"}
          />
          <Row
            label="Hours since workspace creation"
            value={report.abandonment.hoursSinceWorkspaceCreated.toFixed(1)}
          />
        </div>
      </SectionCard>
    </div>
  );
}

function MilestoneCard({
  label,
  icon,
  metric,
  abandoned,
}: {
  label: string;
  icon: typeof Clock;
  metric: ActivationMilestoneMetric;
  abandoned: boolean;
}) {
  const value = metric.reached ? formatActivationDuration(metric.hoursToReach) : abandoned ? "Stalled" : "Pending";
  return (
    <MetricCard
      label={label}
      value={value}
      delta={metric.reached ? `Reached ${formatDateTime(metric.reachedAt as string)}` : abandoned ? "Past expected window" : "Within expected window"}
      icon={icon}
      tone={metric.reached ? "emerald" : abandoned ? "amber" : "blue"}
    />
  );
}

function StatusRow({
  label,
  status,
  windowLabel,
}: {
  label: string;
  status: "completed" | "pending" | "abandoned";
  windowLabel: string;
}) {
  const styles = {
    completed: "border-emerald-200/80 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300",
    pending: "border-border bg-card text-foreground",
    abandoned: "border-amber-200/80 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300",
  } as const;
  const labels = { completed: "Reached", pending: "In progress", abandoned: "Stalled" } as const;

  return (
    <div className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs shadow-xs ${styles[status]}`}>
      <span className="font-medium">
        {label} · <span className="opacity-70">{windowLabel}</span>
      </span>
      <span className="shrink-0 font-bold">{labels[status]}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-xs shadow-xs">
      <span className="text-muted-foreground font-medium truncate">{label}</span>
      <span className="text-right font-bold text-foreground shrink-0">{value}</span>
    </div>
  );
}
