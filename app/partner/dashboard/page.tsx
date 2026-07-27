import { DashboardShell } from "@/components/layout/dashboard-shell";
import { partnerNavigation } from "@/data/navigation";
import { partnerStats } from "@/data/stats";
import { StatCard } from "@/components/dashboard/stat-card";
import { RecentBookings } from "@/components/dashboard/recent-bookings";
import { RevenueChart } from "@/components/dashboard/revenue-chart";

export default function PartnerDashboard() {
  return <DashboardShell title="Partner Center" items={partnerNavigation}><h1 className="text-3xl font-bold">Good evening, Hiren</h1><p className="mt-2 text-slate-500">Here is how your properties are performing.</p><div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">{partnerStats.map(s=><StatCard key={s.label} {...s}/>)}</div><div className="mt-8 grid gap-6 xl:grid-cols-2"><RevenueChart/><RecentBookings/></div></DashboardShell>;
}
