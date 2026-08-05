import { DashboardShell } from "@/components/layout/dashboard-shell";
import { adminNavigation } from "@/data/navigation";
import { AdminAudit } from "@/components/dashboard/admin-audit";

export default function Page() {
  return <DashboardShell title="Admin Console" items={adminNavigation}>
    <h1 className="text-3xl font-bold">Audit history</h1>
    <p className="mt-2 text-slate-600">Review recorded booking transitions and Revenue AI actions in one timeline.</p>
    <AdminAudit />
  </DashboardShell>;
}
