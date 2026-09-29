"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getPartnerDraftProgress, partnerDraftSubmissionSchema, partnerOnboardingDraftSchema, partnerRegistrationSchema,
  type PartnerDraftDetails, type PartnerOnboardingDraft,
} from "@/lib/partner/acquisition";
import { createDraftSaveCoordinator, DraftSaveError } from "@/lib/partner/draft-save-coordinator";

const loginHref = "/login?next=%2Fpartner%2Fdashboard%3Fsetup%3D1";
const nextStage = "The next stage covers rooms, rates, photos, agreements, and connectivity after review. Submission does not publish your property or activate bookings.";

async function requestJson(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "The request could not be completed. Please try again.";
      throw new DraftSaveError(error, response.status === 409);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new DraftSaveError("The server response could not be confirmed. Please refresh to check the saved version.", true);
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof DraftSaveError) throw error;
    throw new DraftSaveError("The request could not be confirmed. Your unsaved changes remain here. Please retry or refresh to check the saved version.");
  } finally {
    clearTimeout(timeout);
  }
}

function draftReceipt(value: unknown) {
  const parsed = partnerOnboardingDraftSchema.safeParse(value);
  if (!parsed.success) throw new DraftSaveError("The saved draft could not be confirmed. Reload the saved version before continuing.", true);
  return parsed.data;
}

export function PartnerApplicantDashboard() {
  const [drafts, setDrafts] = useState<PartnerOnboardingDraft[]>([]);
  const [email, setEmail] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setMessage("");
      try {
        const body = await requestJson("/api/partner/onboarding-drafts");
        if (!Array.isArray(body.drafts) || typeof body.email !== "string") throw new Error("Your application list could not be confirmed. Please refresh.");
        let loaded = body.drafts.map(draftReceipt);
        if (new Set(loaded.map((draft) => draft.id)).size !== loaded.length) throw new Error("Your application list could not be confirmed. Please refresh.");
        if (!loaded.length) {
          const { data, error } = await createClient().auth.getUser();
          if (error || !data.user?.email_confirmed_at) throw new Error("Confirm your account email, then sign in to continue your application.");
          const metadata = data.user.user_metadata;
          const registration = partnerRegistrationSchema.safeParse(metadata?.partner_onboarding_registration);
          const registrationKey = metadata?.partner_onboarding_registration_key;
          if (registration.success && typeof registrationKey === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(registrationKey)) {
            const result = await requestJson("/api/partner/registration", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ registrationKey, registration: registration.data }),
            });
            loaded = [draftReceipt(result.draft)];
          }
        }
        if (!active) return;
        setDrafts(loaded);
        setEmail(body.email);
        setSelectedId((current) => loaded.some((draft) => draft.id === current) ? current : loaded[0]?.id || "");
        setDirty(false);
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "Your applications could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [reloadVersion]);

  const selected = drafts.find((draft) => draft.id === selectedId);
  const updateDraft = useCallback((draft: PartnerOnboardingDraft) => {
    // A queued save effect must not replace the newer submission receipt.
    setDrafts((current) => current.map((item) => item.id === draft.id && draft.revision >= item.revision ? draft : item));
  }, []);
  function selectDraft(id: string) {
    if (dirty && id !== selectedId) {
      setMessage("Save your changes before switching properties. If there is a conflict, your unsaved text remains in the current application.");
      return;
    }
    setMessage("");
    setSelectedId(id);
  }

  return <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
    <div className="flex flex-wrap items-start justify-between gap-5">
      <div><p className="section-kicker">Private applicant workspace</p><h1 className="mt-3 text-3xl sm:text-4xl">Your property application</h1>{email ? <p className="mt-3 break-all text-sm text-neutral-600">Signed in as {email}</p> : null}</div>
      <Link href="/partners" className="text-sm underline">Partner program</Link>
    </div>
    <p className="mt-6 border border-sky-200 bg-sky-50 p-4 text-sm leading-7 text-sky-950">This workspace is for your initial application. This application does not grant additional hotel operating access. {nextStage}</p>
    {loading ? <p role="status" className="mt-8">Loading your saved applications…</p> : null}
    {message ? <div role="alert" className="mt-6 border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950"><p>{message}</p>{!dirty ? <button type="button" className="mt-3 font-semibold underline" onClick={() => setReloadVersion((value) => value + 1)}>Refresh applications</button> : null}<p className="mt-2"><Link href={loginHref} className="underline">Sign in again</Link></p></div> : null}
    {!loading && !message && !drafts.length ? <section className="mt-8 border border-neutral-200 bg-white p-6"><h2 className="text-2xl">Start your first property application.</h2><p className="mt-3 text-sm leading-7 text-neutral-600">Register the property’s business details to create a private, saved draft.</p><Link className="btn-primary mt-5" href="/partners/register">Register a property</Link></section> : null}
    {!loading && drafts.length ? <>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4"><div className="flex min-w-0 flex-wrap gap-2" aria-label="Your properties">{drafts.map((draft) => <button type="button" key={draft.id} aria-pressed={draft.id === selectedId} onClick={() => selectDraft(draft.id)} className={`max-w-full break-words border px-4 py-3 text-left text-sm ${draft.id === selectedId ? "border-black bg-black text-white" : "border-neutral-300 bg-white text-black"}`}>{draft.registration.propertyName} <span className="ml-2 text-xs">{draft.status === "submitted" ? "Submitted" : "Draft"}</span></button>)}</div>{!dirty ? <Link href="/partners/register" className="text-sm underline">Add another property</Link> : null}</div>
      {selected ? <DraftEditor key={`${selected.id}:${reloadVersion}`} initial={selected} onSaved={updateDraft} onDirtyChange={setDirty} onReload={() => setReloadVersion((value) => value + 1)} /> : null}
    </> : null}
  </div>;
}

const fieldLabels: Record<string, string> = {
  legalBusinessName: "Legal business name", starRating: "Star rating", contactRole: "Representative role", websiteUrl: "Official website", addressLine1: "Street address", city: "City", postalCode: "Postal code", description: "Property description", amenities: "Amenities", primaryImageUrl: "Primary photo URL", supportContactEmail: "Support contact email", representativeAuthorityConfirmed: "Representative authority", contentRightsConfirmed: "Content rights", informationAccurate: "Information accuracy", commercialTermsAcknowledged: "Fee disclosure acknowledgement",
};

function DraftEditor({ initial, onSaved, onDirtyChange, onReload }: {
  initial: PartnerOnboardingDraft;
  onSaved: (draft: PartnerOnboardingDraft) => void;
  onDirtyChange: (dirty: boolean) => void;
  onReload: () => void;
}) {
  const [coordinator] = useState(() => createDraftSaveCoordinator<PartnerDraftDetails, PartnerOnboardingDraft>(initial, async (draft, details) => {
    const body = await requestJson(`/api/partner/onboarding-drafts/${encodeURIComponent(draft.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: draft.revision, details }) });
    return draftReceipt(body.draft);
  }));
  const [state, setState] = useState(coordinator.snapshot);
  const [submitted, setSubmitted] = useState<PartnerOnboardingDraft | null>(initial.status === "submitted" ? initial : null);
  const [submitting, setSubmitting] = useState(false);
  const [validation, setValidation] = useState<string[]>([]);
  const [submissionError, setSubmissionError] = useState("");
  const [submissionConflict, setSubmissionConflict] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitLock = useRef(false);
  const navigationApproved = useRef(false);

  useEffect(() => coordinator.subscribe(() => setState(coordinator.snapshot())), [coordinator]);
  useEffect(() => { onDirtyChange(state.dirty || state.saving || submitting); }, [onDirtyChange, state.dirty, state.saving, submitting]);
  useEffect(() => { onSaved(state.draft); }, [onSaved, state.draft]);
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (!navigationApproved.current && (coordinator.snapshot().dirty || submitLock.current)) { event.preventDefault(); event.returnValue = ""; }
    }
    function guardNavigation(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self" && anchor.target !== "_top")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (!["http:", "https:"].includes(destination.protocol)) return;
      if (destination.hash && destination.origin === window.location.origin && destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      if (submitLock.current) {
        event.preventDefault();
        event.stopPropagation();
        setSubmissionError("Please wait for the submission result before leaving this application.");
        return;
      }
      if (!coordinator.snapshot().dirty) return;
      if (!window.confirm("Leave this page with unsaved changes? Changes not saved to your account will be lost.")) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      // A full-page link may also fire beforeunload. The confirmed discard needs only one prompt.
      navigationApproved.current = true;
    }
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guardNavigation, true);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [coordinator]);

  function update<K extends keyof PartnerDraftDetails>(key: K, value: PartnerDraftDetails[K]) {
    navigationApproved.current = false;
    coordinator.edit({ ...coordinator.snapshot().details, [key]: value });
    setValidation([]);
    if (timer.current) clearTimeout(timer.current);
    if (!submissionConflict && !coordinator.snapshot().error) timer.current = setTimeout(() => { void coordinator.flush(); }, 800);
  }
  async function save() {
    if (timer.current) clearTimeout(timer.current);
    if (submissionConflict) return;
    await (coordinator.snapshot().error ? coordinator.retry() : coordinator.flush());
  }
  function reload() {
    if (window.confirm("Reload the saved version? This discards unsaved changes shown in this browser. Copy any text you need before continuing.")) onReload();
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current || submissionConflict || coordinator.snapshot().error) return;
    const parsed = partnerDraftSubmissionSchema.safeParse(coordinator.snapshot().details);
    if (!parsed.success) {
      setValidation([...new Set(parsed.error.issues.map((issue) => fieldLabels[String(issue.path[0])] || "Application details"))]);
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    setSubmissionError("");
    if (timer.current) clearTimeout(timer.current);
    try {
      if (!await coordinator.flush()) return;
      const saved = coordinator.snapshot().draft;
      const body = await requestJson(`/api/partner/onboarding-drafts/${encodeURIComponent(saved.id)}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: saved.revision }) });
      const receipt = draftReceipt(body.draft);
      if (receipt.id !== saved.id || receipt.status !== "submitted" || !receipt.application_id || !receipt.submitted_at || !Number.isFinite(Date.parse(receipt.submitted_at))) throw new DraftSaveError("Submission could not be confirmed. Refresh to check the saved application before trying again.", true);
      setSubmitted(receipt);
      onSaved(receipt);
      onDirtyChange(false);
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "Your application could not be submitted. Please try again.");
      if (error instanceof DraftSaveError && error.conflict) setSubmissionConflict(true);
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  const progress = getPartnerDraftProgress(state.draft.details);
  const details = state.details;
  const amenities = details.amenities?.length ? details.amenities : [""];
  const conflict = Boolean(state.error?.conflict || submissionConflict);
  const saveLabel = state.saving ? "Saving changes…" : state.error ? "Changes not saved" : state.dirty ? "Unsaved changes" : "All changes saved";
  if (submitted) return <section className="mt-8 border border-emerald-200 bg-emerald-50 p-6 text-emerald-950 sm:p-8" role="status"><p className="section-kicker">Initial application submitted</p><h2 className="mt-3 text-3xl">Your property is in the review queue.</h2><p className="mt-4 text-sm leading-7"><strong>{submitted.registration.propertyName}</strong> was submitted {submitted.submitted_at ? new Date(submitted.submitted_at).toLocaleString() : "for review"}.</p><dl className="mt-4 grid gap-3 text-sm"><div><dt className="font-semibold">Application reference</dt><dd className="mt-1 break-all font-mono">{submitted.application_id}</dd></div><div><dt className="font-semibold">Status</dt><dd>Submitted for review. Approval is pending.</dd></div></dl><p className="mt-5 text-sm leading-7">{nextStage}</p><p className="mt-3 text-sm leading-7">The team will review your information and follow up using your business contact details. No publication or activation date is promised.</p><div className="mt-6 flex flex-wrap gap-4"><Link href="/partners" className="underline">Review the partner program</Link><Link href="/partners/register" className="underline">Register another property</Link></div></section>;

  return <form onSubmit={submit} noValidate className="mt-8 grid gap-7">
    <section className="border border-neutral-200 bg-white p-5 sm:p-7" aria-labelledby="draft-summary">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="draft-summary" className="break-words text-2xl">{initial.registration.propertyName}</h2><p className="mt-2 text-sm text-neutral-600">{initial.registration.propertyType.replaceAll("_", " ")} · {initial.registration.roomCount} rooms · {initial.registration.region ? `${initial.registration.region}, ` : ""}{initial.registration.countryCode}</p><p className="mt-2 text-sm text-neutral-600">{initial.registration.firstName} {initial.registration.lastName} · {initial.registration.phone}</p></div><span className="border border-neutral-300 px-3 py-1 text-xs">Private draft</span></div>
      <div className="mt-6 flex flex-wrap justify-between gap-3 text-sm"><strong>Initial application progress</strong><span>{progress.completed} of {progress.total} required items saved · {progress.percent}%</span></div>
      <progress aria-label="Saved initial application progress" value={progress.percent} max={100} className="mt-3 h-2 w-full accent-black" />
      <p className="mt-3 text-xs leading-6 text-neutral-500">This measures the initial application’s saved fields. It does not measure full onboarding, publication, or activation readiness.</p>
      <p aria-live="polite" role="status" className={`mt-4 text-sm ${state.error ? "text-amber-800" : "text-neutral-600"}`}>{saveLabel}</p>
    </section>

    <fieldset disabled={submitting} className="grid min-w-0 gap-7 disabled:opacity-60">
      <legend className="sr-only">Initial property application</legend>
      <section className="border border-neutral-200 bg-white p-5 sm:p-7"><h2 className="text-2xl">Business and location</h2><div className="mt-6 grid gap-5 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium sm:col-span-2">Legal business name<input className="input" value={details.legalBusinessName || ""} onChange={(event) => update("legalBusinessName", event.target.value)} autoComplete="organization" maxLength={200} required /></label>
        <label className="grid gap-2 text-sm font-medium">Star rating<select className="input" value={details.starRating || ""} onChange={(event) => update("starRating", Number(event.target.value) as 4 | 5)} required><option value="" disabled>Select rating</option><option value={4}>4 stars</option><option value={5}>5 stars</option></select></label>
        <label className="grid gap-2 text-sm font-medium">Your role<select className="input" value={details.contactRole || ""} onChange={(event) => update("contactRole", event.target.value as PartnerDraftDetails["contactRole"])} required><option value="" disabled>Select role</option><option value="owner">Owner</option><option value="authorized_representative">Authorized representative</option><option value="general_manager">General manager</option><option value="revenue_manager">Revenue manager</option><option value="sales_manager">Sales manager</option></select></label>
        <label className="grid gap-2 text-sm font-medium sm:col-span-2">Official website<input className="input" value={details.websiteUrl || ""} onChange={(event) => update("websiteUrl", event.target.value)} type="url" placeholder="https://" maxLength={2000} required /></label>
        <label className="grid gap-2 text-sm font-medium sm:col-span-2">Street address<input className="input" value={details.addressLine1 || ""} onChange={(event) => update("addressLine1", event.target.value)} autoComplete="address-line1" maxLength={200} required /></label>
        <label className="grid gap-2 text-sm font-medium">City<input className="input" value={details.city || ""} onChange={(event) => update("city", event.target.value)} autoComplete="address-level2" maxLength={100} required /></label>
        <label className="grid gap-2 text-sm font-medium">Postal code<input className="input" value={details.postalCode || ""} onChange={(event) => update("postalCode", event.target.value)} autoComplete="postal-code" maxLength={20} required /></label>
        <label className="grid gap-2 text-sm font-medium sm:col-span-2">Property support contact email<input className="input" value={details.supportContactEmail || ""} onChange={(event) => update("supportContactEmail", event.target.value)} type="email" maxLength={254} required /></label>
      </div></section>

      <section className="border border-neutral-200 bg-white p-5 sm:p-7"><h2 className="text-2xl">Property information</h2><div className="mt-6 grid gap-6">
        <label className="grid gap-2 text-sm font-medium">Property description<textarea className="input min-h-44" value={details.description || ""} onChange={(event) => update("description", event.target.value)} minLength={120} maxLength={4000} required aria-describedby="description-help" /><span id="description-help" className="text-xs font-normal text-neutral-500">120–4,000 characters. {(details.description || "").length} entered.</span></label>
        <div><p className="text-sm font-medium">Verified amenities</p><p className="mt-1 text-xs leading-6 text-neutral-500">Add 1–20 amenities. Describe only amenities your property provides.</p><div className="mt-3 grid gap-3">{amenities.map((amenity, index) => <div className="flex items-center gap-3" key={index}><label className="min-w-0 flex-1"><span className="sr-only">Amenity {index + 1}</span><input className="input" value={amenity} maxLength={80} onChange={(event) => update("amenities", amenities.map((value, position) => position === index ? event.target.value : value))} /></label>{amenities.length > 1 ? <button type="button" className="min-h-11 px-2 text-sm underline" aria-label={`Remove amenity ${index + 1}`} onClick={() => update("amenities", amenities.filter((_, position) => position !== index))}>Remove</button> : null}</div>)}</div><button type="button" className="mt-3 min-h-11 text-sm font-semibold underline disabled:opacity-50" disabled={amenities.length >= 20} onClick={() => update("amenities", [...amenities, ""])}>Add amenity</button></div>
        <label className="grid gap-2 text-sm font-medium">Primary photo URL<input className="input" value={details.primaryImageUrl || ""} onChange={(event) => update("primaryImageUrl", event.target.value)} type="url" placeholder="https://" maxLength={2000} required aria-describedby="photo-help" /><span id="photo-help" className="text-xs font-normal leading-6 text-neutral-500">Use an HTTPS link to an authorized property photo. This first application accepts a primary photo URL; a full gallery is part of the later onboarding stage. Do not link guest photos or private documents.</span></label>
      </div></section>

      <section className="border border-neutral-200 bg-white p-5 sm:p-7"><h2 className="text-2xl">Confirm before submitting</h2><div className="mt-5 border border-neutral-200 bg-[#f7f6f3] p-4 text-sm leading-7"><strong>13% commission + 3% rewards = 16% total hotel distribution cost.</strong><p className="mt-2">The 13% commission is payable to iRatePilot Group, LLC. The separate 3% iRate Rewards Program contribution is mandatory. Traveler service fee: 0%. Management software subscriptions are separate; taxes and payment-processing terms may apply.</p><p className="mt-2">Acknowledging this disclosure is not an executed commercial agreement. Agreements and commercial activation require a later review.</p></div><div className="mt-6 grid gap-5">
        {([
          ["representativeAuthorityConfirmed", "I am the owner or an authorized representative and may submit this property for review."],
          ["contentRightsConfirmed", "I have permission to provide the property text, amenities, and primary photo linked above."],
          ["informationAccurate", "I confirm that the business and property information is accurate."],
          ["commercialTermsAcknowledged", "I acknowledge the 13% commission plus mandatory 3% rewards contribution, a 16% total hotel distribution cost, and understand that this is a fee disclosure rather than a signed agreement."],
        ] as const).map(([key, label]) => <label key={key} className="flex items-start gap-3 text-sm leading-7"><input className="mt-1.5 h-4 w-4 shrink-0" type="checkbox" checked={Boolean(details[key])} onChange={(event) => update(key, event.target.checked)} required /><span>{label}</span></label>)}
      </div></section>
    </fieldset>

    {validation.length ? <div role="alert" className="border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950"><strong>Complete or correct these items before submitting:</strong><ul className="mt-2 list-disc pl-5">{validation.map((label) => <li key={label}>{label}</li>)}</ul></div> : null}
    {state.error || submissionError ? <div role="alert" className="border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950"><p>{state.error?.message || submissionError}</p>{conflict ? <><p className="mt-2">Your unsaved text is still shown here. Another save may have changed the stored version. Copy any text you need before reloading; your local changes will not overwrite it automatically.</p><button type="button" className="mt-3 min-h-11 font-semibold underline" onClick={reload}>Reload saved version and discard local changes</button></> : null}</div> : null}
    <div className="flex flex-col gap-4 border-t border-neutral-200 pt-6 sm:flex-row sm:items-center sm:justify-between"><button type="button" className="btn-secondary min-h-12 disabled:opacity-50" disabled={submitting || state.saving || conflict || (!state.dirty && !state.error)} onClick={() => { void save(); }}>{state.saving ? "Saving…" : state.error ? "Retry save" : "Save changes"}</button><button type="submit" className="btn-primary min-h-12 disabled:opacity-50" disabled={submitting || conflict || Boolean(state.error)}>{submitting ? "Submitting for review…" : "Submit initial application"}</button></div>
    <p className="text-xs leading-6 text-neutral-500">{nextStage} Saved changes stay with your account. Text marked unsaved is only in this browser until a save succeeds.</p>
  </form>;
}
