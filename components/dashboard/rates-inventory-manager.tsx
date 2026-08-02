"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Property = { id: string; name: string; active: boolean };
type Inventory = { stay_date: string; available_units: number; rate: number };
type Room = { id: string; property_id: string; name: string; max_guests: number; base_rate: number; active: boolean; inventory?: Inventory[] };

export function RatesInventoryManager() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState("");
  const editingRoom = rooms.find((room) => room.id === editingRoomId);
  const propertyNames = useMemo(() => new Map(properties.map((property) => [property.id, property.name])), [properties]);

  const load = useCallback(async () => {
    const response = await fetch("/api/partner/rates");
    const body = await response.json();
    if (response.ok) { setProperties(body.properties); setRooms(body.rooms); }
    else setMessage(body.error || "Rates could not be loaded.");
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function send(event: FormEvent<HTMLFormElement>, action: "create_room" | "set_inventory") {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setMessage("");
    const fields = Object.fromEntries(new FormData(form));

    try {
      const response = await fetch("/api/partner/rates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...fields })
      });
      const body = await response.json();
      setMessage(response.ok ? body.message : body.error);
      if (response.ok) {
        form.reset();
        await load();
      }
    } catch {
      setMessage("The update could not be completed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function updateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingRoom) return;

    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/partner/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_room",
          roomId: editingRoom.id,
          name: fields.get("name"),
          maxGuests: fields.get("maxGuests"),
          baseRate: fields.get("baseRate"),
          active: fields.get("active") === "on"
        })
      });
      const body = await response.json();
      setMessage(response.ok ? body.message : body.error);
      if (response.ok) await load();
    } catch {
      setMessage("The room type could not be saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-8 grid gap-8">
    <section className="card overflow-hidden">
      <div className="border-b p-6"><h2 className="text-xl font-semibold">Room types and current rates</h2><p className="mt-1 text-sm text-slate-500">Room-type changes require property review. Dated rate and inventory updates remain live.</p></div>
      <div className="divide-y">
        {!rooms.length && <p className="p-6 text-sm text-slate-500">Add a property, then create its first room type.</p>}
        {rooms.map((room) => {
          const next = room.inventory?.slice().sort((a, b) => a.stay_date.localeCompare(b.stay_date))[0];
          return <article key={room.id} className="grid gap-3 p-6 sm:grid-cols-[1fr_auto] sm:items-center"><div><strong>{room.name}</strong><p className="mt-1 text-sm text-slate-500">{propertyNames.get(room.property_id)} · Up to {room.max_guests} guests · {room.active ? "Active" : "Inactive"}</p></div><div className="flex items-center gap-3 sm:justify-end"><div className="sm:text-right"><strong>${Number(next?.rate || room.base_rate).toFixed(2)}</strong><p className="text-xs text-slate-500">{next ? `${next.available_units} units on ${next.stay_date}` : "Base rate · no dated inventory"}</p></div><button type="button" onClick={() => setEditingRoomId(room.id)} className="btn-secondary">Edit</button></div></article>;
        })}
      </div>
    </section>
    <div className="grid gap-8 xl:grid-cols-3">
      <form onSubmit={(event) => send(event, "create_room")} className="card grid gap-4 p-6">
        <div><h2 className="text-xl font-semibold">Add room type</h2><p className="mt-1 text-sm text-slate-500">Create a room or vacation-home unit.</p></div>
        <label className="text-sm font-medium">Property<select name="propertyId" className="input mt-2" required><option value="">Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
        <label className="text-sm font-medium">Room name<input name="name" className="input mt-2" placeholder="Deluxe King" required /></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Maximum guests<input name="maxGuests" type="number" min="1" max="30" className="input mt-2" required /></label><label className="text-sm font-medium">Base nightly rate<input name="baseRate" type="number" min="25" step="0.01" className="input mt-2" required /></label></div>
        <button disabled={busy || !properties.length} className="btn-primary">Create room type</button>
      </form>
      <form key={editingRoom?.id || "no-room"} onSubmit={updateRoom} className="card grid gap-4 p-6">
        <div><h2 className="text-xl font-semibold">Edit room type</h2><p className="mt-1 text-sm text-slate-500">Changes return the property to administrator review.</p></div>
        <label className="text-sm font-medium">Room type<select className="input mt-2" value={editingRoomId} onChange={(event) => setEditingRoomId(event.target.value)} required><option value="">Select room</option>{rooms.map((room) => <option key={room.id} value={room.id}>{propertyNames.get(room.property_id)} — {room.name}</option>)}</select></label>
        <label className="text-sm font-medium">Room name<input name="name" className="input mt-2" defaultValue={editingRoom?.name || ""} disabled={!editingRoom} required /></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Maximum guests<input name="maxGuests" type="number" min="1" max="30" className="input mt-2" defaultValue={editingRoom?.max_guests || ""} disabled={!editingRoom} required /></label><label className="text-sm font-medium">Base nightly rate<input name="baseRate" type="number" min="25" step="0.01" className="input mt-2" defaultValue={editingRoom?.base_rate || ""} disabled={!editingRoom} required /></label></div>
        <label className="flex items-center gap-3 text-sm font-medium"><input name="active" type="checkbox" defaultChecked={editingRoom?.active ?? true} disabled={!editingRoom} /> Active and eligible for inventory</label>
        <button disabled={busy || !editingRoom} className="btn-primary">Save room type</button>
      </form>
      <form onSubmit={(event) => send(event, "set_inventory")} className="card grid gap-4 p-6">
        <div><h2 className="text-xl font-semibold">Set dated inventory</h2><p className="mt-1 text-sm text-slate-500">Update up to 366 consecutive dates.</p></div>
        <label className="text-sm font-medium">Room type<select name="roomId" className="input mt-2" required><option value="">Select room</option>{rooms.map((room) => <option key={room.id} value={room.id}>{propertyNames.get(room.property_id)} — {room.name}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Start date<input name="startDate" type="date" className="input mt-2" required /></label><label className="text-sm font-medium">End date<input name="endDate" type="date" className="input mt-2" required /></label></div>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Available units<input name="availableUnits" type="number" min="0" max="500" className="input mt-2" required /></label><label className="text-sm font-medium">Nightly rate<input name="rate" type="number" min="25" step="0.01" className="input mt-2" required /></label></div>
        <button disabled={busy || !rooms.length} className="btn-primary">Update inventory</button>
      </form>
    </div>
    {message && <p role="status" className="card p-4 text-sm">{message}</p>}
  </div>;
}
