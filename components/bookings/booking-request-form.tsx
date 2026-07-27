"use client";

import { FormEvent, useState } from "react";

type Room = { id: string; name: string; baseRate: number; maxGuests: number };

export function BookingRequestForm({ hotelSlug, rooms }: { hotelSlug: string; rooms: Room[] }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hotelSlug,
        roomId: form.get("roomId"),
        checkIn: form.get("checkIn"),
        checkOut: form.get("checkOut"),
        guests: form.get("guests")
      })
    });
    const body = await response.json();
    setMessage(response.ok ? `${body.message} Reference: ${body.data.confirmation_code}` : body.error);
    setBusy(false);
  }

  if (!rooms.length) return <div className="card p-6 text-sm text-slate-600">Live booking requests are unavailable for this demonstration property.</div>;

  return <form onSubmit={submit} className="card grid gap-4 p-6">
    <div><h3 className="text-xl font-semibold">Request this stay</h3><p className="mt-1 text-sm text-slate-500">Availability and pricing are checked before a pending request is created. No payment is collected.</p></div>
    <label className="text-sm font-medium">Room type<select name="roomId" className="input mt-2" required><option value="">Select a room</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name} · from ${room.baseRate.toFixed(2)} · {room.maxGuests} guests</option>)}</select></label>
    <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Check-in<input name="checkIn" type="date" className="input mt-2" required /></label><label className="text-sm font-medium">Check-out<input name="checkOut" type="date" className="input mt-2" required /></label></div>
    <label className="text-sm font-medium">Guests<input name="guests" type="number" min="1" max="20" className="input mt-2" required /></label>
    {message && <p role="status" className="text-sm">{message}</p>}
    <button disabled={busy} className="btn-primary">{busy ? "Checking availability…" : "Create private booking request"}</button>
  </form>;
}
