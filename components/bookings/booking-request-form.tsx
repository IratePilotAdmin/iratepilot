"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Room = { id: string; name: string; baseRate: number; maxGuests: number };
type Selection = { roomId?: string; checkIn?: string; checkOut?: string; guests?: string };
type AvailabilityState = "demo" | "unverified" | "verified";

export function BookingRequestForm({
  hotelSlug,
  rooms,
  testCheckoutEnabled,
  initialSelection = {},
  availabilityState
}: {
  hotelSlug: string;
  rooms: Room[];
  testCheckoutEnabled: boolean;
  initialSelection?: Selection;
  availabilityState: AvailabilityState;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const checkIn = String(form.get("checkIn") || "");
    const checkOut = String(form.get("checkOut") || "");
    const guests = String(form.get("guests") || "");

    if (availabilityState === "unverified") {
      const stayQuery = new URLSearchParams({ checkIn, checkOut, guests });
      router.push(`/hotels/${encodeURIComponent(hotelSlug)}?${stayQuery.toString()}#booking-request`);
      return;
    }

    setBusy(true);
    setMessage("");
    const selection = {
      hotelSlug,
      roomId: String(form.get("roomId") || ""),
      checkIn,
      checkOut,
      guests
    };
    const query = new URLSearchParams(selection);

    if (testCheckoutEnabled) {
      router.push(`/checkout?${query.toString()}`);
      return;
    }

    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selection)
      });
      const body = await response.json();

      if (response.status === 401) {
        const returnPath = `/hotels/${encodeURIComponent(hotelSlug)}?${query.toString()}`;
        router.push(`/login?next=${encodeURIComponent(returnPath)}`);
        return;
      }
      if (!response.ok) throw new Error(body.error || "The booking request could not be created.");

      const confirmation = new URLSearchParams({
        mode: "request",
        code: body.data.confirmation_code,
        ...(body.duplicate ? { duplicate: "true" } : {})
      });
      router.push(`/booking-confirmation?${confirmation.toString()}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The booking request could not be created.");
      setBusy(false);
    }
  }

  if (availabilityState === "demo") {
    return <div className="card p-6 text-sm text-slate-600">Live booking requests are unavailable for this demonstration property.</div>;
  }

  if (availabilityState === "unverified") {
    return <form id="booking-request" onSubmit={submit} className="card grid gap-4 p-6">
      <div><h3 className="text-xl font-semibold">Check live availability</h3><p className="mt-1 text-sm text-slate-500">Choose your stay first. We will refresh the room list with options available for every selected night.</p></div>
      <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Check-in<input name="checkIn" type="date" className="input mt-2" defaultValue={initialSelection.checkIn || ""} required /></label><label className="text-sm font-medium">Check-out<input name="checkOut" type="date" className="input mt-2" defaultValue={initialSelection.checkOut || ""} required /></label></div>
      <label className="text-sm font-medium">Guests<input name="guests" type="number" min="1" max="20" className="input mt-2" defaultValue={initialSelection.guests || "1"} required /></label>
      <button className="btn-primary">Show available rooms</button>
    </form>;
  }

  if (!rooms.length) {
    return <div id="booking-request" className="card p-6"><p className="text-sm text-slate-600">No available room can be requested for this stay.</p><Link href={`/hotels/${encodeURIComponent(hotelSlug)}#booking-request`} className="btn-secondary mt-4">Change dates or guests</Link></div>;
  }

  const selectedRoomId = rooms.some((room) => room.id === initialSelection.roomId) ? initialSelection.roomId : "";

  return <form id="booking-request" onSubmit={submit} className="card grid gap-4 p-6">
    <div><h3 className="text-xl font-semibold">Book this stay</h3><p className="mt-1 text-sm text-slate-500">{testCheckoutEnabled ? "Availability and the final nightly total are verified securely before test payment." : "Availability and the final nightly total are verified before your request is sent to the property. No payment is collected."}</p></div>
    <label className="text-sm font-medium">Room type<select name="roomId" className="input mt-2" defaultValue={selectedRoomId} required><option value="">Select a room</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name} · ${room.baseRate.toFixed(2)} average nightly · {room.maxGuests} guests</option>)}</select></label>
    <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700"><strong className="block text-slate-950">Verified stay</strong><span>{initialSelection.checkIn} to {initialSelection.checkOut} · {initialSelection.guests} {initialSelection.guests === "1" ? "guest" : "guests"}</span><Link href={`/hotels/${encodeURIComponent(hotelSlug)}#booking-request`} className="mt-2 block font-semibold text-violet-700">Change dates or guests</Link></div>
    <input name="checkIn" type="hidden" value={initialSelection.checkIn || ""} />
    <input name="checkOut" type="hidden" value={initialSelection.checkOut || ""} />
    <input name="guests" type="hidden" value={initialSelection.guests || ""} />
    {message && <p role="alert" className="text-sm text-red-700">{message}</p>}
    <button disabled={busy} className="btn-primary">{busy ? (testCheckoutEnabled ? "Opening checkout…" : "Sending request…") : (testCheckoutEnabled ? "Continue to secure test checkout" : "Request this stay")}</button>
  </form>;
}
