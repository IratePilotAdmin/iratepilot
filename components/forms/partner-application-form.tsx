"use client";

import Link from "next/link";
import { useState } from "react";

export function PartnerApplicationForm() {
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setLoading(true);
    setMessage("");
    setSubmitted(false);
    try {
      const form = new FormData(formElement);
      const response = await fetch("/api/partners/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      const result = await response.json();
      setSubmitted(response.ok);
      setMessage(response.ok
        ? "Hotel intake received for verification. Nothing has been published."
        : result.error || "Unable to submit the hotel intake.");
      if (response.ok) formElement.reset();
    } catch {
      setMessage("Unable to submit. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card grid gap-6 p-6 text-slate-950 sm:p-8" onSubmit={submit}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-sky-700">Hotel manager intake</p>
        <h2 className="mt-2 text-2xl font-bold">Submit your hotel for verification</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Complete this with an authorized hotel representative. Submission creates a pending intake only—iRatePilot verifies the details before creating an inactive draft, and publication is a separate approval.
        </p>
      </div>

      <fieldset className="grid gap-4 border-t border-slate-200 pt-6 sm:grid-cols-2">
        <legend className="mb-4 text-base font-semibold">Property details</legend>
        <label className="grid gap-1.5 text-sm font-medium sm:col-span-2" htmlFor="property-name">
          Official property name
          <input id="property-name" name="propertyName" className="input" required minLength={2} maxLength={160} autoComplete="organization" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium" htmlFor="property-type">
          Property type
          <select id="property-type" name="propertyType" className="input" required defaultValue="hotel">
            <option value="hotel">Hotel</option>
            <option value="resort">Resort</option>
            <option value="vacation_home">Premium vacation home</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium" htmlFor="star-rating">
          Official star rating
          <select id="star-rating" name="starRating" className="input" required defaultValue="">
            <option value="" disabled>Select rating</option>
            <option value="4">4 star</option>
            <option value="5">5 star</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium sm:col-span-2" htmlFor="website-url">
          Official hotel website
          <input id="website-url" name="websiteUrl" className="input" type="url" inputMode="url" placeholder="https://hotel.example" required maxLength={2000} autoComplete="url" />
        </label>
      </fieldset>

      <fieldset className="grid gap-4 border-t border-slate-200 pt-6 sm:grid-cols-2">
        <legend className="mb-4 text-base font-semibold">Authorized contact</legend>
        <label className="grid gap-1.5 text-sm font-medium" htmlFor="contact-name">
          Full name
          <input id="contact-name" name="contactName" className="input" required minLength={2} maxLength={100} autoComplete="name" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium" htmlFor="contact-role">
          Role at the property
          <select id="contact-role" name="contactRole" className="input" required defaultValue="">
            <option value="" disabled>Select role</option>
            <option value="hotel_owner">Hotel owner</option>
            <option value="general_manager">General manager</option>
            <option value="revenue_manager">Revenue manager</option>
            <option value="sales_manager">Sales manager</option>
            <option value="authorized_representative">Authorized representative</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium" htmlFor="business-email">
          Business email
          <input id="business-email" name="email" className="input" type="email" required maxLength={254} autoComplete="email" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium" htmlFor="business-phone">
          Business phone
          <input id="business-phone" name="phone" className="input" type="tel" required minLength={7} maxLength={30} autoComplete="tel" />
        </label>
      </fieldset>

      <fieldset className="grid gap-4 border-t border-slate-200 pt-6 sm:grid-cols-2">
        <legend className="mb-4 text-base font-semibold">Hotel location</legend>
        <label className="grid gap-1.5 text-sm font-medium sm:col-span-2" htmlFor="address-line-1">
          Street address
          <input id="address-line-1" name="addressLine1" className="input" required minLength={3} maxLength={160} autoComplete="street-address" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium" htmlFor="city">
          City
          <input id="city" name="city" className="input" required minLength={2} maxLength={100} autoComplete="address-level2" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium" htmlFor="region">
          State / province / region
          <input id="region" name="region" className="input" maxLength={100} autoComplete="address-level1" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium" htmlFor="postal-code">
          Postal code
          <input id="postal-code" name="postalCode" className="input" required minLength={2} maxLength={20} autoComplete="postal-code" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium" htmlFor="country">
          Country
          <input id="country" name="country" className="input" required minLength={2} maxLength={100} autoComplete="country-name" />
        </label>
      </fieldset>

      <fieldset className="grid gap-4 border-t border-slate-200 pt-6">
        <legend className="mb-4 text-base font-semibold">Listing information</legend>
        <label className="grid gap-1.5 text-sm font-medium" htmlFor="description">
          Official property description
          <textarea id="description" name="description" className="input min-h-36" required minLength={120} maxLength={4000} placeholder="Describe the property, location, accommodations, and guest experience (at least 120 characters)." />
        </label>
        <label className="grid gap-1.5 text-sm font-medium" htmlFor="amenities">
          Amenities, separated by commas
          <textarea id="amenities" name="amenities" className="input min-h-24" required maxLength={1000} placeholder="Pool, fitness center, complimentary Wi-Fi, restaurant" />
          <span className="text-xs font-normal text-slate-500">Add 1–20 verified amenities.</span>
        </label>
        <label className="grid gap-1.5 text-sm font-medium" htmlFor="photo-source-url">
          Authorized photo or media-library link
          <input id="photo-source-url" name="photoSourceUrl" className="input" type="url" inputMode="url" required maxLength={2000} placeholder="https://hotel.example/media" />
          <span className="text-xs font-normal text-slate-500">Provide a secure official source. iRatePilot will verify rights before using any image.</span>
        </label>
        <label className="grid gap-1.5 text-sm font-medium" htmlFor="additional-notes">
          Notes for iRatePilot (optional)
          <textarea id="additional-notes" name="additionalNotes" className="input min-h-24" maxLength={1000} placeholder="Best time to follow up, special property details, or questions" />
        </label>
      </fieldset>

      <fieldset className="grid gap-3 border-t border-slate-200 pt-6">
        <legend className="mb-2 text-base font-semibold">Required confirmations</legend>
        <label className="flex gap-3 text-sm leading-6">
          <input className="mt-1 h-4 w-4 shrink-0" type="checkbox" name="hotelAuthorized" value="true" required />
          <span>I am authorized by this property to submit its business and listing information.</span>
        </label>
        <label className="flex gap-3 text-sm leading-6">
          <input className="mt-1 h-4 w-4 shrink-0" type="checkbox" name="contentRightsConfirmed" value="true" required />
          <span>The property owns or is authorized to share the submitted description, amenities, and linked media for verification.</span>
        </label>
        <label className="flex gap-3 text-sm leading-6">
          <input className="mt-1 h-4 w-4 shrink-0" type="checkbox" name="informationAccurate" value="true" required />
          <span>The information is accurate to the best of my knowledge, and I understand that submission does not publish the property.</span>
        </label>
      </fieldset>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        Do not enter passwords, reservation-system credentials, government IDs, bank details, payment-card data, or guest information. iRatePilot will never request those items in this form.
      </div>
      <div className="hidden" aria-hidden="true">
        <label htmlFor="company-fax">Company fax</label>
        <input id="company-fax" name="companyFax" tabIndex={-1} autoComplete="off" />
      </div>

      {message && (
        <div role="status" className={submitted ? "rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900" : "rounded-xl bg-rose-50 p-4 text-sm text-rose-900"}>
          <p>{message}</p>
          {submitted && (
            <p className="mt-2">
              The authorized contact should now <Link className="font-semibold underline" href="/register">create an account with the same business email</Link> so access can be granted after approval.
            </p>
          )}
        </div>
      )}
      <button className="btn-primary" disabled={loading}>
        {loading ? "Submitting…" : "Submit hotel for verification"}
      </button>
      <p className="text-xs leading-5 text-slate-500">
        By submitting, you agree that iRatePilot may contact the property to verify authority and details. See our <Link className="underline" href="/privacy">Privacy Policy</Link>.
      </p>
    </form>
  );
}
