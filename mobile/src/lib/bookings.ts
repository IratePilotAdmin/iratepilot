import { buildWebUrl } from "@/lib/web";

export type MobileBooking = {
  id: string;
  confirmation_code: string;
  check_in: string;
  check_out: string;
  guests: number;
  subtotal: number;
  fees: number;
  total: number;
  status: string;
  cancellation_reason: string | null;
  created_at: string;
  payment_collected: boolean;
  properties: { name: string; city: string; country: string } | null;
  rooms: { name: string } | null;
};

export type BookingPaymentIntent = {
  clientSecret: string;
  paymentMode: "test" | "live";
  breakdown: {
    confirmationCode: string;
    propertyName: string;
    roomName: string;
    total: number;
  };
};

export async function getBookings(accessToken: string, signal?: AbortSignal) {
  const response = await fetch(buildWebUrl("/api/bookings"), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    signal,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Unable to load your trips.");
  return {
    bookings: (body.data ?? []) as MobileBooking[],
    paymentMode: (body.paymentMode ?? null) as "test" | "live" | null,
  };
}

export async function createBookingPaymentIntent(bookingId: string, accessToken: string) {
  const response = await fetch(buildWebUrl(`/api/bookings/${encodeURIComponent(bookingId)}/payment-intent`), {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Unable to prepare secure payment.");
  return body as BookingPaymentIntent;
}
