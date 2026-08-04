import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { TripCalendarButton } from "@/components/bookings/trip-calendar-button";
import { getBookingConfirmationPresentation, type BookingConfirmationStatus } from "@/lib/booking-confirmation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type BookingRow = {
  confirmation_code: string;
  status: BookingConfirmationStatus;
  check_in: string;
  check_out: string;
  guests: number;
  total: number;
  stripe_payment_intent_id: string | null;
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

  const { data, error } = await supabase.from("bookings")
    .select("confirmation_code,status,check_in,check_out,guests,total,stripe_payment_intent_id,properties(name,city,country),rooms(name)")
    .eq("customer_id", user.id)
    .eq("confirmation_code", code)
    .maybeSingle();
  if (error) throw error;
  if (!data) notFound();

  const booking = data as unknown as BookingRow;
  const presentation = getBookingConfirmationPresentation(
    booking.status,
    Boolean(booking.stripe_payment_intent_id),
    replayed,
  );

  const calendarDetails = { confirmationCode: booking.confirmation_code, propertyName: booking.properties?.name || "Property", roomName: booking.rooms?.name || "Room", city: booking.properties?.city, country: booking.properties?.country, checkIn: booking.check_in, checkOut: booking.check_out, guests: booking.guests };
  return <><SiteHeader /><main className="container-page flex min-h-[65vh] items-center justify-center py-12"><div className="card w-full max-w-2xl p-10 text-center"><div className="text-5xl">✓</div><h1 className="mt-5 text-3xl font-bold">{presentation.title}</h1><p className="mt-3 font-semibold text-slate-700">Confirmation {booking.confirmation_code}</p><p className="mt-2 text-sm text-slate-500">{presentation.message}</p><dl className="mt-8 grid gap-4 rounded-xl bg-slate-50 p-6 text-left sm:grid-cols-2"><div><dt className="text-xs uppercase tracking-wider text-slate-500">Property</dt><dd className="mt-1 font-semibold">{booking.properties?.name || "Property"}</dd><dd className="text-sm text-slate-500">{booking.properties ? `${booking.properties.city}, ${booking.properties.country}` : ""}</dd></div><div><dt className="text-xs uppercase tracking-wider text-slate-500">Room</dt><dd className="mt-1 font-semibold">{booking.rooms?.name || "Room"}</dd></div><div><dt className="text-xs uppercase tracking-wider text-slate-500">Stay</dt><dd className="mt-1 font-semibold">{booking.check_in} to {booking.check_out}</dd><dd className="text-sm text-slate-500">{booking.guests} {booking.guests === 1 ? "guest" : "guests"}</dd></div><div><dt className="text-xs uppercase tracking-wider text-slate-500">Total</dt><dd className="mt-1 font-semibold">${Number(booking.total).toFixed(2)}</dd><dd className="text-sm capitalize text-slate-500">Status: {booking.status}</dd></div></dl><div className="mt-8 flex flex-wrap justify-center gap-3"><Link href="/account/trips" className="btn-primary">View trip</Link>{booking.status === "confirmed" && <TripCalendarButton details={calendarDetails} />}</div></div></main><SiteFooter /></>;
}
