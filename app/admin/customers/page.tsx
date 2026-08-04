import { DashboardShell } from "@/components/layout/dashboard-shell";
import { adminNavigation } from "@/data/navigation";
import { AdminCustomers } from "@/components/dashboard/admin-customers";

export default function Page() {
  return <DashboardShell title="Admin Console" items={adminNavigation}>
    <h1 className="text-3xl font-bold">Customer management</h1>
    <p className="mt-2 text-slate-600">Review customer accounts, memberships, rewards, and booking activity.</p>
    <AdminCustomers />
  </DashboardShell>;
}
