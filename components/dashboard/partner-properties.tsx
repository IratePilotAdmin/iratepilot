"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Property = { id: string; name: string; slug: string; type: string; star_rating: number; city: string; country: string; active: boolean; image_url?: string | null; amenities?: string[] };

export function PartnerProperties() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/partner/properties");
    const body = await response.json();
    if (response.ok) setProperties(body.data);
    else setMessage(body.error || "Properties could not be loaded.");
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
    try {
      const form = new FormData(formElement);
      const response = await fetch("/api/partner/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"), slug: form.get("slug"), type: form.get("type"),
          starRating: form.get("starRating"), description: form.get("description"),
          city: form.get("city"), region: form.get("region"), country: form.get("country")
        })
      });
      const body = await response.json();
      setMessage(response.ok ? body.message : typeof body.error === "string" ? body.error : "Check all property fields.");
      if (response.ok) {
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
      const response = await fetch(`/api/partner/properties/${propertyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: form.get("imageUrl"),
          amenities: String(form.get("amenities")).split(",").map((item) => item.trim()).filter(Boolean)
        })
      });
      const body = await response.json();
      setMessage(response.ok ? body.message : body.error);
      if (response.ok) {
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
    <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_420px]">
      <section className="card overflow-hidden">
        <div className="border-b p-6"><h2 className="text-xl font-semibold">Your properties</h2><p className="mt-1 text-sm text-slate-500">Listings stay private until administrator approval.</p></div>
        <div className="divide-y">
          {properties.length === 0 && <p className="p-6 text-sm text-slate-500">No property records yet.</p>}
          {properties.map((property) => <article key={property.id} className="flex flex-col justify-between gap-3 p-6 sm:flex-row sm:items-center"><div><strong>{property.name}</strong><p className="mt-1 text-sm text-slate-500">{property.star_rating}-star · {property.city}, {property.country}</p></div><span className={property.active ? "badge bg-emerald-50 text-emerald-800" : "badge"}>{property.active ? "Approved" : "Pending review"}</span></article>)}
        </div>
      </section>
      <div className="grid h-fit gap-8">
      <form onSubmit={submit} className="card grid gap-4 p-6">
        <div><h2 className="text-xl font-semibold">Submit a property</h2><p className="mt-1 text-sm text-slate-500">Only verified 4- and 5-star properties are eligible.</p></div>
        <label className="text-sm font-medium">Property name<input name="name" className="input mt-2" required minLength={3} /></label>
        <label className="text-sm font-medium">Property URL slug<input name="slug" className="input mt-2" placeholder="example-grand-hotel" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Type<select name="type" className="input mt-2"><option value="hotel">Hotel</option><option value="resort">Resort</option><option value="vacation_home">Vacation home</option></select></label><label className="text-sm font-medium">Rating<select name="starRating" className="input mt-2"><option value="4">4 star</option><option value="5">5 star</option></select></label></div>
        <label className="text-sm font-medium">Description<textarea name="description" className="input mt-2 min-h-28" minLength={30} required /></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">City<input name="city" className="input mt-2" required /></label><label className="text-sm font-medium">State/region<input name="region" className="input mt-2" /></label></div>
        <label className="text-sm font-medium">Country<input name="country" className="input mt-2" defaultValue="United States" required /></label>
        {message && <p role="status" className="text-sm">{message}</p>}
        <button disabled={busy} className="btn-primary">{busy ? "Submitting…" : "Submit for review"}</button>
      </form>
      <form onSubmit={updateContent} className="card grid gap-4 p-6">
        <div><h2 className="text-xl font-semibold">Photo and amenities</h2><p className="mt-1 text-sm text-slate-500">Content changes return an approved listing to review.</p></div>
        <label className="text-sm font-medium">Property<select name="propertyId" className="input mt-2" required><option value="">Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
        <label className="text-sm font-medium">Primary photo URL<input name="imageUrl" type="url" className="input mt-2" placeholder="https://..." required /></label>
        <label className="text-sm font-medium">Amenities, separated by commas<textarea name="amenities" className="input mt-2 min-h-24" placeholder="Pool, Spa, Free Wi-Fi, Parking" required /></label>
        <button disabled={busy || !properties.length} className="btn-primary">Save property content</button>
      </form>
      </div>
    </div>
  );
}
