import { DashboardShell } from "@/components/layout/dashboard-shell";
import { partnerNavigation } from "@/data/navigation";
import { BookingMessageCenter } from "@/components/bookings/booking-message-center";
export default async function Page({ searchParams }: { searchParams: Promise<{ booking?: string }> }) {
  const { booking } = await searchParams;
  return <DashboardShell title="Partner Center" items={partnerNavigation}><h1 className="text-3xl font-bold">Guest messages</h1><p className="mt-2 text-slate-600">Keep reservation questions and answers connected to the booking.</p><BookingMessageCenter mode="partner" initialBookingId={booking} /></DashboardShell>;
}
