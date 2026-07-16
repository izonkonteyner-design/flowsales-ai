import { LeadDashboard } from "@/components/dashboard/lead-dashboard";
import { getLeadDashboardData } from "@/server/services/leads";

export default async function DashboardPage() {
  const data = await getLeadDashboardData();

  return (
    <LeadDashboard
      metrics={data.metrics}
      currency={data.context.organization.currency ?? "TRY"}
    />
  );
}
