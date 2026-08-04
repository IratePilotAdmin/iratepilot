import { DashboardShell } from "@/components/layout/dashboard-shell";
import { partnerNavigation } from "@/data/navigation";
import { PartnerAnalytics } from "@/components/dashboard/partner-analytics";

export default function Page() {
  return <DashboardShell title="Partner Center" items={partnerNavigation}>
    <h1 className="text-3xl font-bold">Portfolio analytics</h1>
    <p className="mt-2 text-slate-600">Track booking demand, reservation outcomes, and property-level financial performance.</p>
    <PartnerAnalytics />
  </DashboardShell>;
}
