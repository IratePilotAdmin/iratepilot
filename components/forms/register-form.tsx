"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getSafeNextPath } from "@/lib/auth/safe-next-path";

export function RegisterForm({ configured, nextPath }: { configured: boolean; nextPath: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const safeNextPath = getSafeNextPath(nextPath) || "/account";
  const callbackPath = `/auth/callback?next=${encodeURIComponent(safeNextPath)}`;

  async function signUpWithGoogle() {
    if (!configured) return;
    setLoading(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}${callbackPath}` }
      });
      if (error) throw error;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google registration failed.");
      setLoading(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured) return;
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email: String(form.get("email")),
        password: String(form.get("password")),
        options: {
          data: { full_name: `${form.get("firstName")} ${form.get("lastName")}`.trim() },
          emailRedirectTo: `${window.location.origin}${callbackPath}`
        }
      });
      if (error) throw error;
      if (data.session) {
        router.replace(safeNextPath);
        router.refresh();
        return;
      }
      setMessage("Check your email to confirm your account.");
      formElement.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-5">
      {!configured && <div role="alert" className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>Account creation is temporarily unavailable.</strong><p className="mt-1">The authentication service has not been connected to this deployment.</p></div>}
      <button type="button" onClick={signUpWithGoogle} disabled={loading || !configured} className="btn-secondary w-full disabled:cursor-not-allowed disabled:opacity-50">Continue with Google</button>
      <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-slate-400"><span className="h-px flex-1 bg-slate-200" />or use email<span className="h-px flex-1 bg-slate-200" /></div>
      <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="mb-2 block text-sm font-medium" htmlFor="first-name">First name</label><input id="first-name" name="firstName" className="input" autoComplete="given-name" disabled={!configured} required /></div>
        <div><label className="mb-2 block text-sm font-medium" htmlFor="last-name">Last name</label><input id="last-name" name="lastName" className="input" autoComplete="family-name" disabled={!configured} required /></div>
      </div>
      <label className="grid gap-2 text-sm font-medium" htmlFor="register-email">Email address</label>
      <input id="register-email" name="email" className="input" type="email" autoComplete="email" disabled={!configured} required />
      <label className="grid gap-2 text-sm font-medium" htmlFor="register-password">Create password</label>
      <input id="register-password" name="password" className="input" type="password" autoComplete="new-password" minLength={8} disabled={!configured} required />
      {message && <p role="status" className="text-sm text-slate-700">{message}</p>}
      <button className="btn-primary" disabled={loading || !configured}>{loading ? "Creating account…" : "Create account"}</button>
      </form>
    </div>
  );
}
