"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type SynxisRequest = {
  synxis_hotel_id: string;
  requester_role: string;
  hotel_authorized: boolean;
  connection_status: string;
  last_validated_at: string | null;
};
type Property = {
  id: string;
  name: string;
  active: boolean;
  synxisRequest: SynxisRequest | null;
};
type AccessRole = "owner" | "general_manager" | "revenue_manager" | "sales_manager";

const requesterRoles = [
  ["hotel_owner", "Hotel owner"],
  ["general_manager", "General manager"],
  ["revenue_manager", "Revenue manager"],
  ["sales_manager", "Sales manager"],
] as const;

export function PartnerSynxisOnboarding() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [accessRole, setAccessRole] = useState<AccessRole | null>(null);
  const selected = useMemo(
    () => properties.find((property) => property.id === propertyId),
    [properties, propertyId],
  );

  const load = useCallback(async () => {
    const response = await fetch("/api/partner/integrations/crs/synxis", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) return setMessage(body.error || "SynXis requests could not be loaded.");
    setAccessRole(body.accessRole);
    setProperties(body.properties);
    setPropertyId((current) => current || body.properties[0]?.id || "");
  }, []);

  useEffect(() => {
    // Initial remote-data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  const availableRequesterRoles = accessRole === "owner"
    ? requesterRoles
    : requesterRoles.filter(([value]) => value === accessRole);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/partner/integrations/crs/synxis", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyId,
        synxisHotelId: form.get("synxisHotelId"),
        requesterRole: form.get("requesterRole"),
        hotelAuthorized: form.get("hotelAuthorized") === "on",
      }),
    });
    const body = await response.json();
    setMessage(response.ok ? body.message : body.error || "SynXis request could not be saved.");
    if (response.ok) await load();
    setBusy(false);
  }

  return <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_420px]">
    <section className="card overflow-hidden">
      <div className="border-b p-6">
        <h2 className="text-xl font-semibold">SynXis CRS onboarding</h2>
        <p className="mt-1 text-sm text-slate-500">This CRS request is separate from the hotel PMS connection and remains pending until administrator and Sabre approval.</p>
      </div>
      <div className="divide-y">
        {properties.length === 0 && <p className="p-6 text-sm text-slate-500">Add an approved property before requesting SynXis onboarding.</p>}
        {properties.map((property) => <article className="flex items-center justify-between gap-4 p-6" key={property.id}>
          <div>
            <strong>{property.name}</strong>
            <p className="mt-1 text-sm text-slate-500">{property.synxisRequest
              ? `SynXis Hotel ID ${property.synxisRequest.synxis_hotel_id} · ${property.synxisRequest.requester_role.replaceAll("_", " ")}`
              : "No SynXis onboarding request"}</p>
          </div>
          <span className="badge">{property.synxisRequest?.connection_status.replaceAll("_", " ") || "not requested"}</span>
        </article>)}
      </div>
    </section>

    <form className="card grid h-fit gap-4 p-6" key={propertyId || "empty"} onSubmit={submit}>
      <div>
        <h2 className="text-xl font-semibold">Request SynXis onboarding</h2>
        <p className="mt-1 text-sm text-slate-500">Submit non-secret identifiers only. Never enter passwords, API keys, tokens, or SOAP credentials.</p>
        {accessRole && <p className="mt-2 text-xs text-slate-500">Signed-in integration role: {accessRole.replaceAll("_", " ")}</p>}
      </div>
      <label className="text-sm font-medium">Property
        <select className="input mt-2" required value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>
          <option value="">Select property</option>
          {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium">SynXis Hotel ID
        <input className="input mt-2" defaultValue={selected?.synxisRequest?.synxis_hotel_id || ""} maxLength={120} name="synxisHotelId" pattern="[A-Za-z0-9._:/-]+" required />
        <small className="mt-1 block text-slate-500">Use the non-secret property identifier assigned by Sabre.</small>
      </label>
      <label className="text-sm font-medium">Requesting hotel representative
        <select className="input mt-2" defaultValue={selected?.synxisRequest?.requester_role || ""} name="requesterRole" required>
          <option value="">Select role</option>
          {availableRequesterRoles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input className="mt-1" defaultChecked={selected?.synxisRequest?.hotel_authorized || false} name="hotelAuthorized" required type="checkbox" />
        <span>I confirm the hotel owner or an authorized general, revenue, or sales manager approved this SynXis onboarding request.</span>
      </label>
      <p className="text-xs text-amber-700">Submitting this request does not connect the property or enable SynXis traffic. iRatePilot administrators must complete vendor approval, secure credential provisioning, mapping, and certification.</p>
      {message && <p className="text-sm" role="status">{message}</p>}
      <button className="btn-primary" disabled={busy || !propertyId} type="submit">{busy ? "Saving…" : "Save SynXis request"}</button>
    </form>
  </div>;
}
