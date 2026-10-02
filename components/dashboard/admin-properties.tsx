"use client";

import { useCallback, useEffect, useState } from "react";

type Property = {
  id: string;
  name: string;
  type: string;
  star_rating: number;
  city: string;
  country: string;
  active: boolean;
  readiness: { ready: boolean; missing: string[] };
  intakeApproval: {
    stateAvailable: boolean;
    verified: boolean;
  };
  commercialRelease: {
    stateAvailable: boolean;
    agreementEffective: boolean;
    reviewComplete: boolean;
  };
  partners?: { business_name?: string; status?: string } | null;
};

export function AdminProperties() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [publicationEnabled, setPublicationEnabled] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/properties");
    const body = await response.json();
    if (response.ok) {
      setProperties(body.data);
      setPublicationEnabled(body.publicationEnabled === true);
    }
    else setMessage(body.error || "Property review could not be loaded.");
  }, []);

  useEffect(() => {
    // Initial remote-data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function decide(id: string, active: boolean) {
    setMessage("");
    const response = await fetch(`/api/admin/properties/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active }) });
    const body = await response.json();
    setMessage(response.ok ? `${body.data.name} was ${active ? "approved" : "returned to review"}.` : body.error);
    if (response.ok) await load();
  }

  return <section className="card mt-8 overflow-hidden"><div className="border-b p-6"><h2 className="text-xl font-semibold">Property review queue</h2><p className="mt-1 text-sm text-slate-500">Approval controls whether a property is eligible for traveler search.</p>{!publicationEnabled && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>Production publication is locked.</strong> Complete the hotel, supplier, legal, payment, support, and release approvals before enabling the server-side publication gate.</p>}{message && <p role="status" className="mt-3 text-sm">{message}</p>}</div><div className="divide-y">{properties.length === 0 && <p className="p-6 text-sm text-slate-500">No properties awaiting review.</p>}{properties.map((property) => {
    const partnerApproved = property.partners?.status === "approved";
    const intakeApproved = property.intakeApproval.stateAvailable && property.intakeApproval.verified;
    const commercialReady = property.commercialRelease.stateAvailable && property.commercialRelease.agreementEffective && property.commercialRelease.reviewComplete;
    const publishable = property.readiness.ready && partnerApproved && intakeApproved && commercialReady && publicationEnabled;
    const buttonLabel = property.active
      ? "Published"
      : !publicationEnabled
        ? "Release locked"
        : !property.intakeApproval.stateAvailable
          ? "Intake check unavailable"
          : !property.intakeApproval.verified
            ? "Verified intake required"
        : !partnerApproved
          ? "Partner pending"
          : !property.readiness.ready
            ? "Incomplete"
            : !property.commercialRelease.stateAvailable
              ? "Release check unavailable"
              : !property.commercialRelease.agreementEffective
                ? "Agreement required"
                : !property.commercialRelease.reviewComplete
                  ? "Commercial review required"
                  : "Approve & publish";
    return <article key={property.id} className="grid gap-4 p-6 md:grid-cols-[1fr_auto] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><strong>{property.name}</strong><span className={`rounded-full px-2 py-1 text-xs font-semibold ${intakeApproved ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{intakeApproved ? "Verified intake linked" : "Excluded from production readiness"}</span></div><p className="mt-1 text-sm text-slate-500">{property.star_rating}-star {property.type.replace("_", " ")} · {property.city}, {property.country} · {property.partners?.business_name || "Partner"}</p>{!property.intakeApproval.stateAvailable && <p className="mt-2 text-xs text-rose-700">Cannot publish: hotel intake approval evidence could not be verified.</p>}{property.intakeApproval.stateAvailable && !property.intakeApproval.verified && <p className="mt-2 text-xs text-amber-700">Cannot publish yet: a verified approved hotel application must be linked to this property.</p>}{intakeApproved && !partnerApproved && <p className="mt-2 text-xs text-amber-700">Cannot publish yet: partner approval required</p>}{intakeApproved && partnerApproved && !property.readiness.ready && <p className="mt-2 text-xs text-amber-700">Cannot publish yet: {property.readiness.missing.join(", ")}</p>}{intakeApproved && partnerApproved && property.readiness.ready && !property.commercialRelease.stateAvailable && <p className="mt-2 text-xs text-rose-700">Cannot publish: commercial release evidence could not be verified.</p>}{intakeApproved && partnerApproved && property.readiness.ready && property.commercialRelease.stateAvailable && !property.commercialRelease.agreementEffective && <p className="mt-2 text-xs text-amber-700">Cannot publish yet: a currently effective, executed hotel agreement is required.</p>}{intakeApproved && partnerApproved && property.readiness.ready && property.commercialRelease.agreementEffective && !property.commercialRelease.reviewComplete && <p className="mt-2 text-xs text-amber-700">Cannot publish yet: complete the accountable commercial review.</p>}{intakeApproved && partnerApproved && property.readiness.ready && commercialReady && !publicationEnabled && <p className="mt-2 text-xs text-amber-700">Hotel evidence is complete; production release approval is still required.</p>}</div><div className="flex gap-2"><button disabled={property.active || !publishable} onClick={() => decide(property.id, true)} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50">{buttonLabel}</button>{property.active && <button onClick={() => decide(property.id, false)} className="btn-secondary">Pause</button>}</div></article>;
  })}</div></section>;
}
