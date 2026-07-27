"use client";

import { useState } from "react";

export function ContactForm() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
    const result = await response.json();
    setMessage(response.ok ? "Message received. Our team will follow up." : result.error || "Unable to send message.");
    if (response.ok) event.currentTarget.reset();
    setLoading(false);
  }
  return (
    <form className="card mt-8 grid max-w-xl gap-4 p-6" onSubmit={submit}>
      <label htmlFor="contact-name-public" className="text-sm font-medium">Name</label><input id="contact-name-public" name="name" className="input" required />
      <label htmlFor="contact-email" className="text-sm font-medium">Email</label><input id="contact-email" name="email" className="input" type="email" required />
      <label htmlFor="contact-message" className="text-sm font-medium">How can we help?</label><textarea id="contact-message" name="message" className="input min-h-36" minLength={10} required />
      {message && <p role="status" className="text-sm">{message}</p>}
      <button className="btn-primary" disabled={loading}>{loading ? "Sending…" : "Send message"}</button>
    </form>
  );
}
