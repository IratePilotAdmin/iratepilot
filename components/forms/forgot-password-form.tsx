"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ForgotPasswordForm({ configured }: { configured: boolean }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured) return;
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(
        String(form.get("email")),
        { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/reset-password")}` },
      );
      if (error) throw error;
      setMessage("If an account exists for that email, a password-reset link is on its way.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to send the reset email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <label className="grid gap-2 text-sm font-medium" htmlFor="forgot-email">Email address</label>
      <input id="forgot-email" name="email" className="input" type="email" autoComplete="email" disabled={!configured} required />
      {message && <p role="status" className="text-sm text-slate-700">{message}</p>}
      <button className="btn-primary" disabled={loading || !configured}>{loading ? "Sending…" : "Send reset link"}</button>
    </form>
  );
}
