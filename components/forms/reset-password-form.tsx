"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured) return;
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    const confirmation = String(form.get("confirmation"));

    if (password !== confirmation) {
      setMessage("Passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      router.replace("/login?password=updated");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update the password.");
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <label className="grid gap-2 text-sm font-medium" htmlFor="reset-password">New password</label>
      <input id="reset-password" name="password" className="input" type="password" autoComplete="new-password" minLength={8} disabled={!configured} required />
      <label className="grid gap-2 text-sm font-medium" htmlFor="reset-confirmation">Confirm new password</label>
      <input id="reset-confirmation" name="confirmation" className="input" type="password" autoComplete="new-password" minLength={8} disabled={!configured} required />
      {message && <p role="alert" className="text-sm text-red-700">{message}</p>}
      <button className="btn-primary" disabled={loading || !configured}>{loading ? "Updating…" : "Update password"}</button>
    </form>
  );
}
