"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Application = {
  id: string;
  property_name: string;
  contact_name: string;
  email: string;
  property_type: string;
  status: "pending" | "approved" | "declined";
  created_at: string;
  star_rating: number | null;
  contact_role: string | null;
  phone: string | null;
  website_url: string | null;
  address_line1: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
  description: string | null;
  amenities: string[] | null;
  photo_source_url: string | null;
  additional_notes: string | null;
  hotel_authorized: boolean;
  content_rights_confirmed: boolean;
  information_accurate: boolean;
  property_id: string | null;
};

function formatLabel(value: string | null) {
  return value?.replaceAll("_", " ") || "Not provided";
}

function hasCompleteIntake(application: Application) {
  return Boolean(
    application.star_rating
    && application.contact_role
    && application.phone
    && application.website_url
    && application.address_line1
    && application.city
    && application.postal_code
    && application.country
    && application.description
    && application.amenities?.length
    && application.photo_source_url
    && application.hotel_authorized
    && application.content_rights_confirmed
    && application.information_accurate,
  );
}

export function AdminPartnerApplications() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [verified, setVerified] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/partner-applications");
    const body = await response.json();
    if (response.ok) setApplications(body.data ?? []);
    else setMessage(body.error || "Applications could not be loaded.");
  }, []);

  useEffect(() => {
    // Initial remote-data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function decide(id: string, status: Application["status"]) {
    setBusy(id);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/partner-applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          ...(status === "approved" ? { verificationConfirmed: verified[id] === true } : {}),
        }),
      });
      const body = await response.json();
      setMessage(
        response.ok
          ? status === "approved"
            ? `${body.data.property_name} was verified and an inactive property draft was created.`
            : `${body.data.property_name} was marked ${status}.`
          : body.error || "The decision could not be saved.",
      );
      if (response.ok) await load();
    } catch {
      setMessage("The decision could not be saved.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="card mt-8 overflow-hidden">
      <div className="border-b border-slate-200 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Hotel intake review queue</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              Approval grants partner access and creates an inactive property draft. The contact must first register with the same email. Rooms, future inventory, and a separate property approval are still required before publication.
            </p>
          </div>
          <Link className="btn-secondary" href="/hotel-intake">Open manager intake</Link>
        </div>
        {message && <p role="status" className="mt-3 text-sm">{message}</p>}
      </div>
      <div className="divide-y divide-slate-200">
        {applications.length === 0 && (
          <p className="p-6 text-sm text-slate-500">No hotel intakes yet.</p>
        )}
        {applications.map((application) => {
          const complete = hasCompleteIntake(application);
          const canApprove = complete && verified[application.id] === true && busy !== application.id;
          return (
            <article key={application.id} className="grid gap-6 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <strong className="text-lg">{application.property_name}</strong>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-600">
                      {application.status}
                    </span>
                    {!complete && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Incomplete legacy intake</span>}
                  </div>
                  <p className="mt-2 text-sm capitalize text-slate-600">
                    {application.star_rating ? `${application.star_rating}-star ` : ""}{formatLabel(application.property_type)} · {application.city || "City missing"}, {application.country || "Country missing"}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">Submitted {new Date(application.created_at).toLocaleString()}</p>
                </div>
                {application.property_id && (
                  <Link className="btn-secondary" href="/admin/properties">Review inactive draft</Link>
                )}
              </div>

              <div className="grid gap-5 text-sm lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-semibold">Authorized contact</h3>
                  <dl className="mt-3 grid gap-2 text-slate-600">
                    <div><dt className="inline font-medium text-slate-900">Name: </dt><dd className="inline">{application.contact_name}</dd></div>
                    <div><dt className="inline font-medium text-slate-900">Role: </dt><dd className="inline capitalize">{formatLabel(application.contact_role)}</dd></div>
                    <div><dt className="inline font-medium text-slate-900">Email: </dt><dd className="inline"><a className="underline" href={`mailto:${application.email}`}>{application.email}</a></dd></div>
                    <div><dt className="inline font-medium text-slate-900">Phone: </dt><dd className="inline">{application.phone || "Not provided"}</dd></div>
                  </dl>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-semibold">Verification sources</h3>
                  <dl className="mt-3 grid gap-2 text-slate-600">
                    <div><dt className="inline font-medium text-slate-900">Address: </dt><dd className="inline">{[application.address_line1, application.city, application.region, application.postal_code, application.country].filter(Boolean).join(", ") || "Not provided"}</dd></div>
                    <div><dt className="inline font-medium text-slate-900">Website: </dt><dd className="inline">{application.website_url ? <a className="underline" href={application.website_url} target="_blank" rel="noreferrer">Open official site</a> : "Not provided"}</dd></div>
                    <div><dt className="inline font-medium text-slate-900">Media: </dt><dd className="inline">{application.photo_source_url ? <a className="underline" href={application.photo_source_url} target="_blank" rel="noreferrer">Open media source</a> : "Not provided"}</dd></div>
                  </dl>
                </div>
              </div>

              <details className="rounded-xl border border-slate-200 p-4">
                <summary className="cursor-pointer font-semibold">Review listing content</summary>
                <div className="mt-4 grid gap-4 text-sm text-slate-600">
                  <div><strong className="text-slate-900">Description</strong><p className="mt-1 whitespace-pre-wrap leading-6">{application.description || "Not provided"}</p></div>
                  <div><strong className="text-slate-900">Amenities</strong><p className="mt-1">{application.amenities?.join(", ") || "Not provided"}</p></div>
                  {application.additional_notes && <div><strong className="text-slate-900">Notes</strong><p className="mt-1 whitespace-pre-wrap">{application.additional_notes}</p></div>}
                </div>
              </details>

              <div className="grid gap-2 rounded-xl bg-slate-50 p-4 text-sm">
                <p className={application.hotel_authorized ? "text-emerald-800" : "text-rose-700"}>{application.hotel_authorized ? "✓" : "✕"} Manager attested to hotel authorization: {application.hotel_authorized ? "Yes" : "No"}</p>
                <p className={application.content_rights_confirmed ? "text-emerald-800" : "text-rose-700"}>{application.content_rights_confirmed ? "✓" : "✕"} Manager attested to content rights: {application.content_rights_confirmed ? "Yes" : "No"}</p>
                <p className={application.information_accurate ? "text-emerald-800" : "text-rose-700"}>{application.information_accurate ? "✓" : "✕"} Manager attested to information accuracy: {application.information_accurate ? "Yes" : "No"}</p>
              </div>

              {application.status !== "approved" && (
                <label className="flex gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">
                  <input
                    className="mt-1 h-4 w-4 shrink-0"
                    type="checkbox"
                    checked={verified[application.id] === true}
                    onChange={(event) => setVerified((current) => ({ ...current, [application.id]: event.target.checked }))}
                    disabled={!complete}
                  />
                  <span>I verified the hotel, the contact&apos;s authority, the official website/address, and the submitted content rights. Create an inactive draft only.</span>
                </label>
              )}

              <div className="flex flex-wrap gap-2">
                {application.status === "approved" ? (
                  <button className="btn-primary" disabled>Verified &amp; draft created</button>
                ) : (
                  <button className="btn-primary" disabled={!canApprove} onClick={() => decide(application.id, "approved")}>
                    {busy === application.id ? "Saving…" : "Verify, approve & create inactive draft"}
                  </button>
                )}
                {application.status === "pending" && (
                  <button className="btn-secondary" disabled={busy === application.id} onClick={() => decide(application.id, "declined")}>Decline</button>
                )}
                {application.status === "declined" && (
                  <button className="btn-secondary" disabled={busy === application.id} onClick={() => decide(application.id, "pending")}>Return to review</button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
