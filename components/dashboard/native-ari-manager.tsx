"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Room = { id: string; name: string; active: boolean };
type ReservationSource = {
  connection_id: string;
  property_id: string;
  pms_property_id: string;
  enabled: boolean;
  propertyName: string;
  propertyActive: boolean;
  partnerStatus: string;
  rooms: Room[];
};
type Mapping = { roomTypeId: string; ratePlanId: string; otaRoomId: string };
type NativeConnection = {
  connection_id: string;
  property_id: string;
  pms_property_id: string;
  enabled: boolean;
  latest_source_version: number;
  updated_at: string;
  irp_pms_native_ari_mappings: Array<{ ota_room_id: string; pms_room_type_id: string; pms_rate_plan_id: string }>;
};
type AuditEvent = { id: number; connection_id: string; actor_id: string | null; action: string; created_at: string };
type State = { receiverEnabled: boolean; connections: NativeConnection[]; audit: AuditEvent[]; reservationSources: ReservationSource[] };

const emptyMapping = (): Mapping => ({ roomTypeId: "", ratePlanId: "", otaRoomId: "" });

export function NativeAriManager() {
  const [data, setData] = useState<State | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [mappings, setMappings] = useState<Mapping[]>([emptyMapping()]);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const source = useMemo(() => data?.reservationSources.find((item) => item.connection_id === sourceId) ?? null, [data, sourceId]);

  async function refresh() {
    const response = await fetch("/api/admin/integrations/native-ari", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Native ARI settings could not be loaded.");
    setData(body as State);
    setSourceId((current) => current || body.reservationSources?.[0]?.connection_id || "");
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/integrations/native-ari", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Native ARI settings could not be loaded.");
        if (!active) return;
        setData(body as State);
        setSourceId(body.reservationSources?.[0]?.connection_id || "");
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Native ARI settings could not be loaded.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function updateMapping(index: number, key: keyof Mapping, value: string) {
    setMappings((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  }

  function generateSecret() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    setSecret(btoa(Array.from(bytes, (value) => String.fromCharCode(value)).join("")));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!source) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/integrations/native-ari", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: source.connection_id,
          propertyId: source.property_id,
          pmsPropertyId: source.pms_property_id,
          signingSecret: secret,
          mappings,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Native ARI configuration could not be saved.");
      setSecret(""); setMappings([emptyMapping()]);
      setMessage("Connection and mappings saved disabled. Keep the global receiver off until sandbox acceptance is complete.");
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Native ARI configuration could not be saved."); }
    finally { setBusy(false); }
  }

  async function setEnabled(connectionId: string, enabled: boolean) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/integrations/native-ari", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, enabled }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Connection state could not be changed.");
      setMessage(body.message || "Connection state updated.");
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Connection state could not be changed."); }
    finally { setBusy(false); }
  }

  if (loading) return <section className="card mt-6 p-6"><h2 className="text-xl font-semibold">Native PMS ARI connector</h2><p className="mt-3 text-sm text-slate-600" role="status">Loading connector settings…</p></section>;
  if (error && !data) return <section className="card mt-6 p-6"><h2 className="text-xl font-semibold">Native PMS ARI connector</h2><p className="mt-3 text-sm text-amber-800" role="status">{error}</p><p className="mt-2 text-sm text-slate-500">Apply the reviewed receiver migration and deploy the API routes before configuring this connection.</p></section>;

  return <section className="card mt-6 overflow-hidden">
    <div className="border-b p-6">
      <span className="text-xs uppercase tracking-wider text-slate-500">Administrators only · iRatePilot PMS</span>
      <h2 className="mt-2 text-xl font-semibold">Native availability and rate connection</h2>
      <p className="mt-2 text-sm text-slate-600">Send signed daily availability and rates from PMS to iRatePilot.com. This does not confirm OTA reservations in the PMS; reservation delivery is a separate workflow.</p>
      <p className={`mt-3 text-sm font-semibold ${data?.receiverEnabled ? "text-amber-700" : "text-slate-600"}`} role="status">{data?.receiverEnabled ? "Global receiver is enabled · only enable a property after its sandbox acceptance." : "Global receiver is off. Property connections remain unable to send updates."}</p>
    </div>

    <div className="grid gap-6 p-6 xl:grid-cols-2">
      <form className="grid content-start gap-4" onSubmit={(event) => void save(event)}>
        <div><h3 className="font-semibold">Prepare a disabled connection</h3><p className="mt-1 text-sm text-slate-500">Choose an active reservation connection first. Configuration saves disabled.</p></div>
        <label className="text-sm font-medium">OTA property and PMS connection
          <select className="input mt-2" value={sourceId} onChange={(event) => { setSourceId(event.target.value); setMappings([emptyMapping()]); setSecret(""); }} required>
            <option value="">Select an enabled PMS reservation connection</option>
            {(data?.reservationSources ?? []).map((item) => <option key={item.connection_id} value={item.connection_id}>{item.propertyName} · {item.connection_id}</option>)}
          </select>
        </label>
        {source && <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">PMS property: <strong>{source.pms_property_id}</strong> · iRatePilot property: <strong>{source.property_id}</strong></div>}
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <label className="text-sm font-medium">PMS signing secret
            <input className="input mt-2" type="password" autoComplete="new-password" value={secret} onChange={(event) => setSecret(event.target.value)} minLength={32} maxLength={512} required />
          </label>
          <button className="btn-secondary self-end" type="button" disabled={!source} onClick={generateSecret}>Generate 256-bit secret</button>
        </div>
        <p className="-mt-2 text-xs text-slate-500">Copy the generated value into the PMS connector’s secret configuration before saving. The OTA stores it encrypted and never returns it.</p>
        <div className="grid gap-3">
          {mappings.map((mapping, index) => <fieldset className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3" key={index}>
            <legend className="px-1 text-xs font-semibold text-slate-600">Room/rate mapping {index + 1}</legend>
            <label className="text-xs font-medium">PMS room type ID<input className="input mt-1" value={mapping.roomTypeId} onChange={(event) => updateMapping(index, "roomTypeId", event.target.value.trim())} maxLength={128} required /></label>
            <label className="text-xs font-medium">PMS rate plan ID<input className="input mt-1" value={mapping.ratePlanId} onChange={(event) => updateMapping(index, "ratePlanId", event.target.value.trim())} maxLength={128} required /></label>
            <label className="text-xs font-medium">iRatePilot room<select className="input mt-1" value={mapping.otaRoomId} onChange={(event) => updateMapping(index, "otaRoomId", event.target.value)} required><option value="">Select a room</option>{(source?.rooms ?? []).map((room) => <option key={room.id} value={room.id}>{room.name} · {room.id}</option>)}</select></label>
            {mappings.length > 1 && <button className="text-left text-xs text-red-700 sm:col-span-3" type="button" onClick={() => setMappings((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>Remove mapping</button>}
          </fieldset>)}
          <button className="btn-secondary justify-self-start" type="button" disabled={!source || mappings.length >= 200} onClick={() => setMappings((rows) => [...rows, emptyMapping()])}>Add room/rate mapping</button>
        </div>
        <button className="btn-primary justify-self-start" type="submit" disabled={busy || !source || !secret || !source.propertyActive || source.partnerStatus !== "approved" || !source.rooms.length}>{busy ? "Saving…" : "Save disabled connection"}</button>
      </form>

      <div className="grid content-start gap-5">
        <div><h3 className="font-semibold">Saved connections</h3><p className="mt-1 text-sm text-slate-500">Enablement requires the global receiver flag and database checks for this exact property.</p></div>
        {!data?.connections.length ? <p className="text-sm text-slate-500">No native ARI connections are configured.</p> : data.connections.map((connection) => <article className="rounded-lg border p-4" key={connection.connection_id}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><strong>{connection.connection_id}</strong><p className="mt-1 text-xs text-slate-500">PMS property {connection.pms_property_id} · source version {connection.latest_source_version}</p></div><span className={`text-sm font-semibold ${connection.enabled ? "text-emerald-700" : "text-slate-500"}`}>{connection.enabled ? "Enabled" : "Disabled"}</span></div>
          <ul className="mt-3 grid gap-1 text-xs text-slate-600">{connection.irp_pms_native_ari_mappings.map((mapping) => <li key={`${mapping.pms_room_type_id}/${mapping.pms_rate_plan_id}`}>PMS {mapping.pms_room_type_id}/{mapping.pms_rate_plan_id} → iRatePilot room {mapping.ota_room_id}</li>)}</ul>
          <button className="btn-secondary mt-4" type="button" disabled={busy || (!connection.enabled && !data.receiverEnabled)} onClick={() => void setEnabled(connection.connection_id, !connection.enabled)}>{connection.enabled ? "Disable connection" : "Enable after sandbox acceptance"}</button>
        </article>)}
        <div><h3 className="font-semibold">Recent configuration audit</h3>{!data?.audit.length ? <p className="mt-1 text-sm text-slate-500">No configuration or activation events recorded.</p> : <ul className="mt-2 grid gap-2 text-xs text-slate-600">{data.audit.map((item) => <li key={item.id}>{new Date(item.created_at).toLocaleString()} · {item.action} · {item.connection_id}</li>)}</ul>}</div>
      </div>
    </div>
    {(error || message) && <p className={`border-t px-6 py-3 text-sm ${error ? "text-red-700" : "text-emerald-700"}`} role={error ? "alert" : "status"}>{error || message}</p>}
  </section>;
}
