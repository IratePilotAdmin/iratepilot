"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

type Room = { id: string; name: string; active: boolean };
type Property = { id: string; name: string; rooms: Room[] };
type Mapping = { roomTypeId: string; ratePlanId: string; otaRoomId: string };
type Connection = {
  connection_id: string;
  property_id: string;
  pms_property_id: string;
  enabled: boolean;
  latest_source_version: number;
  updated_at: string;
  irp_pms_native_ari_mappings: Array<{ ota_room_id: string; pms_room_type_id: string; pms_rate_plan_id: string }>;
};
type Payload = { properties: Property[]; connections: Connection[]; error?: string };
const emptyMapping = (): Mapping => ({ roomTypeId: "", ratePlanId: "", otaRoomId: "" });

function NativeAriActivation({ connectionId, enabled, onChanged }: { connectionId: string; enabled: boolean; onChanged: () => Promise<void> }) {
  const [confirmation, setConfirmation] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const requestId = useRef<string | null>(null);
  const nextEnabled = !enabled;
  const expected = `${nextEnabled ? "ENABLE" : "DISABLE"} ${connectionId}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    requestId.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/admin/integrations/native-ari", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: requestId.current, connectionId, enabled: nextEnabled, confirmation, evidenceReference: nextEnabled ? evidenceReference : null }),
      });
      const body = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error || "Native ARI status could not be changed.");
      requestId.current = null;
      setConfirmation("");
      setEvidenceReference("");
      setMessage(body.message || "Native ARI status updated.");
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Native ARI status could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  return <details className="mt-3 w-full rounded border p-3">
    <summary className="cursor-pointer text-xs font-semibold">{enabled ? "Disable ARI receiving" : "Enable ARI receiving"}</summary>
    <p className="mt-2 text-xs text-slate-600">{enabled ? "Disabling stops new ARI updates immediately." : "Before enabling, verify the correct property, active room/rate mappings, matching enabled booking connector, and successful sandbox round trip. The evidence reference is an admin attestation and is not independently verified by this form."}</p>
    {error && <p className="mt-2 text-xs text-red-700" role="alert">{error}</p>}
    {message && <p className="mt-2 text-xs text-slate-700" role="status">{message}</p>}
    <form className="mt-3 grid gap-3" onSubmit={submit}>
      {!enabled && <label className="text-xs font-medium">Sandbox / approval evidence reference<input className="input mt-1" value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} minLength={5} maxLength={160} pattern="[A-Za-z0-9][A-Za-z0-9._:/ -]{4,159}" required autoComplete="off" placeholder="Ticket, test report, or approval ID" /></label>}
      <label className="text-xs font-medium">Type <code>{expected}</code> to confirm<input className="input mt-1" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required autoComplete="off" /></label>
      <button className={enabled ? "btn-secondary w-fit text-xs" : "btn-primary w-fit text-xs"} type="submit" disabled={busy || confirmation !== expected}>{busy ? "Updating…" : expected}</button>
    </form>
  </details>;
}

export function NativeAriSetup() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionId, setConnectionId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [pmsPropertyId, setPmsPropertyId] = useState("");
  const [secret, setSecret] = useState("");
  const [mappings, setMappings] = useState<Mapping[]>([emptyMapping()]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selectedProperty = useMemo(() => properties.find((property) => property.id === propertyId), [properties, propertyId]);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/integrations/native-ari", { cache: "no-store" });
      const body = await response.json() as Payload;
      if (!response.ok) throw new Error(body.error || "Native PMS connections could not be loaded.");
      setProperties(body.properties ?? []);
      setConnections(body.connections ?? []);
      setPropertyId((current) => current || body.properties?.[0]?.id || "");
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Native PMS connections could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial remote-data synchronization; state updates occur only after the fetch resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  function edit(connection: Connection) {
    setConnectionId(connection.connection_id);
    setPropertyId(connection.property_id);
    setPmsPropertyId(connection.pms_property_id);
    setSecret("");
    const current = connection.irp_pms_native_ari_mappings.map((mapping) => ({
      roomTypeId: mapping.pms_room_type_id,
      ratePlanId: mapping.pms_rate_plan_id,
      otaRoomId: mapping.ota_room_id,
    }));
    setMappings(current.length ? current : [emptyMapping()]);
    setMessage("Re-enter the shared signing secret to save this connection. Its saved value cannot be viewed.");
    setError("");
    document.getElementById("native-ari-setup-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/integrations/native-ari", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, propertyId, pmsPropertyId, signingSecret: secret, mappings }),
      });
      const body = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error || "Native PMS setup could not be saved.");
      setSecret("");
      setMessage(body.message || "Connection saved disabled.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Native PMS setup could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="card mt-6 p-6" aria-labelledby="native-ari-heading">
    <span className="text-xs uppercase tracking-wider text-slate-500">iRatePilot native connection</span>
    <h2 className="mt-2 text-xl font-semibold" id="native-ari-heading">Connect iRatePilot PMS room rates</h2>
    <p className="mt-2 text-sm text-slate-600">Map each PMS room type and rate plan to an active room on this marketplace property. Use the same signing secret in the PMS connection and here. The secret is encrypted on the server and never shown after saving.</p>
    <p className="mt-2 text-sm font-medium text-amber-800">You can save this configuration while the booking connector is off. Saving keeps ARI disabled; enable neither reservation nor rate traffic until mappings and sandbox tests are reviewed. Applying ARI later also requires the matching PMS booking connector to be enabled.</p>
    {error && <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}
    {message && <p className="mt-4 text-sm text-slate-700" role="status">{message}</p>}
    {loading ? <p className="mt-4 text-sm text-slate-500" role="status">Loading approved marketplace properties and saved connections…</p> : properties.length === 0 ? <p className="mt-4 text-sm text-amber-700">No active approved marketplace properties are available for native PMS setup.</p> : <>
      {connections.length > 0 && <div className="mt-5 space-y-2" aria-label="Saved native PMS connections">{connections.map((connection) => <article key={connection.connection_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <div><strong>{properties.find((property) => property.id === connection.property_id)?.name || "Marketplace property"}</strong><p className="text-xs text-slate-500">{connection.connection_id} · PMS property {connection.pms_property_id} · {connection.irp_pms_native_ari_mappings.length} mappings · {connection.enabled ? "Enabled" : "Disabled"} · version {connection.latest_source_version}</p></div>
        <NativeAriActivation connectionId={connection.connection_id} enabled={connection.enabled} onChanged={load}/>
        <button className="btn-secondary text-xs" type="button" disabled={busy} onClick={() => edit(connection)}>Edit mapping</button>
      </article>)}</div>}
      <form id="native-ari-setup-form" className="mt-5 grid gap-4" onSubmit={save}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium">Marketplace property<select className="input mt-2" value={propertyId} onChange={(event) => setPropertyId(event.target.value)} required><option value="">Choose property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
          <label className="text-sm font-medium">PMS connection ID<input className="input mt-2" value={connectionId} onChange={(event) => setConnectionId(event.target.value)} pattern="[A-Za-z0-9_-]{1,80}" maxLength={80} required autoComplete="off" placeholder="Copy from PMS → Connections" /></label>
          <label className="text-sm font-medium">PMS property ID<input className="input mt-2" value={pmsPropertyId} onChange={(event) => setPmsPropertyId(event.target.value)} pattern="[A-Za-z0-9_-]{1,128}" maxLength={128} required autoComplete="off" placeholder="Property identifier from PMS" /></label>
          <label className="text-sm font-medium">Shared signing secret<input className="input mt-2" type="password" value={secret} onChange={(event) => setSecret(event.target.value)} minLength={32} maxLength={512} required autoComplete="new-password" placeholder="Enter the same secret saved in the PMS" /></label>
        </div>
        <fieldset className="grid gap-3 rounded-lg border p-4">
          <legend className="px-1 text-sm font-semibold">Room and rate plan mappings</legend>
          <p className="text-xs text-slate-500">Copy the exact room-type ID and rate-plan ID from the PMS. Each pair must point to a different active marketplace room.</p>
          {mappings.map((mapping, index) => <div className="grid items-end gap-3 md:grid-cols-[1fr_1fr_1fr_auto]" key={index}>
            <label className="text-xs font-medium">PMS room-type ID<input className="input mt-1" value={mapping.roomTypeId} onChange={(event) => setMappings((items) => items.map((item, i) => i === index ? { ...item, roomTypeId: event.target.value } : item))} pattern="[A-Za-z0-9_-]{1,128}" maxLength={128} required autoComplete="off" /></label>
            <label className="text-xs font-medium">PMS rate-plan ID<input className="input mt-1" value={mapping.ratePlanId} onChange={(event) => setMappings((items) => items.map((item, i) => i === index ? { ...item, ratePlanId: event.target.value } : item))} pattern="[A-Za-z0-9_-]{1,128}" maxLength={128} required autoComplete="off" /></label>
            <label className="text-xs font-medium">Marketplace room<select className="input mt-1" value={mapping.otaRoomId} onChange={(event) => setMappings((items) => items.map((item, i) => i === index ? { ...item, otaRoomId: event.target.value } : item))} required><option value="">Choose active room</option>{(selectedProperty?.rooms ?? []).filter((room) => room.active).map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
            <button className="btn-secondary text-xs" type="button" disabled={busy || mappings.length <= 1} onClick={() => setMappings((items) => items.filter((_, i) => i !== index))}>Remove</button>
          </div>)}
          <button className="btn-secondary w-fit text-xs" type="button" disabled={busy || mappings.length >= 200} onClick={() => setMappings((items) => [...items, emptyMapping()])}>Add room/rate mapping</button>
        </fieldset>
        <div className="flex flex-wrap gap-3"><button className="btn-primary" type="submit" disabled={busy || loading}>{busy ? "Saving disabled connection…" : "Save disabled connection"}</button><button className="btn-secondary" type="button" disabled={busy} onClick={() => { setConnectionId(""); setPmsPropertyId(""); setSecret(""); setMappings([emptyMapping()]); setMessage(""); setError(""); }}>Clear form</button></div>
      </form>
    </>}
  </section>;
}
