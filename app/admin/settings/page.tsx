import { DashboardShell } from "@/components/layout/dashboard-shell";
import { adminNavigation } from "@/data/navigation";
import { AdminSettings } from "@/components/dashboard/admin-settings";

export default function Page() {
  return <DashboardShell title="Admin Console" items={adminNavigation}>
    <h1 className="text-3xl font-bold">Platform readiness</h1>
    <p className="mt-2 text-slate-600">Review server configuration and feature availability without exposing credential values.</p>
    <AdminSettings />
  </DashboardShell>;
}
