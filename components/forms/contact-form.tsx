"use client";

import { useRef, useState } from "react";
import { CONTACT_SUBMISSION_UNCONFIRMED, submitContactMessage } from "@/lib/contact/submission";

export function ContactForm() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;

    const formElement = event.currentTarget;
    submitting.current = true;
    setLoading(true);
    setMessage("");
    try {
      const form = new FormData(formElement);
      const result = await submitContactMessage(Object.fromEntries(form));
      if (result.received) formElement.reset();
      setMessage(result.message);
    } catch {
      setMessage(CONTACT_SUBMISSION_UNCONFIRMED);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }
  return (
    <form className="card mt-8 grid max-w-xl gap-4 p-6" onSubmit={submit} aria-busy={loading}>
      <label htmlFor="contact-name-public" className="text-sm font-medium">Name</label><input id="contact-name-public" name="name" className="input" required disabled={loading} />
      <label htmlFor="contact-email" className="text-sm font-medium">Email</label><input id="contact-email" name="email" className="input" type="email" required disabled={loading} />
      <label htmlFor="contact-message" className="text-sm font-medium">How can we help?</label><textarea id="contact-message" name="message" className="input min-h-36" minLength={10} required disabled={loading} />
      {message && <p role="status" className="text-sm">{message}</p>}
      <button type="submit" className="btn-primary" disabled={loading}>{loading ? "Sending…" : "Send message"}</button>
    </form>
  );
}
