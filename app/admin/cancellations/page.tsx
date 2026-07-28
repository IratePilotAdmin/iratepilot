import { AdminCancellations } from "@/components/bookings/admin-cancellations";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { adminNavigation } from "@/data/navigation";

export default function Page() {
  return <DashboardShell title="Admin Console" items={adminNavigation}>
    <h1 className="text-3xl font-bold">Cancellations and refunds</h1>
    <p className="mt-2 text-slate-600">Review traveler requests and issue verified Stripe test refunds.</p>
    <AdminCancellations />
  </DashboardShell>;
}
