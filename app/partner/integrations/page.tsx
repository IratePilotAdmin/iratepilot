import { PartnerPmsConnections } from "@/components/dashboard/partner-pms-connections";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { partnerNavigation } from "@/data/navigation";

export default function Page() {
  return <DashboardShell title="Partner Center" items={partnerNavigation}>
    <h1 className="text-3xl font-bold">PMS connections</h1>
    <p className="mt-2 text-slate-600">Map each hotel to its property-management system and track activation.</p>
    <PartnerPmsConnections />
  </DashboardShell>;
}
