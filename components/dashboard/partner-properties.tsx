"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { HotelAccessSelector } from "@/components/partner/hotel-access-selector";
import type { PartnerHotelAccess } from "@/lib/partner/hotel-access";
import { toPropertySlug } from "@/lib/property-slug";

type Property = { id: string; name: string; slug: string; type: string; star_rating: number; description?: string | null; city: string; country: string; active: boolean; image_url?: string | null; amenities?: string[]; readiness: { ready: boolean; missing: string[] } };

export function PartnerProperties() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyName, setPropertyName] = useState("");
  const [propertySlug, setPropertySlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [accessOptions, setAccessOptions] = useState<PartnerHotelAccess[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const loadRequestId = useRef(0);
  const selectedProperty = properties.find((property) => property.id === selectedPropertyId);
  const selectedAccess = accessOptions.find((option) => option.partnerId === selectedPartnerId)
    ?? (accessOptions.length === 1 ? accessOptions[0] : null);
  const delegatedManager = Boolean(selectedAccess && selectedAccess.role !== "owner");
  const partnerSelectionRequired = accessOptions.length > 1 && !selectedPartnerId;

  const load = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    const requestedPartnerId = selectedPartnerId;
    const query = requestedPartnerId ? `?partnerId=${encodeURIComponent(requestedPartnerId)}` : "";
    const response = await fetch(`/api/partner/properties${query}`);
    const body = await response.json();
    if (requestId !== loadRequestId.current) return;
    if (body.hotelAccess) {
      setAccessOptions(body.hotelAccess.options ?? []);
      if (!requestedPartnerId && body.hotelAccess.selectedPartnerId) {
        setSelectedPartnerId(body.hotelAccess.selectedPartnerId);
      }
    }
    if (response.ok) {
      setProperties(body.data ?? []);
      setMessage("");
    }
    else setMessage(body.error || "Properties could not be loaded.");
  }, [selectedPartnerId]);

  useEffect(() => {
    // Initial remote-data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      loadRequestId.current += 1;
    };
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData(formElement);
      const response = await fetch("/api/partner/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"), slug: form.get("slug"), type: form.get("type"),
          starRating: form.get("starRating"), description: form.get("description"),
          city: form.get("city"), region: form.get("region"), country: form.get("country"),
          imageUrl: form.get("imageUrl"),
          partnerId: selectedPartnerId || undefined,
          amenities: String(form.get("amenities")).split(",").map((item) => item.trim()).filter(Boolean)
        })
      });
      const body = await response.json();
      setMessage(response.ok ? body.message : typeof body.error === "string" ? body.error : "Check all property fields.");
      if (response.ok) {
        setSelectedPropertyId("");
        formElement.reset();
        await load();
      }
    } catch {
      setMessage("The property could not be submitted. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function updateContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (delegatedManager && selectedProperty?.active) {
      setMessage("Hotel managers may edit only properties that are already inactive.");
      return;
    }
    const formElement = event.currentTarget;
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData(formElement);
      const propertyId = String(form.get("propertyId"));
      const query = selectedPartnerId ? `?partnerId=${encodeURIComponent(selectedPartnerId)}` : "";
      const response = await fetch(`/api/partner/properties/${propertyId}${query}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: form.get("description"),
          imageUrl: form.get("imageUrl"),
          amenities: String(form.get("amenities")).split(",").map((item) => item.trim()).filter(Boolean)
        })
      });
      const body = await response.json();
      setMessage(response.ok ? body.message : body.error);
      if (response.ok) {
        setPropertyName("");
        setPropertySlug("");
        setSlugManuallyEdited(false);
        formElement.reset();
        await load();
      }
    } catch {
      setMessage("Property content could not be saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 grid gap-8">
      <HotelAccessSelector
        disabled={busy}
        onChange={(partnerId) => {
          loadRequestId.current += 1;
          setSelectedPartnerId(partnerId);
          setSelectedPropertyId("");
          setProperties([]);
          setMessage("");
        }}
        options={accessOptions}
        value={selectedPartnerId}
      />
      <section className="card border-violet-200 bg-violet-50/60 p-6">
        <span className="text-xs font-bold uppercase tracking-[.14em] text-violet-700">Verified intake first</span>
        <h2 className="mt-2 text-xl font-semibold text-slate-950">Before you add a hotel</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Create a property draft only after the hotel contact and authority path have been verified. The draft stays private until separate administrator review and publication approval.</p>
        <ol className="mt-5 grid gap-4 text-sm md:grid-cols-3">
          <li className="rounded-xl bg-white p-4"><strong className="block text-slate-950">1. Confirm authority</strong><span className="mt-1 block text-slate-600">Record the authorized owner or manager and every required brand, management-company, legal, or technology approval.</span></li>
          <li className="rounded-xl bg-white p-4"><strong className="block text-slate-950">2. Confirm content rights</strong><span className="mt-1 block text-slate-600">Use only approved names, descriptions, photos, amenities, room details, policies, rates, and pilot inventory.</span></li>
          <li className="rounded-xl bg-white p-4"><strong className="block text-slate-950">3. Bring complete data</strong><span className="mt-1 block text-slate-600">Have the property type, official rating, location, 120+ word description, HTTPS photo, and amenities ready.</span></li>
        </ol>
        <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-medium text-amber-900">Never enter passwords, one-time codes, API keys, PMS credentials, bank or card details, tax IDs, identity documents, or guest lists into a property draft.</p>
      </section>
      <div className="grid gap-8 xl:grid-cols-[1fr_420px]">
      <section className="card overflow-hidden">
        <div className="border-b p-6"><h2 className="text-xl font-semibold">Your properties</h2><p className="mt-1 text-sm text-slate-500">Listings stay private until administrator approval.</p></div>
        <div className="divide-y">
          {properties.length === 0 && <p className="p-6 text-sm text-slate-500">No property records yet.</p>}
          {properties.map((property) => <article key={property.id} className="flex flex-col justify-between gap-3 p-6 sm:flex-row sm:items-center"><div><strong>{property.name}</strong><p className="mt-1 text-sm text-slate-500">{property.star_rating}-star · {property.city}, {property.country}</p>{!property.readiness.ready && <p className="mt-2 text-xs text-amber-700">Still needed: {property.readiness.missing.join(", ")}</p>}</div><span className={property.active ? "badge bg-emerald-50 text-emerald-800" : property.readiness.ready ? "badge bg-blue-50 text-blue-800" : "badge"}>{property.active ? "Published" : property.readiness.ready ? "Ready for review" : "Draft incomplete"}</span></article>)}
        </div>
      </section>
      <div className="grid h-fit gap-8">
      <form onSubmit={submit} className="card grid gap-4 p-6">
        <div><h2 className="text-xl font-semibold">Add a property</h2><p id="property-draft-intro" className="mt-1 text-sm text-slate-500">Create a complete, inactive listing draft for an eligible 4- or 5-star property after verified intake.</p></div>
        <label className="text-sm font-medium">Official property name<input name="name" autoComplete="organization" aria-describedby="property-draft-intro" className="input mt-2" value={propertyName} onChange={(event) => { const name = event.target.value; setPropertyName(name); if (!slugManuallyEdited) setPropertySlug(toPropertySlug(name)); }} required minLength={3} /></label>
        <label className="text-sm font-medium">Property URL slug<input name="slug" className="input mt-2" value={propertySlug} onChange={(event) => { setPropertySlug(event.target.value.toLowerCase()); setSlugManuallyEdited(true); }} placeholder="example-grand-hotel" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /><small className="mt-1 block text-slate-500">Generated from the property name. Edit only if you need a different public URL.</small></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Property type<select name="type" className="input mt-2"><option value="hotel">Hotel</option><option value="resort">Resort</option><option value="vacation_home">Vacation home</option></select></label><label className="text-sm font-medium">Official star rating<select name="starRating" className="input mt-2" aria-describedby="star-rating-help"><option value="4">4 star</option><option value="5">5 star</option></select><small id="star-rating-help" className="mt-1 block text-slate-500">Use only the property’s verified classification.</small></label></div>
        <label className="text-sm font-medium">Detailed description<textarea name="description" className="input mt-2 min-h-32" minLength={120} maxLength={4000} placeholder="Describe the location, rooms, atmosphere, and distinctive guest experience." required /></label>
        <label className="text-sm font-medium">Primary photo URL<input name="imageUrl" type="url" className="input mt-2" placeholder="https://..." pattern="https://.*" required /><small className="mt-1 block text-slate-500">Use a public HTTPS image from your hotel or media host.</small></label>
        <label className="text-sm font-medium">Amenities, separated by commas<textarea name="amenities" className="input mt-2 min-h-24" placeholder="Pool, Spa, Free Wi-Fi, Parking" required /></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">City<input name="city" autoComplete="address-level2" className="input mt-2" required /></label><label className="text-sm font-medium">State/region<input name="region" autoComplete="address-level1" className="input mt-2" /></label></div>
        <label className="text-sm font-medium">Country<input name="country" autoComplete="country-name" className="input mt-2" defaultValue="United States" required /></label>
        {message && <p role="status" className="text-sm">{message}</p>}
        <button disabled={busy || partnerSelectionRequired} className="btn-primary">{busy ? "Creating…" : "Create inactive property draft"}</button>
      </form>
      <form key={selectedPropertyId || "empty"} onSubmit={updateContent} className="card grid gap-4 p-6">
        <div><h2 className="text-xl font-semibold">Listing content</h2><p className="mt-1 text-sm text-slate-500">{delegatedManager ? "Hotel managers may edit only listings that are already inactive. Published listings require an owner or administrator." : "Content changes return an approved listing to review."}</p></div>
        <label className="text-sm font-medium">Property<select name="propertyId" className="input mt-2" value={selectedPropertyId} onChange={(event) => setSelectedPropertyId(event.target.value)} required><option value="">Select property</option>{properties.map((property) => <option disabled={delegatedManager && property.active} key={property.id} value={property.id}>{property.name}{delegatedManager && property.active ? " — Published (owner or admin only)" : ""}</option>)}</select></label>
        <label className="text-sm font-medium">Detailed description<textarea name="description" className="input mt-2 min-h-32" minLength={120} maxLength={4000} defaultValue={selectedProperty?.description ?? ""} placeholder="Describe the location, rooms, atmosphere, and distinctive guest experience." required /></label>
        <label className="text-sm font-medium">Primary photo URL<input name="imageUrl" type="url" className="input mt-2" defaultValue={selectedProperty?.image_url ?? ""} placeholder="https://..." pattern="https://.*" required /><small className="mt-1 block text-slate-500">Use a public HTTPS image from your hotel or media host.</small></label>
        <label className="text-sm font-medium">Amenities, separated by commas<textarea name="amenities" className="input mt-2 min-h-24" defaultValue={(selectedProperty?.amenities ?? []).join(", ")} placeholder="Pool, Spa, Free Wi-Fi, Parking" required /></label>
        <button disabled={busy || !selectedProperty || (delegatedManager && selectedProperty.active)} className="btn-primary">Save property content</button>
      </form>
      </div>
      </div>
    </div>
  );
}
