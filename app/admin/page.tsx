import { DashboardShell } from "@/components/layout/dashboard-shell";
import { adminNavigation } from "@/data/navigation";
import { AdminOverview } from "@/components/dashboard/admin-overview";

export default function AdminPage() {
  return <DashboardShell title="Admin Console" items={adminNavigation}><AdminOverview /></DashboardShell>;
}
