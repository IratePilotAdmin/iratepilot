"use client";

import Link from "next/link";
import { useState } from "react";

export function PartnerApplicationForm() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [applicationEmail, setApplicationEmail] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setLoading(true);
    setMessage("");
    setApplicationEmail("");
    try {
      const form = new FormData(formElement);
      const email = String(form.get("email") || "").trim();
      const response = await fetch("/api/partners/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form))
      });
      const result = await response.json();
      if (response.ok) {
        setApplicationEmail(email);
        formElement.reset();
      } else {
        setMessage(result.error || "Unable to submit.");
      }
    } catch {
      setMessage("Unable to submit. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (applicationEmail) {
    return (
      <section className="card grid gap-4 p-6 text-slate-950" aria-labelledby="application-received-heading">
        <span className="w-fit rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-800">Application received</span>
        <h2 id="application-received-heading" className="text-xl font-bold">Create your iRatePilot account</h2>
        <p className="text-sm leading-6 text-slate-600">Use <span className="font-semibold text-slate-950">{applicationEmail}</span> so our team can grant partner access after approval.</p>
        <Link href={`/register?email=${encodeURIComponent(applicationEmail)}`} className="btn-primary w-fit">Create account with this email</Link>
        <p className="text-xs text-slate-500">Already registered with this email? Your application is ready for administrator review.</p>
      </section>
    );
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
