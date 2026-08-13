"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Provider = { id: string; name: string; vendor: string; certificationRequired: boolean };
type Connection = {
  provider_id: string;
  external_property_code: string;
  hotel_authorized: boolean;
  room_type_mapping: string | null;
  rate_plan_mapping: string | null;
  tax_fee_mapping: string | null;
  cancellation_policy_mapping: string | null;
  connection_status: string;
  last_validated_at: string | null;
};
type Property = { id: string; name: string; active: boolean; connection: Connection | null };

export function PartnerPmsConnections() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = useMemo(() => properties.find((property) => property.id === propertyId), [properties, propertyId]);

  const load = useCallback(async () => {
    const response = await fetch("/api/partner/integrations/pms", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) return setMessage(body.error || "PMS connections could not be loaded.");
    setProviders(body.providers);
    setProperties(body.properties);
    setPropertyId((current) => current || body.properties[0]?.id || "");
  }, []);

  useEffect(() => {
    // Initial remote-data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/partner/integrations/pms", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyId,
        providerId: form.get("providerId"),
        externalPropertyCode: form.get("externalPropertyCode"),
        hotelAuthorized: form.get("hotelAuthorized") === "on",
        roomTypeMapping: form.get("roomTypeMapping"),
        ratePlanMapping: form.get("ratePlanMapping"),
        taxFeeMapping: form.get("taxFeeMapping"),
        cancellationPolicyMapping: form.get("cancellationPolicyMapping"),
      }),
    });
    const body = await response.json();
    setMessage(response.ok ? body.message : body.error || "PMS connection could not be saved.");
    if (response.ok) await load();
    setBusy(false);
  }

  return <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_420px]">
    <section className="card overflow-hidden">
      <div className="border-b p-6"><h2 className="text-xl font-semibold">Hotel PMS status</h2><p className="mt-1 text-sm text-slate-500">Credentials are exchanged securely after vendor approval and are never entered in this portal.</p></div>
      <div className="divide-y">{properties.length === 0 && <p className="p-6 text-sm text-slate-500">Add an approved property before configuring a PMS.</p>}{properties.map((property) => {
        const provider = providers.find((item) => item.id === property.connection?.provider_id);
        return <article key={property.id} className="flex items-center justify-between gap-4 p-6"><div><strong>{property.name}</strong><p className="mt-1 text-sm text-slate-500">{provider ? `${provider.name} Â· ${property.connection?.external_property_code}` : "No PMS declared"}</p></div><span className="badge">{property.connection?.connection_status.replaceAll("_", " ") || "not configured"}</span></article>;
      })}</div>
    </section>
    <form key={propertyId || "empty"} onSubmit={submit} className="card grid h-fit gap-4 p-6">
      <div><h2 className="text-xl font-semibold">Declare a PMS</h2><p className="mt-1 text-sm text-slate-500">Select the system used by this hotel. Do not paste passwords, API keys, or client secrets.</p></div>
      <label className="text-sm font-medium">Property<select className="input mt-2" value={propertyId} onChange={(event) => setPropertyId(event.target.value)} required><option value="">Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
      <label className="text-sm font-medium">PMS provider<select name="providerId" className="input mt-2" defaultValue={selected?.connection?.provider_id || ""} required><option value="">Select provider</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} â€” {provider.vendor}</option>)}</select></label>
      <label className="text-sm font-medium">Hotel/property code<input name="externalPropertyCode" className="input mt-2" defaultValue={selected?.connection?.external_property_code || ""} maxLength={120} required /><small className="mt-1 block text-slate-500">Use the non-secret identifier assigned to the hotel in its PMS.</small></label>
      <fieldset className="grid gap-4 border-t pt-4">
        <legend className="text-sm font-semibold">Pilot-hotel authorization and mappings</legend>
        <label className="flex items-start gap-3 text-sm"><input className="mt-1" name="hotelAuthorized" type="checkbox" defaultChecked={selected?.connection?.hotel_authorized || false} /><span>I confirm that the hotel owner or authorized manager approved this PMS connection.</span></label>
        <label className="text-sm font-medium">Room-type mapping<textarea name="roomTypeMapping" className="input mt-2 min-h-24" defaultValue={selected?.connection?.room_type_mapping || ""} maxLength={4000} placeholder="Example: iRatePilot Deluxe King = PMS room type DLXK" /><small className="mt-1 block text-slate-500">List non-secret iRatePilot room types and their PMS codes.</small></label>
        <label className="text-sm font-medium">Rate-plan mapping<textarea name="ratePlanMapping" className="input mt-2 min-h-24" defaultValue={selected?.connection?.rate_plan_mapping || ""} maxLength={4000} placeholder="Example: Flexible = PMS rate plan BAR" /></label>
        <label className="text-sm font-medium">Taxes and fees<textarea name="taxFeeMapping" className="input mt-2 min-h-24" defaultValue={selected?.connection?.tax_fee_mapping || ""} maxLength={4000} placeholder="List applicable tax and fee codes; do not include payment data." /></label>
        <label className="text-sm font-medium">Cancellation-policy mapping<textarea name="cancellationPolicyMapping" className="input mt-2 min-h-24" defaultValue={selected?.connection?.cancellation_policy_mapping || ""} maxLength={4000} placeholder="Map each sellable policy to its PMS policy code." /></label>
      </fieldset>
      {message && <p role="status" className="text-sm">{message}</p>}
      <button className="btn-primary" disabled={busy || !propertyId}>{busy ? "Savingâ€¦" : "Save PMS declaration"}</button>
    </form>
  </div>;
}

