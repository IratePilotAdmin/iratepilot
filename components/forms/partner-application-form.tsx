"use client";

import { useState } from "react";

export function PartnerApplicationForm() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setLoading(true);
    setMessage("");
    try {
      const form = new FormData(formElement);
      const response = await fetch("/api/partners/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form))
      });
      const result = await response.json();
      setMessage(response.ok ? "Application received. Register with this email before review if you do not already have an account." : result.error || "Unable to submit.");
      if (response.ok) formElement.reset();
    } catch {
      setMessage("Unable to submit. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card grid gap-4 p-6 text-slate-950" onSubmit={submit}>
      <h2 className="text-xl font-bold">Start your property application</h2>
      <p className="text-sm text-slate-600">
        Use the same email address for your iRatePilot account. You must register
        before an approved application can receive partner access.
      </p>
      <label htmlFor="property-name" className="text-sm font-medium">Property name</label>
      <input id="property-name" name="propertyName" className="input" required minLength={2} />
      <label htmlFor="contact-name" className="text-sm font-medium">Contact name</label>
      <input id="contact-name" name="contactName" className="input" required minLength={2} />
      <label htmlFor="business-email" className="text-sm font-medium">Business email</label>
      <input id="business-email" name="email" className="input" type="email" required />
      <label htmlFor="property-type" className="text-sm font-medium">Property type</label>
      <select id="property-type" name="propertyType" className="input"><option value="hotel">Hotel</option><option value="resort">Resort</option><option value="vacation_home">Vacation home</option></select>
      {message && <p role="status" className="text-sm">{message}</p>}
      <button className="btn-primary" disabled={loading}>{loading ? "Submitting…" : "Submit application"}</button>
    </form>
  );
}
