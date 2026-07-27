import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PartnerSubscriptionCenter } from "@/components/partner/partner-subscription-center";
import { partnerNavigation } from "@/data/navigation";
export default function Page(){return <DashboardShell title="Partner Center" items={partnerNavigation}><h1 className="text-3xl font-bold">Software subscription</h1><p className="mt-2 text-slate-600">Manage iRatePilot Management separately from marketplace booking commissions.</p><PartnerSubscriptionCenter /></DashboardShell>}
