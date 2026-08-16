"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HotelAccessSelector } from "@/components/partner/hotel-access-selector";
import { getTodayIsoDate, summarizeSellableInventory } from "@/lib/inventory-dates";
import type { PartnerHotelAccess } from "@/lib/partner/hotel-access";

type Property = { id: string; name: string; active: boolean };
type Inventory = { stay_date: string; available_units: number; rate: number };
type Room = { id: string; property_id: string; name: string; max_guests: number; base_rate: number; active: boolean; inventory?: Inventory[] };

export function RatesInventoryManager() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [inventoryRoomId, setInventoryRoomId] = useState("");
  const [accessOptions, setAccessOptions] = useState<PartnerHotelAccess[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const loadRequestId = useRef(0);
  const today = useMemo(() => getTodayIsoDate(), []);
  const propertyNames = useMemo(() => new Map(properties.map((property) => [property.id, property.name])), [properties]);
  const selectedRoom = useMemo(() => rooms.find((room) => room.id === selectedRoomId), [rooms, selectedRoomId]);
  const inventoryRoom = useMemo(() => rooms.find((room) => room.id === inventoryRoomId), [rooms, inventoryRoomId]);
  const partnerSelectionRequired = accessOptions.length > 1 && !selectedPartnerId;

  const load = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    const requestedPartnerId = selectedPartnerId;
    const query = requestedPartnerId ? `?partnerId=${encodeURIComponent(requestedPartnerId)}` : "";
    const response = await fetch(`/api/partner/rates${query}`);
    const body = await response.json();
    if (requestId !== loadRequestId.current) return;
    if (body.hotelAccess) {
      setAccessOptions(body.hotelAccess.options ?? []);
      if (!requestedPartnerId && body.hotelAccess.selectedPartnerId) {
        setSelectedPartnerId(body.hotelAccess.selectedPartnerId);
      }
    }
    if (response.ok) {
      setProperties(body.properties ?? []);
      setRooms(body.rooms ?? []);
      setMessage("");
    }
    else setMessage(body.error || "Rates could not be loaded.");
  }, [selectedPartnerId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      loadRequestId.current += 1;
    };
  }, [load]);

  async function send(event: FormEvent<HTMLFormElement>, action: "create_room" | "update_room" | "set_inventory") {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setMessage("");
    const fields = Object.fromEntries(new FormData(form));

    try {
      const response = await fetch("/api/partner/rates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, partnerId: selectedPartnerId || undefined, ...fields })
      });
      const body = await response.json();
      setMessage(response.ok ? body.message : body.error);
      if (response.ok) {
        form.reset();
        if (action === "create_room") {
          setInventoryRoomId(body.data.id);
          setMessage(`${body.message} Add future inventory for this room next.`);
        }
        if (action === "update_room") setSelectedRoomId("");
        await load();
      }
    } catch {
      setMessage("The update could not be completed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-8 grid gap-8">
    <HotelAccessSelector
      disabled={busy}
      onChange={(partnerId) => {
        loadRequestId.current += 1;
        setSelectedPartnerId(partnerId);
        setSelectedRoomId("");
        setInventoryRoomId("");
        setProperties([]);
        setRooms([]);
        setMessage("");
      }}
      options={accessOptions}
      value={selectedPartnerId}
    />
    <section className="card overflow-hidden">
      <div className="border-b p-6"><h2 className="text-xl font-semibold">Room types and current rates</h2><p className="mt-1 text-sm text-slate-500">Rates remain private until the property is approved.</p></div>
      <div className="divide-y">
        {!rooms.length && <p className="p-6 text-sm text-slate-500">Add a property, then create its first room type.</p>}
        {rooms.map((room) => {
          const coverage = summarizeSellableInventory(room.inventory, today);
          const rateLabel = coverage.minRate === null ? `$${Number(room.base_rate).toFixed(2)} base rate` : coverage.minRate === coverage.maxRate ? `$${coverage.minRate.toFixed(2)}` : `$${coverage.minRate.toFixed(2)}–$${coverage.maxRate!.toFixed(2)}`;
          return <article key={room.id} className="grid gap-3 p-6 sm:grid-cols-[1fr_auto] sm:items-center"><div><strong>{room.name}</strong><p className="mt-1 text-sm text-slate-500">{propertyNames.get(room.property_id)} · Up to {room.max_guests} guests · {room.active ? "Active" : "Retired"}</p></div><div className="sm:text-right"><strong>{rateLabel}</strong><p className="text-xs text-slate-500">{coverage.sellableDates ? `${coverage.sellableDates} sellable nights · ${coverage.startDate} to ${coverage.endDate}` : "No sellable future inventory"}</p></div></article>;
        })}
      </div>
    </section>
    <div className="grid gap-8 xl:grid-cols-3">
      <form onSubmit={(event) => send(event, "create_room")} className="card grid gap-4 p-6">
        <div><h2 className="text-xl font-semibold">Add room type</h2><p className="mt-1 text-sm text-slate-500">Create a room or vacation-home unit.</p></div>
        <label className="text-sm font-medium">Property<select name="propertyId" className="input mt-2" required><option value="">Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
        <label className="text-sm font-medium">Room name<input name="name" className="input mt-2" placeholder="Deluxe King" required /></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Maximum guests<input name="maxGuests" type="number" min="1" max="30" className="input mt-2" required /></label><label className="text-sm font-medium">Base nightly rate<input name="baseRate" type="number" min="25" step="0.01" className="input mt-2" required /></label></div>
        <button disabled={busy || partnerSelectionRequired || !properties.length} className="btn-primary">Create room type</button>
      </form>
      <form onSubmit={(event) => send(event, "update_room")} className="card grid gap-4 p-6">
        <div><h2 className="text-xl font-semibold">Edit room type</h2><p className="mt-1 text-sm text-slate-500">Correct details or retire a room from new bookings.</p></div>
        <label className="text-sm font-medium">Room type<select name="roomId" value={selectedRoomId} onChange={(event) => setSelectedRoomId(event.target.value)} className="input mt-2" required><option value="">Select room</option>{rooms.map((room) => <option key={room.id} value={room.id}>{propertyNames.get(room.property_id)} — {room.name}</option>)}</select></label>
        <label className="text-sm font-medium">Room name<input key={`${selectedRoomId}-name`} name="name" defaultValue={selectedRoom?.name || ""} className="input mt-2" required disabled={!selectedRoom} /></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Maximum guests<input key={`${selectedRoomId}-guests`} name="maxGuests" type="number" min="1" max="30" defaultValue={selectedRoom?.max_guests} className="input mt-2" required disabled={!selectedRoom} /></label><label className="text-sm font-medium">Base nightly rate<input key={`${selectedRoomId}-rate`} name="baseRate" type="number" min="25" step="0.01" defaultValue={selectedRoom?.base_rate} className="input mt-2" required disabled={!selectedRoom} /></label></div>
        <label className="text-sm font-medium">Booking status<select key={`${selectedRoomId}-active`} name="active" defaultValue={selectedRoom?.active === false ? "false" : "true"} className="input mt-2" disabled={!selectedRoom}><option value="true">Active for new bookings</option><option value="false">Retired from new bookings</option></select></label>
        <button disabled={busy || partnerSelectionRequired || !selectedRoom} className="btn-primary">Save room type</button>
      </form>
      <form onSubmit={(event) => send(event, "set_inventory")} className="card grid gap-4 p-6">
        <div><h2 className="text-xl font-semibold">Set dated inventory</h2><p className="mt-1 text-sm text-slate-500">Update up to 366 consecutive dates.</p></div>
        <label className="text-sm font-medium">Room type<select name="roomId" value={inventoryRoomId} onChange={(event) => setInventoryRoomId(event.target.value)} className="input mt-2" required><option value="">Select room</option>{rooms.map((room) => <option key={room.id} value={room.id}>{propertyNames.get(room.property_id)} — {room.name}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Start date<input name="startDate" type="date" min={today} className="input mt-2" required disabled={!inventoryRoom} /></label><label className="text-sm font-medium">End date<input name="endDate" type="date" min={today} className="input mt-2" required disabled={!inventoryRoom} /></label></div>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Available units<input name="availableUnits" type="number" min="0" max="500" className="input mt-2" required disabled={!inventoryRoom} /></label><label className="text-sm font-medium">Nightly rate<input key={`${inventoryRoomId}-inventory-rate`} name="rate" type="number" min="25" step="0.01" defaultValue={inventoryRoom?.base_rate} className="input mt-2" required disabled={!inventoryRoom} /></label></div>
        <button disabled={busy || partnerSelectionRequired || !inventoryRoom} className="btn-primary">Update inventory</button>
      </form>
    </div>
    {message && <p role="status" className="card p-4 text-sm">{message}</p>}
  </div>;
}
