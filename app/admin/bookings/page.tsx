import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AdminBookings } from "@/components/bookings/admin-bookings";
import { adminNavigation } from "@/data/navigation";
export default function Page(){return <DashboardShell title="Admin Console" items={adminNavigation}><h1 className="text-3xl font-bold">Booking operations</h1><p className="mt-2 text-slate-600">Review private requests, status, and inventory decisions.</p><AdminBookings /></DashboardShell>}
