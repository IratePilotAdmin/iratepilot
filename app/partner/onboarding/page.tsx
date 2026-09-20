import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PartnerOnboarding } from "@/components/partner/partner-onboarding";
import { partnerNavigation } from "@/data/navigation";

export default function Page() {
  return (
    <DashboardShell title="Partner Center" items={partnerNavigation}>
      <h1 className="text-3xl font-bold">Property onboarding</h1>
      <p className="mt-2 text-slate-600">Complete private-pilot preparation first, then track publication and payout activation as separate approval gates.</p>
      <PartnerOnboarding />
    </DashboardShell>
  );
}
