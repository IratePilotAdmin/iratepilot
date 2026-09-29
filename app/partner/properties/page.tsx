import { DashboardShell } from "@/components/layout/dashboard-shell";
import { partnerNavigation } from "@/data/navigation";
import { PartnerProperties } from "@/components/dashboard/partner-properties";
export default function Page(){return <DashboardShell title="Partner Center" items={partnerNavigation}><h1 className="text-3xl font-bold">Properties</h1><p className="mt-2 text-slate-600">Create inactive hotel drafts after verified intake, then track readiness for administrator review.</p><PartnerProperties /></DashboardShell>}
