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
  commercial_terms_acknowledged: boolean;
  commercial_terms_version_acknowledged: string | null;
  property_id: string | null;
  acquisition_attribution: {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
  } | null;
};

const reviewChecklist = [
  ["propertyVerified", "I independently verified the legal business, property identity, address, official website, and 4- or 5-star eligibility."],
  ["contactAuthorityVerified", "I verified the contact's authority and business email for this hotel."],
  ["contentRightsReviewed", "I reviewed the submitted text, amenities, and media source for content rights."],
  ["feeDisclosureAcknowledged", "I confirmed the applicant acknowledged the 13% commission plus mandatory 3% rewards contribution."],
  ["inactiveDraftScopeConfirmed", "I understand approval creates only an inactive private draft; publication, bookings, payouts, and connectivity remain separate gates."],
] as const;

const currentFeeDisclosureVersion = "hotel_partner_fee_disclosure_13_3_2026-08-22_v1";

type ReviewCheck = (typeof reviewChecklist)[number][0];
type ReviewChecklist = Record<ReviewCheck, boolean>;

function hasCompletedReview(checklist?: Partial<ReviewChecklist>) {
  return reviewChecklist.every(([key]) => checklist?.[key] === true);
}

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
    && application.information_accurate
    && application.commercial_terms_acknowledged
    && application.commercial_terms_version_acknowledged === currentFeeDisclosureVersion,
  );
}

export function AdminPartnerApplications() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [reviewChecks, setReviewChecks] = useState<Record<string, Partial<ReviewChecklist>>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
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
          reviewNotes: reviewNotes[id] ?? "",
          ...(status === "approved" ? { verificationChecklist: reviewChecks[id] } : {}),
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
      if (response.ok) {
        setReviewChecks((current) => ({ ...current, [id]: {} }));
        setReviewNotes((current) => ({ ...current, [id]: "" }));
        await load();
      }
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
          const noteLength = reviewNotes[application.id]?.trim().length ?? 0;
          const canApprove = complete && hasCompletedReview(reviewChecks[application.id]) && noteLength >= 20 && busy !== application.id;
          const canRecordOtherDecision = noteLength >= 3 && busy !== application.id;
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

              {application.acquisition_attribution && (
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm">
                  <h3 className="font-semibold text-violet-950">Acquisition campaign</h3>
                  <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-violet-900">
                    {application.acquisition_attribution.source && <div><dt className="inline font-medium">Source: </dt><dd className="inline">{application.acquisition_attribution.source}</dd></div>}
                    {application.acquisition_attribution.medium && <div><dt className="inline font-medium">Medium: </dt><dd className="inline">{application.acquisition_attribution.medium}</dd></div>}
                    {application.acquisition_attribution.campaign && <div><dt className="inline font-medium">Campaign: </dt><dd className="inline">{application.acquisition_attribution.campaign}</dd></div>}
                    {application.acquisition_attribution.content && <div><dt className="inline font-medium">Content: </dt><dd className="inline">{application.acquisition_attribution.content}</dd></div>}
                  </dl>
                </div>
              )}

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
                <p className={application.commercial_terms_acknowledged && application.commercial_terms_version_acknowledged === currentFeeDisclosureVersion ? "text-emerald-800" : "text-rose-700"}>{application.commercial_terms_acknowledged && application.commercial_terms_version_acknowledged === currentFeeDisclosureVersion ? "✓" : "✕"} Applicant acknowledged the current 13% commission + mandatory 3% rewards disclosure: {application.commercial_terms_acknowledged && application.commercial_terms_version_acknowledged === currentFeeDisclosureVersion ? "Yes" : "No"}</p>
              </div>

              {application.status !== "approved" && (
                <div className="grid gap-4">
                  <fieldset className="grid gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950" disabled={!complete}>
                    <legend className="px-1 font-semibold">Required approval checklist</legend>
                    {reviewChecklist.map(([key, label]) => (
                      <label className="flex gap-3" key={key}>
                        <input
                          className="mt-1 h-4 w-4 shrink-0"
                          type="checkbox"
                          checked={reviewChecks[application.id]?.[key] === true}
                          onChange={(event) => setReviewChecks((current) => ({
                            ...current,
                            [application.id]: {
                              ...current[application.id],
                              [key]: event.target.checked,
                            },
                          }))}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </fieldset>
                  <label className="grid gap-2 text-sm font-medium text-slate-900">
                    Review evidence note
                    <textarea
                      className="min-h-24 rounded-xl border border-slate-300 bg-white p-3 font-normal"
                      maxLength={2000}
                      value={reviewNotes[application.id] ?? ""}
                      onChange={(event) => setReviewNotes((current) => ({ ...current, [application.id]: event.target.value }))}
                      placeholder="Record the sources checked and the result. Approval requires at least 20 characters."
                    />
                  </label>
                </div>
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
                  <button className="btn-secondary" disabled={!canRecordOtherDecision} onClick={() => decide(application.id, "declined")}>Decline</button>
                )}
                {application.status === "declined" && (
                  <button className="btn-secondary" disabled={!canRecordOtherDecision} onClick={() => decide(application.id, "pending")}>Return to review</button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
