import { DashboardShell } from "@/components/layout/dashboard-shell";
import { adminNavigation } from "@/data/navigation";
import { AdminPartnerApplications } from "@/components/dashboard/admin-partner-applications";

export default function Page() {
  return (
    <DashboardShell title="Admin Console" items={adminNavigation}>
      <h1 className="text-3xl font-bold">Partner management</h1>
      <p className="mt-2 text-slate-600">
        Verify manager authority and hotel details before granting access or creating an inactive property draft.
      </p>
      <AdminPartnerApplications />
    </DashboardShell>
  );
}
