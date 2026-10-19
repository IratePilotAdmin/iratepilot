"use client";

import { useState } from "react";

type Preview = {
  mode: "private-read-only";
  property: { name: string; active: boolean; partnerStatus: string | null };
  rooms: Array<{ id: string; name: string; averageNightlyRate: number; staySubtotal: number; maxGuests: number }>;
};

export function AdminAvailabilityPreview({ properties }: { properties: Array<{ id: string; name: string }> }) {
  const [propertyId, setPropertyId] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(2);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function checkAvailability() {
    setPreview(null);
    setMessage("");
    setLoading(true);
    try {
      const params = new URLSearchParams({ checkIn, checkOut, guests: String(guests) });
      const response = await fetch(`/api/admin/properties/${encodeURIComponent(propertyId)}/availability?${params}`);
      const body = await response.json();
      if (!response.ok) setMessage(body.error || "Availability could not be checked.");
      else setPreview(body as Preview);
    } catch {
      setMessage("Availability could not be checked.");
    } finally {
      setLoading(false);
    }
  }

  return <div className="border-t p-6">
    <h2 className="text-xl font-semibold">Private stay availability</h2>
    <p className="mt-1 text-sm text-slate-600">Check a property’s saved nightly inventory and rate. This is an admin-only preview; it does not publish rooms or create a booking.</p>
    <div className="mt-4 grid gap-3 md:grid-cols-4">
      <label className="text-sm">Property<select className="mt-1 w-full rounded-lg border p-2" value={propertyId} onChange={(event) => setPropertyId(event.target.value)}><option value="">Select a property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
      <label className="text-sm">Check-in<input className="mt-1 w-full rounded-lg border p-2" type="date" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} /></label>
      <label className="text-sm">Check-out<input className="mt-1 w-full rounded-lg border p-2" type="date" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} /></label>
      <label className="text-sm">Guests<input className="mt-1 w-full rounded-lg border p-2" type="number" min="1" max="20" value={guests} onChange={(event) => setGuests(Number(event.target.value))} /></label>
    </div>
    <button className="btn-secondary mt-4" disabled={loading || !propertyId || !checkIn || !checkOut} onClick={() => void checkAvailability()}>{loading ? "Checking…" : "Check saved availability"}</button>
    {message && <p role="alert" className="mt-3 text-sm text-rose-700">{message}</p>}
    {preview && <div role="status" className="mt-4 rounded-lg border p-4 text-sm"><p className="font-semibold">{preview.property.name} · {preview.rooms.length} available room type{preview.rooms.length === 1 ? "" : "s"}</p><p className="text-slate-600">Property {preview.property.active ? "active" : "inactive"}; partner {preview.property.partnerStatus ?? "unknown"}. Private preview only; booking remains disabled.</p>{preview.rooms.length === 0 && <p className="mt-3">No room type has complete saved availability and rates for every night of this stay.</p>}{preview.rooms.map((room) => <p key={room.id} className="mt-3 border-t pt-3">{room.name} · ${room.averageNightlyRate.toFixed(2)} average nightly · ${room.staySubtotal.toFixed(2)} stay subtotal · up to {room.maxGuests} guests</p>)}</div>}
  </div>;
}
