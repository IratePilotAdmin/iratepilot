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
        <div><h2 className="text-xl font-semibold">Add a property</h2><p className="mt-1 text-sm text-slate-500">Create a complete listing draft for an eligible 4- or 5-star property.</p></div>
        <label className="text-sm font-medium">Property name<input name="name" className="input mt-2" value={propertyName} onChange={(event) => { const name = event.target.value; setPropertyName(name); if (!slugManuallyEdited) setPropertySlug(toPropertySlug(name)); }} required minLength={3} /></label>
        <label className="text-sm font-medium">Property URL slug<input name="slug" className="input mt-2" value={propertySlug} onChange={(event) => { setPropertySlug(event.target.value.toLowerCase()); setSlugManuallyEdited(true); }} placeholder="example-grand-hotel" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /><small className="mt-1 block text-slate-500">Generated from the property name. Edit only if you need a different public URL.</small></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Type<select name="type" className="input mt-2"><option value="hotel">Hotel</option><option value="resort">Resort</option><option value="vacation_home">Vacation home</option></select></label><label className="text-sm font-medium">Rating<select name="starRating" className="input mt-2"><option value="4">4 star</option><option value="5">5 star</option></select></label></div>
        <label className="text-sm font-medium">Detailed description<textarea name="description" className="input mt-2 min-h-32" minLength={120} maxLength={4000} placeholder="Describe the location, rooms, atmosphere, and distinctive guest experience." required /></label>
        <label className="text-sm font-medium">Primary photo URL<input name="imageUrl" type="url" className="input mt-2" placeholder="https://..." pattern="https://.*" required /><small className="mt-1 block text-slate-500">Use a public HTTPS image from your hotel or media host.</small></label>
        <label className="text-sm font-medium">Amenities, separated by commas<textarea name="amenities" className="input mt-2 min-h-24" placeholder="Pool, Spa, Free Wi-Fi, Parking" required /></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">City<input name="city" className="input mt-2" required /></label><label className="text-sm font-medium">State/region<input name="region" className="input mt-2" /></label></div>
        <label className="text-sm font-medium">Country<input name="country" className="input mt-2" defaultValue="United States" required /></label>
        {message && <p role="status" className="text-sm">{message}</p>}
        <button disabled={busy || partnerSelectionRequired} className="btn-primary">{busy ? "Creating…" : "Create property draft"}</button>
      </form>
      <form key={selectedPropertyId || "empty"} onSubmit={updateContent} className="card grid gap-4 p-6">
        <div><h2 className="text-xl font-semibold">Listing content</h2><p className="mt-1 text-sm text-slate-500">Content changes return an approved listing to review.</p></div>
        <label className="text-sm font-medium">Property<select name="propertyId" className="input mt-2" value={selectedPropertyId} onChange={(event) => setSelectedPropertyId(event.target.value)} required><option value="">Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
        <label className="text-sm font-medium">Detailed description<textarea name="description" className="input mt-2 min-h-32" minLength={120} maxLength={4000} defaultValue={selectedProperty?.description ?? ""} placeholder="Describe the location, rooms, atmosphere, and distinctive guest experience." required /></label>
        <label className="text-sm font-medium">Primary photo URL<input name="imageUrl" type="url" className="input mt-2" defaultValue={selectedProperty?.image_url ?? ""} placeholder="https://..." pattern="https://.*" required /><small className="mt-1 block text-slate-500">Use a public HTTPS image from your hotel or media host.</small></label>
        <label className="text-sm font-medium">Amenities, separated by commas<textarea name="amenities" className="input mt-2 min-h-24" defaultValue={(selectedProperty?.amenities ?? []).join(", ")} placeholder="Pool, Spa, Free Wi-Fi, Parking" required /></label>
        <button disabled={busy || !selectedProperty} className="btn-primary">Save property content</button>
      </form>
      </div>
      </div>
    </div>
  );
}
