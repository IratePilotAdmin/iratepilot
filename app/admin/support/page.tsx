import { DashboardShell } from "@/components/layout/dashboard-shell";
import { adminNavigation } from "@/data/navigation";
import { AdminSupport } from "@/components/dashboard/admin-support";

export default function Page() {
  return <DashboardShell title="Admin Console" items={adminNavigation}>
    <h1 className="text-3xl font-bold">Support cases</h1>
    <p className="mt-2 text-slate-600">Review customer and partner messages from first contact through resolution.</p>
    <AdminSupport />
  </DashboardShell>;
}
