import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AdminHotelAgreements } from "@/components/dashboard/admin-hotel-agreements";
import { adminNavigation } from "@/data/navigation";

export default function AdminAgreementsPage() {
  return (
    <DashboardShell title="Admin Console" items={adminNavigation}>
      <h1 className="text-3xl font-bold">Hotel agreements</h1>
      <p className="mt-2 max-w-3xl text-slate-600">
        Record immutable evidence for counsel-approved templates and fully executed hotel agreements. These records unlock later commercial review; they do not publish a hotel.
      </p>
      <AdminHotelAgreements />
    </DashboardShell>
  );
}
