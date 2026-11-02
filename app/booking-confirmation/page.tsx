import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { TripCalendarButton } from "@/components/bookings/trip-calendar-button";
import { getBookingConfirmationPresentation, type BookingConfirmationStatus } from "@/lib/booking-confirmation";
import { createClient } from "@/lib/supabase/server";
import { getApprovedBookingPaymentMode, type BookingPaymentMode } from "@/lib/stripe/booking-payment-mode";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const bookingConfirmationSelect = "id,confirmation_code,status,check_in,check_out,guests,child_ages,subtotal,taxes,fees,due_at_property,total,supplier_itinerary_id,bed_type,refundable,cancellation_policy,checkin_begin_time,checkin_end_time,checkin_instructions,special_checkin_instructions,stripe_payment_intent_id,stripe_payment_mode,properties(name,city,country),rooms(name)";
const bookingConfirmationFallbackSelect = "id,confirmation_code,status,check_in,check_out,guests,subtotal,taxes,fees,due_at_property,total,supplier_itinerary_id,bed_type,refundable,cancellation_policy,checkin_begin_time,checkin_end_time,checkin_instructions,special_checkin_instructions,stripe_payment_intent_id,stripe_payment_mode,properties(name,city,country),rooms(name)";

function isMissingChildAgesColumn(error: { code?: string; message?: string } | null) {
  return error?.code === "42703" && error.message?.includes("child_ages");
}

type BookingRow = {
  id: string;
  confirmation_code: string;
  status: BookingConfirmationStatus;
  check_in: string;
  check_out: string;
  guests: number;
  child_ages?: number[];
  subtotal: number;
  taxes: number;
  fees: number;
  due_at_property: number;
  total: number;
  supplier_itinerary_id: string | null;
  bed_type: string | null;
  refundable: boolean | null;
  cancellation_policy: string | null;
  checkin_begin_time: string | null;
  checkin_end_time: string | null;
  checkin_instructions: string | null;
  special_checkin_instructions: string | null;
  stripe_payment_intent_id: string | null;
  stripe_payment_mode: BookingPaymentMode | null;
  properties: { name: string; city: string; country: string } | null;
  rooms: { name: string } | null;
};

export default async function ConfirmationPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const code = typeof params.code === "string" ? params.code : "";
  const replayed = params.duplicate === "true";
  if (!code) redirect("/account/trips");

  const returnPath = `/booking-confirmation?${new URLSearchParams({
    code,
    ...(replayed ? { duplicate: "true" } : {}),
  }).toString()}`;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnPath)}`);

  const primaryResult = await supabase.from("bookings")
    .select(bookingConfirmationSelect)
    .eq("customer_id", user.id)
    .eq("confirmation_code", code)
    .maybeSingle();
  let data: unknown = primaryResult.data;
  let error = primaryResult.error;

  if (isMissingChildAgesColumn(error)) {
    const fallbackResult = await supabase.from("bookings")
      .select(bookingConfirmationFallbackSelect)
      .eq("customer_id", user.id)
      .eq("confirmation_code", code)
      .maybeSingle();
    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) throw error;
  if (!data) notFound();

  const booking = data as unknown as BookingRow;
  const presentation = getBookingConfirmationPresentation(
    booking.status,
    Boolean(booking.stripe_payment_intent_id),
    replayed,
    booking.stripe_payment_mode,
  );

  const availablePaymentMode = getApprovedBookingPaymentMode();

  const calendarDetails = { confirmationCode: booking.confirmation_code, propertyName: booking.properties?.name || "Property", roomName: booking.rooms?.name || "Room", city: booking.properties?.city, country: booking.properties?.country, checkIn: booking.check_in, checkOut: booking.check_out, guests: booking.guests };
  const otherFees = Math.max(0, Number(booking.fees) - Number(booking.due_at_property));
  return <><SiteHeader /><main className="container-page flex min-h-[65vh] items-center justify-center py-12"><div className="card w-full max-w-3xl p-10 text-center"><div className="text-5xl">✓</div><h1 className="mt-5 text-3xl font-bold">{presentation.title}</h1><p className="mt-3 font-semibold text-slate-700">Itinerary {booking.supplier_itinerary_id || booking.confirmation_code}</p><p className="mt-2 text-sm text-slate-500">{presentation.message}</p><dl className="mt-8 grid gap-4 rounded-xl bg-slate-50 p-6 text-left sm:grid-cols-2"><div><dt className="text-xs uppercase tracking-wider text-slate-500">Property</dt><dd className="mt-1 font-semibold">{booking.properties?.name || "Property"}</dd><dd className="text-sm text-slate-500">{booking.properties ? `${booking.properties.city}, ${booking.properties.country}` : ""}</dd></div><div><dt className="text-xs uppercase tracking-wider text-slate-500">Room and bed</dt><dd className="mt-1 font-semibold">{booking.rooms?.name || "Room"}</dd><dd className="text-sm text-slate-500">{booking.bed_type}</dd></div><div><dt className="text-xs uppercase tracking-wider text-slate-500">Stay</dt><dd className="mt-1 font-semibold">{booking.check_in} to {booking.check_out}</dd><dd className="text-sm text-slate-500">{booking.guests} {booking.guests === 1 ? "guest" : "guests"}{booking.child_ages?.length ? ` · children ages ${booking.child_ages.join(", ")}` : ""}</dd></div><div><dt className="text-xs uppercase tracking-wider text-slate-500">Check-in</dt><dd className="mt-1 font-semibold">{booking.checkin_begin_time}{booking.checkin_end_time ? `–${booking.checkin_end_time}` : ""}</dd><dd className="text-sm text-slate-500">{booking.checkin_instructions}</dd><dd className="text-sm text-slate-500">{booking.special_checkin_instructions}</dd></div><div className="sm:col-span-2"><dt className="text-xs uppercase tracking-wider text-slate-500">Cancellation</dt><dd className={booking.refundable === false ? "mt-1 font-semibold text-red-700" : "mt-1 font-semibold"}>{booking.refundable === false ? "Non-refundable" : "Refundable under the terms below"}</dd><dd className="text-sm text-slate-500">{booking.cancellation_policy}</dd></div></dl><div className="mt-5 rounded-xl border p-6 text-left"><h2 className="font-semibold">Price breakdown</h2><div className="mt-3 flex justify-between"><span>Room subtotal</span><span>${Number(booking.subtotal).toFixed(2)}</span></div><div className="mt-2 flex justify-between"><span>Taxes</span><span>${Number(booking.taxes).toFixed(2)}</span></div><div className="mt-2 flex justify-between"><span>Charges due at property</span><span>${Number(booking.due_at_property).toFixed(2)}</span></div><div className="mt-2 flex justify-between"><span>Other fees</span><span>${otherFees.toFixed(2)}</span></div><div className="mt-4 flex justify-between border-t pt-4 text-lg font-bold"><span>Total price</span><span>${Number(booking.total).toFixed(2)}</span></div><p className="mt-3 text-sm text-slate-500">Payment: {booking.stripe_payment_intent_id ? booking.stripe_payment_mode === "live" ? "Paid securely at booking" : "Paid in test mode" : "Not collected"}. Charges due at property are collected by the property.</p></div><div className="mt-8 flex flex-wrap justify-center gap-3"><Link href="/account/trips" className="btn-primary">View trip</Link>{booking.status === "confirmed" && !booking.stripe_payment_intent_id && availablePaymentMode && <Link href={`/account/trips/${encodeURIComponent(booking.id)}/pay`} className="btn-primary">Pay now{availablePaymentMode === "test" ? " (test)" : ""}</Link>}<Link href={`/account/support?booking=${encodeURIComponent(booking.id)}`} className="btn-secondary">Online support</Link>{booking.status === "confirmed" && <TripCalendarButton details={calendarDetails} />}</div></div></main><SiteFooter /></>;
}
