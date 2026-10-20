import { DashboardShell } from "@/components/layout/dashboard-shell";
import { adminNavigation } from "@/data/navigation";
import { AdminOtaInbox } from "@/components/dashboard/admin-ota-inbox";
import { AdminNativePmsOutbox } from "@/components/dashboard/admin-native-pms-outbox";
import { AdminBookingComAri } from "@/components/dashboard/admin-booking-com-ari";

export default function Page() {
  return <DashboardShell title="Admin Console" items={adminNavigation}>
    <h1 className="text-3xl font-bold">OTA operations</h1>
    <p className="mt-2 text-slate-600">Monitor reservation imports and identify items held for operator review.</p>
    <AdminOtaInbox />
    <AdminNativePmsOutbox />
    <AdminBookingComAri />
  </DashboardShell>;
}
