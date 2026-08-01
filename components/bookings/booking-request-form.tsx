"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Room = { id: string; name: string; baseRate: number; maxGuests: number };
type Selection = { roomId?: string; checkIn?: string; checkOut?: string; guests?: string };

export function BookingRequestForm({
  hotelSlug,
  rooms,
  testCheckoutEnabled,
  initialSelection = {}
}: {
  hotelSlug: string;
  rooms: Room[];
  testCheckoutEnabled: boolean;
  initialSelection?: Selection;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const selection = {
      hotelSlug,
      roomId: String(form.get("roomId") || ""),
      checkIn: String(form.get("checkIn") || ""),
      checkOut: String(form.get("checkOut") || ""),
      guests: String(form.get("guests") || "")
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

      router.push(`/booking-confirmation?mode=request&code=${encodeURIComponent(body.data.confirmation_code)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The booking request could not be created.");
      setBusy(false);
    }
  }

  if (!rooms.length) return <div className="card p-6 text-sm text-slate-600">Live booking requests are unavailable for this demonstration property.</div>;

  return <form id="booking-request" onSubmit={submit} className="card grid gap-4 p-6">
    <div><h3 className="text-xl font-semibold">Book this stay</h3><p className="mt-1 text-sm text-slate-500">{testCheckoutEnabled ? "Availability and the final nightly total are verified securely before test payment." : "Availability and the final nightly total are verified before your request is sent to the property. No payment is collected."}</p></div>
    <label className="text-sm font-medium">Room type<select name="roomId" className="input mt-2" defaultValue={initialSelection.roomId || ""} required><option value="">Select a room</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name} · from ${room.baseRate.toFixed(2)} · {room.maxGuests} guests</option>)}</select></label>
    <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Check-in<input name="checkIn" type="date" className="input mt-2" defaultValue={initialSelection.checkIn || ""} required /></label><label className="text-sm font-medium">Check-out<input name="checkOut" type="date" className="input mt-2" defaultValue={initialSelection.checkOut || ""} required /></label></div>
    <label className="text-sm font-medium">Guests<input name="guests" type="number" min="1" max="20" className="input mt-2" defaultValue={initialSelection.guests || "1"} required /></label>
    {message && <p role="alert" className="text-sm text-red-700">{message}</p>}
    <button disabled={busy} className="btn-primary">{busy ? (testCheckoutEnabled ? "Opening checkout…" : "Sending request…") : (testCheckoutEnabled ? "Continue to secure test checkout" : "Request this stay")}</button>
  </form>;
}
