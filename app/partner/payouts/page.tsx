import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PartnerFinance } from "@/components/dashboard/partner-finance";
import { partnerNavigation } from "@/data/navigation";
export default function Page(){return <DashboardShell title="Partner Center" items={partnerNavigation}><h1 className="text-3xl font-bold">Finance and payouts</h1><p className="mt-2 text-slate-600">Review booking value, iRatePilot commission, partner net, and payout drafts.</p><PartnerFinance /></DashboardShell>}
