import { PartnerPmsConnections } from "@/components/dashboard/partner-pms-connections";
import { PartnerOtaDistribution } from "@/components/dashboard/partner-ota-distribution";
import { PartnerSynxisOnboarding } from "@/components/dashboard/partner-synxis-onboarding";
import { PartnerTeamInvitations } from "@/components/dashboard/partner-team-invitations";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { partnerNavigation } from "@/data/navigation";

export default function Page() {
  return <DashboardShell title="Partner Center" items={partnerNavigation}>
    <h1 className="text-3xl font-bold">Hotel system connections</h1>
    <p className="mt-2 text-slate-600">Map each hotel to its PMS and separately request CRS distribution onboarding.</p>
    <PartnerOtaDistribution />
    <section className="card mt-6 flex flex-wrap items-center justify-between gap-4 p-5">
      <div>
        <h2 className="font-semibold">PMS operating manual</h2>
        <p className="mt-1 text-sm text-slate-600">Download the pilot guide for property setup, reservations, room status, reports, and troubleshooting.</p>
      </div>
      <a className="btn-secondary" href="/api/partner/manual">Download pilot manual</a>
    </section>
    <PartnerPmsConnections />
    <PartnerSynxisOnboarding />
    <PartnerTeamInvitations />
  </DashboardShell>;
}
