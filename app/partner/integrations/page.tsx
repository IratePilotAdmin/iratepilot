import { PartnerPmsConnections } from "@/components/dashboard/partner-pms-connections";
import { PartnerSynxisOnboarding } from "@/components/dashboard/partner-synxis-onboarding";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { partnerNavigation } from "@/data/navigation";

export default function Page() {
  return <DashboardShell title="Partner Center" items={partnerNavigation}>
    <h1 className="text-3xl font-bold">Hotel system connections</h1>
    <p className="mt-2 text-slate-600">Map each hotel to its PMS and separately request CRS distribution onboarding.</p>
    <PartnerPmsConnections />
    <PartnerSynxisOnboarding />
  </DashboardShell>;
}
