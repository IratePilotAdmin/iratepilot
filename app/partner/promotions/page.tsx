import { DashboardShell } from "@/components/layout/dashboard-shell";
import { partnerNavigation } from "@/data/navigation";
import { PartnerPromotions } from "@/components/dashboard/partner-promotions";
export default function Page(){return <DashboardShell title="Partner Center" items={partnerNavigation}><h1 className="text-3xl font-bold">Rate promotions</h1><p className="mt-2 text-slate-600">Turn lower future inventory rates into verified traveler offers.</p><PartnerPromotions /></DashboardShell>}
