import { DashboardShell } from "@/components/layout/dashboard-shell";
import { partnerNavigation } from "@/data/navigation";
import { PartnerReservations } from "@/components/bookings/partner-reservations";
export default function Page(){return <DashboardShell title="Partner Center" items={partnerNavigation}><h1 className="text-3xl font-bold">Reservations</h1><p className="mt-2 text-slate-600">Review private traveler requests for your approved properties.</p><PartnerReservations /></DashboardShell>}
