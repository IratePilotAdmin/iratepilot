"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TripCalendarButton } from "@/components/bookings/trip-calendar-button";
import { TripStatusTimeline } from "@/components/bookings/trip-status-timeline";
import { getBookingStatusLabel, type BookingStatusHistoryEntry } from "@/lib/bookings/status-history";

type CancellationRequest = {
  id: string;
  status: string;
  reason: string;
  refund_amount: number | string | null;
};

type Trip = {
  id: string;
  confirmation_code: string;
  check_in: string;
  check_out: string;
  guests: number;
  fees: number;
  total: number;
  status: string;
  payment_collected?: boolean;
  cancellation_reason?: string | null;
  properties?: { name?: string; city?: string; country?: string } | null;
  rooms?: { name?: string } | null;
  booking_status_history?: BookingStatusHistoryEntry[];
  booking_cancellation_requests?: CancellationRequest[];
};

export function CustomerTrips() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [message, setMessage] = useState("Loading trips…");

  useEffect(() => {
    fetch("/api/bookings")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        setTrips(body.data);
        setMessage("");
      })
      .catch((error: Error) => setMessage(error.message));
  }, []);

  async function cancel(id: string) {
    if (!window.confirm("Cancel this pending booking request?")) return;
    const response = await fetch(`/api/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Cancelled by traveler" }),
    });
    const body = await response.json();
    setMessage(response.ok ? body.message : body.error);
    if (response.ok) {
      const createdAt = new Date().toISOString();
      setTrips((current) => current.map((trip) => trip.id === id ? {
        ...trip,
        status: "cancelled",
        cancellation_reason: "Cancelled by traveler",
        booking_status_history: [
          ...(trip.booking_status_history || []),
          { status: "cancelled", note: "Cancelled by traveler", created_at: createdAt },
        ],
      } : trip));
    }
  }

  async function requestCancellation(id: string) {
    const reason = window.prompt("Why would you like to cancel this confirmed stay?");
    if (!reason) return;
    const response = await fetch(`/api/bookings/${id}/cancellation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const body = await response.json();
    setMessage(response.ok ? body.message : body.error);
    if (response.ok) {
      const createdAt = new Date().toISOString();
      setTrips((current) => current.map((trip) => trip.id === id
        ? {
          ...trip,
          ...(body.mode === "unpaid_cancellation" ? {
            status: "cancelled",
            cancellation_reason: reason,
            booking_status_history: [
              ...(trip.booking_status_history || []),
              { status: "cancelled", note: "Unpaid reservation cancelled; no refund required.", created_at: createdAt },
            ],
          } : {}),
          booking_cancellation_requests: [body.data],
        }
        : trip));
    }
  }

  return (
    <section className="card mt-8 overflow-hidden">
      {message && <p role="status" className="p-6 text-sm text-slate-500">{message}</p>}
      <div className="divide-y">
        {trips.map((trip) => {
          const cancellation = trip.booking_cancellation_requests?.[0];
          const confirmationHref = `/booking-confirmation?code=${encodeURIComponent(trip.confirmation_code)}`;
          const calendarDetails = {
            confirmationCode: trip.confirmation_code,
            propertyName: trip.properties?.name || "Property",
            roomName: trip.rooms?.name || "Room",
            city: trip.properties?.city,
            country: trip.properties?.country,
            checkIn: trip.check_in,
            checkOut: trip.check_out,
            guests: trip.guests,
          };

          return (
            <article key={trip.id} className="grid gap-4 p-6 lg:grid-cols-[1fr_auto_minmax(220px,auto)] lg:items-start">
              <div>
                <strong>{trip.properties?.name || "Property"}</strong>
                <p className="mt-1 text-sm text-slate-500">{trip.rooms?.name} · {trip.check_in} to {trip.check_out} · {trip.guests} guests</p>
                <p className="mt-2 text-xs uppercase tracking-wider text-slate-500">{trip.confirmation_code} · {getBookingStatusLabel(trip.status)}</p>
                {trip.cancellation_reason && <p className="mt-2 text-sm text-red-700">{trip.cancellation_reason}</p>}
                {cancellation && (
                  <div className="mt-4 border-l-2 border-amber-500 bg-amber-50 p-4 text-sm text-amber-950">
                    <strong>Cancellation request: {getBookingStatusLabel(cancellation.status)}</strong>
                    <p className="mt-1 leading-6">{cancellation.reason}</p>
                    {cancellation.refund_amount !== null && (
                      <p className="mt-2 font-semibold">Refund recorded: ${Number(cancellation.refund_amount).toFixed(2)}</p>
                    )}
                  </div>
                )}
                <TripStatusTimeline entries={trip.booking_status_history || []} />
              </div>
              <div className="lg:text-right">
                <strong>${Number(trip.total).toFixed(2)}</strong>
                <p className="text-xs text-slate-500">Includes ${Number(trip.fees).toFixed(2)} service fee</p>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <Link href={confirmationHref} className="btn-secondary">View confirmation</Link>
                <Link href={`/account/support?booking=${encodeURIComponent(trip.id)}`} className="btn-secondary">Message property</Link>
                {trip.status === "confirmed" && !trip.payment_collected && <Link href={`/account/trips/${encodeURIComponent(trip.id)}/pay`} className="btn-primary">Pay now (test)</Link>}
                {trip.status === "confirmed" && <TripCalendarButton details={calendarDetails} />}
                {trip.status === "pending" ? (
                  <button onClick={() => cancel(trip.id)} className="btn-secondary">Cancel request</button>
                ) : trip.status === "confirmed" && !cancellation ? (
                  <button onClick={() => requestCancellation(trip.id)} className="btn-secondary">Request cancellation</button>
                ) : (
                  <span className="badge">{getBookingStatusLabel(cancellation?.status || trip.status)}</span>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {!message && !trips.length && <p className="p-6 text-sm text-slate-500">No booking requests yet.</p>}
    </section>
  );
}
