"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { HOTEL_MANAGER_INTEREST_UNCONFIRMED } from "@/lib/hotels/intake-response-message";
import { submitHotelManagerInterest } from "@/lib/hotels/manager-interest-submission";

export function HotelManagerInterestForm() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);

  useEffect(() => {
    if (message) resultRef.current?.focus();
  }, [message]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;

    const formElement = event.currentTarget;
    submitting.current = true;
    setLoading(true);
    setMessage("");
    setSubmitted(false);

    try {
      const form = new FormData(formElement);
      const result = await submitHotelManagerInterest(Object.fromEntries(form));
      if (result.received) formElement.reset();
      setSubmitted(result.received);
      setMessage(result.message);
    } catch {
      setMessage(HOTEL_MANAGER_INTEREST_UNCONFIRMED);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <form
      aria-busy={loading}
      aria-describedby="manager-interest-boundary manager-interest-required"
      className="card grid gap-6 p-6 text-slate-950 sm:p-8"
      id="manager-interest-form"
      onSubmit={submit}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-sky-700">Private manager interest</p>
        <h2 className="mt-2 text-2xl font-bold">Request an onboarding conversation</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600" id="manager-interest-boundary">
          Share basic business contact information so iRatePilot can privately follow up about eligibility and the later verified application. This creates an outreach lead only—not a listing, partner account, reservation, booking, payment, payout, or hotel-system connection.
        </p>
        <p className="mt-3 text-xs font-medium text-slate-500" id="manager-interest-required">
          All fields are required unless marked optional.
        </p>
      </div>

      <fieldset className="grid gap-4 border-t border-slate-200 pt-6" disabled={loading}>
        <legend className="pr-3 text-sm font-semibold">Hotel and manager</legend>
        <label className="text-sm font-medium" htmlFor="interest-hotel-name">
          Hotel or property name
          <input autoComplete="organization" className="input mt-2" id="interest-hotel-name" maxLength={160} minLength={2} name="hotelName" required />
        </label>
        <label className="text-sm font-medium" htmlFor="interest-contact-name">
          Your name
          <input autoComplete="name" className="input mt-2" id="interest-contact-name" maxLength={100} minLength={2} name="contactName" required />
        </label>
        <label className="text-sm font-medium" htmlFor="interest-role">
          Your role
          <select className="input mt-2" defaultValue="" id="interest-role" name="role" required>
            <option disabled value="">Select your role</option>
            <option value="owner">Owner</option>
            <option value="general_manager">General manager</option>
            <option value="revenue_manager">Revenue manager</option>
            <option value="sales_manager">Sales manager</option>
            <option value="authorized_representative">Authorized representative</option>
          </select>
        </label>
      </fieldset>

      <fieldset className="grid gap-4 border-t border-slate-200 pt-6" disabled={loading}>
        <legend className="pr-3 text-sm font-semibold">Business contact</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium" htmlFor="interest-business-email">
            Business email
            <input autoComplete="email" className="input mt-2" id="interest-business-email" maxLength={254} name="businessEmail" required type="email" />
          </label>
          <label className="text-sm font-medium" htmlFor="interest-business-phone">
            Business phone
            <input autoComplete="tel" className="input mt-2" id="interest-business-phone" maxLength={30} minLength={7} name="businessPhone" required type="tel" />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-medium" htmlFor="interest-city">
            City
            <input autoComplete="address-level2" className="input mt-2" id="interest-city" maxLength={100} minLength={2} name="city" required />
          </label>
          <label className="text-sm font-medium" htmlFor="interest-region">
            State or region <span className="font-normal text-slate-500">(optional)</span>
            <input autoComplete="address-level1" className="input mt-2" id="interest-region" maxLength={100} name="region" />
          </label>
          <label className="text-sm font-medium" htmlFor="interest-country">
            Country
            <input autoComplete="country-name" className="input mt-2" id="interest-country" maxLength={100} minLength={2} name="country" required />
          </label>
        </div>
        <label className="text-sm font-medium" htmlFor="interest-website-url">
          Official website <span className="font-normal text-slate-500">(optional)</span>
          <input className="input mt-2" id="interest-website-url" inputMode="url" maxLength={2000} name="websiteUrl" pattern="https://.*" placeholder="https://hotel.example" type="url" />
        </label>
      </fieldset>

      <fieldset className="grid gap-4 border-t border-slate-200 pt-6" disabled={loading}>
        <legend className="pr-3 text-sm font-semibold">Follow-up preference</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-medium">
            <input className="h-5 w-5" defaultChecked name="preferredContact" type="radio" value="email" />
            Email me
          </label>
          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-medium">
            <input className="h-5 w-5" name="preferredContact" type="radio" value="phone" />
            Call me
          </label>
        </div>
        <label className="text-sm font-medium" htmlFor="interest-notes">
          Anything we should know? <span className="font-normal text-slate-500">(optional)</span>
          <textarea className="input mt-2 min-h-28" id="interest-notes" maxLength={1000} name="notes" placeholder="Property type, number of rooms, current hotel system, or a good time to reach you" />
        </label>
      </fieldset>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        Do not enter passwords, reservation-system credentials, government IDs, guest information, bank details, or payment-card data. The team will request verified application details only through a later, separately enabled process.
      </div>

      <label aria-hidden="true" className="hidden">
        Fax number
        <input autoComplete="off" disabled={loading} name="faxNumber" tabIndex={-1} />
      </label>

      {message ? (
        <div
          aria-live={submitted ? "polite" : "assertive"}
          className={submitted ? "rounded-xl bg-emerald-50 p-4 text-sm text-emerald-950" : "rounded-xl bg-rose-50 p-4 text-sm text-rose-950"}
          ref={resultRef}
          role={submitted ? "status" : "alert"}
          tabIndex={-1}
        >
          <h3 className="font-semibold">{submitted ? "Interest request received" : "Interest request not confirmed"}</h3>
          <p className="mt-1 leading-6">{message}</p>
          {submitted ? (
            <p className="mt-2 leading-6">
              The team will review the property basics and use your preferred contact method. No listing or booking capability was created.
            </p>
          ) : null}
        </div>
      ) : null}

      <button className="btn-primary min-h-12 w-full justify-center sm:w-fit" disabled={loading} type="submit">
        {loading ? "Sending…" : "Request private follow-up"}
      </button>
      <p className="text-xs leading-5 text-slate-500">
        By sending this request, you agree that iRatePilot may contact you about hotel onboarding. Review the <Link className="underline" href="/privacy">Privacy Policy</Link>.
      </p>
    </form>
  );
}
