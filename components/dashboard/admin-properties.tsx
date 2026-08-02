"use client";

import { useCallback, useEffect, useState } from "react";

type Review = { active: boolean; note: string; created_at: string };
type Property = { id: string; name: string; type: string; star_rating: number; city: string; country: string; active: boolean; readiness: { ready: boolean; missing: string[] }; latest_review?: Review | null; partners?: { business_name?: string } | null };

export function AdminProperties() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/properties");
    const body = await response.json();
    if (response.ok) setProperties(body.data);
    else setMessage(body.error || "Property review could not be loaded.");
  }, []);

  useEffect(() => {
    // Initial remote-data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function decide(id: string, active: boolean) {
    setMessage("");
    const note = notes[id]?.trim() || "";
    if (note.length < 5) {
      setMessage("Add a review note with at least 5 characters.");
      return;
    }

    setBusyId(id);
    try {
      const response = await fetch(`/api/admin/properties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active, note }),
      });
      const body = await response.json();
      setMessage(response.ok ? `${body.data.name} was ${active ? "approved and published" : "sent review feedback"}.` : body.error);
      if (response.ok) {
        setNotes((current) => ({ ...current, [id]: "" }));
        await load();
      }
    } catch {
      setMessage("The review decision could not be saved. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  return <section className="card mt-8 overflow-hidden"><div className="border-b p-6"><h2 className="text-xl font-semibold">Property review queue</h2><p className="mt-1 text-sm text-slate-500">Every publish or change request requires a note and is saved to the review history.</p>{message && <p role="status" className="mt-3 text-sm">{message}</p>}</div><div className="divide-y">{properties.length === 0 && <p className="p-6 text-sm text-slate-500">No properties awaiting review.</p>}{properties.map((property) => <article key={property.id} className="grid gap-4 p-6 lg:grid-cols-[1fr_360px]"><div><strong>{property.name}</strong><p className="mt-1 text-sm text-slate-500">{property.star_rating}-star {property.type.replace("_", " ")} · {property.city}, {property.country} · {property.partners?.business_name || "Partner"}</p>{!property.readiness.ready && <p className="mt-2 text-xs text-amber-700">Cannot publish yet: {property.readiness.missing.join(", ")}</p>}{property.latest_review && <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><strong>Latest review · {property.latest_review.active ? "published" : "changes requested"}</strong><p className="mt-1">{property.latest_review.note}</p><span className="mt-1 block text-xs text-slate-500">{new Date(property.latest_review.created_at).toLocaleDateString()}</span></div>}</div><div className="grid gap-3"><label className="text-sm font-medium">Review note<textarea value={notes[property.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [property.id]: event.target.value }))} className="input mt-2 min-h-24" maxLength={1000} placeholder={property.active ? "Explain what changed and how the partner can republish." : "Record verification results or explain what the partner must change."} /></label><div className="flex flex-wrap gap-2"><button disabled={property.active || !property.readiness.ready || busyId === property.id || (notes[property.id]?.trim().length || 0) < 5} onClick={() => decide(property.id, true)} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50">{property.active ? "Published" : property.readiness.ready ? "Approve & publish" : "Incomplete"}</button><button disabled={busyId === property.id || (notes[property.id]?.trim().length || 0) < 5} onClick={() => decide(property.id, false)} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50">{property.active ? "Pause & request changes" : "Request changes"}</button></div></div></article>)}</div></section>;
}
