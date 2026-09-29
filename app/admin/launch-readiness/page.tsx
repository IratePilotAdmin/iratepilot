import { AdminHotelLaunchReadiness } from "@/components/dashboard/admin-hotel-launch-readiness";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { adminNavigation } from "@/data/navigation";

export default function AdminLaunchReadinessPage() {
  return (
    <DashboardShell title="Admin Console" items={adminNavigation}>
      <h1 className="text-3xl font-bold">Hotel launch readiness</h1>
      <p className="mt-2 max-w-3xl text-slate-600">
        See the exact evidence-based countdown for accepting a real hotel and opening live consumer bookings.
      </p>
      <AdminHotelLaunchReadiness />
    </DashboardShell>
  );
}
