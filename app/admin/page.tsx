import { DashboardShell } from "@/components/layout/dashboard-shell";
import { adminNavigation } from "@/data/navigation";
import { adminStats } from "@/data/stats";
import { StatCard } from "@/components/dashboard/stat-card";
import { RecentBookings } from "@/components/dashboard/recent-bookings";

export default function AdminPage() {
  return <DashboardShell title="Admin Console" items={adminNavigation}><h1 className="text-3xl font-bold">Marketplace overview</h1><div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">{adminStats.map(s=><StatCard key={s.label} {...s}/>)}</div><div className="mt-8"><RecentBookings/></div></DashboardShell>;
}
