"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Property = { id: string; name: string; active: boolean };
type Room = { id: string; property_id: string; name: string; max_guests: number; base_rate: number; active: boolean };
type Connection = { connection_id: string; property_id: string; provider_property_id: string; environment: "test"; enabled: boolean; partner_approved: boolean };
type Mapping = { connection_id: string; provider_room_type_id: string; provider_rate_plan_id: string; local_room_id: string };

export function PartnerBookingComMappings() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [connectionId, setConnectionId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const syncId = useRef("");
  const selectedConnection = useMemo(() => connections.find((item) => item.connection_id === connectionId), [connections, connectionId]);
  const propertyRooms = useMemo(() => rooms.filter((room) => room.property_id === selectedConnection?.property_id && room.active), [rooms, selectedConnection]);
  const effectiveRoomId = propertyRooms.some((room) => room.id === roomId) ? roomId : propertyRooms[0]?.id || "";

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/partner/integrations/booking-com/mappings", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error || "Room mappings could not be loaded.");
        return;
      }
      setProperties(body.properties ?? []);
      setRooms(body.rooms ?? []);
      setConnections(body.connections ?? []);
      setMappings(body.mappings ?? []);
      setConnectionId((current) => current || body.connections?.[0]?.connection_id || "");
    } catch {
      setMessage("Room mappings could not be loaded.");
    }
  }, []);

  useEffect(() => {
    // Initial remote-data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedConnection) return;
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/partner/integrations/booking-com/mappings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: selectedConnection.property_id,
          connectionId,
          localRoomId: effectiveRoomId,
          providerRoomTypeId: form.get("providerRoomTypeId"),
          providerRatePlanId: form.get("providerRatePlanId"),
        }),
      });
      const body = await response.json();
      setMessage(response.ok ? body.message : body.error || "Room mapping could not be saved.");
      if (response.ok) await load();
    } catch {
      setMessage("Room mapping could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function queueSync(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedConnection) return;
    setSyncBusy(true);
    setSyncMessage("");
    const form = new FormData(event.currentTarget);
    if (!syncId.current) syncId.current = crypto.randomUUID();
    try {
      const response = await fetch("/api/partner/integrations/booking-com/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: selectedConnection.property_id,
          connectionId,
          syncId: syncId.current,
          startDate: form.get("startDate"),
          endDate: form.get("endDate"),
          currency: form.get("currency"),
          priceBasis: form.get("priceBasis"),
        }),
      });
      const body = await response.json();
      setSyncMessage(response.ok
        ? `${body.queued} request(s) queued${body.existing ? `; ${body.existing} already queued` : ""}. ${body.message}`
        : body.error || "Rates and availability could not be queued.");
      if (response.ok) syncId.current = "";
    } catch {
      setSyncMessage("Rates and availability could not be queued. Retry the same sync; its request ID is preserved.");
    } finally {
      setSyncBusy(false);
    }
  }

  return <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_420px]">
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-6">
        <div><h2 className="text-xl font-semibold">Booking.com room mappings</h2><p className="mt-1 text-sm text-slate-500">Match Booking.com room and rate-plan IDs to an active iRatePilot room.</p></div>
        <button className="btn-secondary" onClick={() => void load()} type="button">Refresh</button>
      </div>
      <div className="divide-y">
        {connections.length === 0 && <p className="p-6 text-sm text-slate-500">Save a Booking.com test account first to add mappings.</p>}
        {mappings.map((mapping) => {
          const property = properties.find((item) => item.id === connections.find((connection) => connection.connection_id === mapping.connection_id)?.property_id);
          const room = rooms.find((item) => item.id === mapping.local_room_id);
          return <article className="flex flex-wrap items-center justify-between gap-4 p-6" key={`${mapping.connection_id}:${mapping.provider_room_type_id}:${mapping.provider_rate_plan_id}`}>
            <div>
              <strong>{property?.name || "Hotel property"} · {room?.name || "Room unavailable"}</strong>
              <p className="mt-1 text-sm text-slate-500">Booking.com room {mapping.provider_room_type_id} · rate plan {mapping.provider_rate_plan_id}</p>
            </div>
            <span className="badge">test mapping</span>
          </article>;
        })}
        {connections.length > 0 && mappings.length === 0 && <p className="p-6 text-sm text-slate-500">No room/rate mappings yet.</p>}
      </div>
    </section>

    <form className="card grid h-fit gap-4 p-6" key={connectionId || "empty"} onSubmit={save}>
      <div><h2 className="text-xl font-semibold">Map a sellable room</h2><p className="mt-1 text-sm text-slate-500">Enter the exact non-secret IDs assigned in Booking.com and select the matching iRatePilot room.</p></div>
      <label className="text-sm font-medium">Booking.com connection
        <select className="input mt-2" required value={connectionId} onChange={(event) => setConnectionId(event.target.value)}>
          <option value="">Select test connection</option>
          {connections.map((connection) => {
            const property = properties.find((item) => item.id === connection.property_id);
            return <option key={connection.connection_id} value={connection.connection_id}>{property?.name || "Property"} · {connection.provider_property_id} · test</option>;
          })}
        </select>
      </label>
      <label className="text-sm font-medium">iRatePilot room
        <select className="input mt-2" required value={effectiveRoomId} onChange={(event) => setRoomId(event.target.value)}>
          <option value="">Select active room</option>
          {propertyRooms.map((room) => <option key={room.id} value={room.id}>{room.name} · {room.max_guests} guests · ${Number(room.base_rate).toFixed(2)}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium">Booking.com room type ID
        <input className="input mt-2" name="providerRoomTypeId" maxLength={80} pattern="[A-Za-z0-9_-]+" required />
      </label>
      <label className="text-sm font-medium">Booking.com rate plan ID
        <input className="input mt-2" name="providerRatePlanId" maxLength={80} pattern="[A-Za-z0-9_-]+" required />
      </label>
      <p className="text-xs text-amber-700">Mappings do not enable availability or reservations. Verify the IDs with your Booking.com connectivity account before saving.</p>
      {message && <p className="text-sm" role="status">{message}</p>}
      <button className="btn-primary" disabled={busy || !connectionId || !effectiveRoomId}>{busy ? "Saving…" : "Save room mapping"}</button>
    </form>

    <form className="card grid h-fit gap-4 p-6 xl:col-start-2" key={`${connectionId || "empty"}:sync`} onSubmit={queueSync}>
      <div><h2 className="text-xl font-semibold">Queue test rates & availability</h2><p className="mt-1 text-sm text-slate-500">Builds updates from saved inventory and mappings, then queues them for the approved test connection.</p></div>
      <label className="text-sm font-medium">Start date<input className="input mt-2" name="startDate" type="date" required /></label>
      <label className="text-sm font-medium">End date<input className="input mt-2" name="endDate" type="date" required /></label>
      <label className="text-sm font-medium">Currency<input className="input mt-2" name="currency" maxLength={3} pattern="[A-Z]{3}" defaultValue="USD" required /></label>
      <label className="text-sm font-medium">Rate amount basis<select className="input mt-2" name="priceBasis" defaultValue="before_tax"><option value="before_tax">Before tax</option><option value="after_tax">After tax</option></select></label>
      <p className="text-xs text-amber-700">This only queues test updates. Sending remains blocked until iRatePilot administrator approval, endpoint access, certification, and the test worker are enabled.</p>
      {syncMessage && <p className="text-sm" role="status">{syncMessage}</p>}
      <button className="btn-primary" disabled={syncBusy || !selectedConnection}>{syncBusy ? "Queueing…" : "Queue test sync"}</button>
    </form>
  </div>;
}
