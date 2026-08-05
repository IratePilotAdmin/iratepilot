import { DashboardShell } from "@/components/layout/dashboard-shell";
import { partnerNavigation } from "@/data/navigation";
import { PartnerOverview } from "@/components/dashboard/partner-overview";

export default function PartnerDashboard() {
  return <DashboardShell title="Partner Center" items={partnerNavigation}><PartnerOverview /></DashboardShell>;
}
