"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Property = { id: string; name: string; active: boolean };
type Connection = {
  connection_id: string;
  property_id: string;
  provider_property_id: string;
  environment: "test";
  enabled: boolean;
  partner_approved: boolean;
  pii_compliance_approved: boolean;
  updated_at: string;
};

function status(connection: Connection) {
  if (!connection.partner_approved) return "partner approval pending";
  if (!connection.pii_compliance_approved) return "PII review pending";
  if (!connection.enabled) return "disabled";
  return "enabled";
}

export function PartnerBookingComOnboarding() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const activeProperties = useMemo(() => properties.filter((property) => property.active), [properties]);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/partner/integrations/booking-com", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error || "Booking.com setup could not be loaded.");
        return;
      }
      setProperties(body.properties ?? []);
      setConnections(body.connections ?? []);
      setPropertyId((current) => current || body.properties?.find((property: Property) => property.active)?.id || "");
    } catch {
      setMessage("Booking.com setup could not be loaded.");
    }
  }, []);

  useEffect(() => {
    // Initial remote-data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setMessage("");
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/partner/integrations/booking-com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          providerPropertyId: form.get("providerPropertyId"),
          clientId: form.get("clientId"),
          clientSecret: form.get("clientSecret"),
        }),
      });
      const body = await response.json();
      setMessage(response.ok ? body.message : body.error || "Booking.com test setup could not be saved.");
      if (response.ok) {
        formElement.reset();
        await load();
      }
    } catch {
      setMessage("Booking.com test setup could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_420px]">
    <section className="card overflow-hidden">
      <div className="border-b p-6">
        <h2 className="text-xl font-semibold">Booking.com connection status</h2>
        <p className="mt-1 text-sm text-slate-500">Only connection identifiers and approval status appear here. Secrets are never displayed again.</p>
      </div>
      <div className="divide-y">
        {connections.length === 0 && <p className="p-6 text-sm text-slate-500">No Booking.com test connection has been submitted.</p>}
        {connections.map((connection) => {
          const property = properties.find((item) => item.id === connection.property_id);
          return <article className="flex flex-wrap items-center justify-between gap-4 p-6" key={connection.connection_id}>
            <div>
              <strong>{property?.name || "Hotel property"}</strong>
              <p className="mt-1 text-sm text-slate-500">Booking.com property {connection.provider_property_id} · {connection.environment} environment</p>
            </div>
            <span className="badge">{status(connection)}</span>
          </article>;
        })}
      </div>
    </section>

    <form className="card grid h-fit gap-4 p-6" key={propertyId || "empty"} onSubmit={submit}>
      <div>
        <h2 className="text-xl font-semibold">Add Booking.com test account</h2>
        <p className="mt-1 text-sm text-slate-500">Use test credentials provided for an approved connectivity partner account. Credentials are encrypted before saving.</p>
      </div>
      <label className="text-sm font-medium">Property
        <select className="input mt-2" required value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>
          <option value="">Select property</option>
          {activeProperties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium">Booking.com property ID
        <input className="input mt-2" name="providerPropertyId" maxLength={80} pattern="[A-Za-z0-9_-]+" required />
      </label>
      <label className="text-sm font-medium">Test client ID
        <input className="input mt-2" name="clientId" autoComplete="username" maxLength={200} required />
      </label>
      <label className="text-sm font-medium">Test client secret
        <input className="input mt-2" name="clientSecret" type="password" autoComplete="new-password" maxLength={4096} required />
      </label>
      <p className="text-xs text-amber-700">Saving does not activate OTA traffic. iRatePilot must verify partner access, reservation permissions, property mappings, and certification before enabling this connection.</p>
      {message && <p className="text-sm" role="status">{message}</p>}
      <button className="btn-primary" disabled={busy || !propertyId}>{busy ? "Saving securely…" : "Save test account"}</button>
    </form>
  </div>;
}
