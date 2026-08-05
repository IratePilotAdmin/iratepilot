import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { BookingMessageCenter } from "@/components/bookings/booking-message-center";
export default async function Page({ searchParams }: { searchParams: Promise<{ booking?: string }> }) {
  const { booking } = await searchParams;
  return <><SiteHeader/><main className="container-page py-14"><h1 className="text-3xl font-bold">Booking messages</h1><p className="mt-2 text-slate-500">Contact the property team about an existing reservation.</p><BookingMessageCenter mode="customer" initialBookingId={booking} /></main><SiteFooter/></>;
}
