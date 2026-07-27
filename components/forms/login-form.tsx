"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const requestedNext = searchParams.get("next");
  const nextPath = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : null;

  async function signInWithGoogle() {
    if (!configured) return;
    setLoading(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}` }
      });
      if (error) throw error;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google sign-in failed.");
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
      const { error } = await supabase.auth.signInWithPassword({
        email: String(form.get("email")),
        password: String(form.get("password"))
      });
      if (error) throw error;
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", (await supabase.auth.getUser()).data.user?.id || "").single();
      const roleHome = profile?.role === "admin" ? "/admin" : profile?.role === "partner" ? "/partner/dashboard" : "/account";
      router.replace(nextPath || roleHome);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-in failed.");
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-5">
      {!configured && <div role="alert" className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>Sign-in is temporarily unavailable.</strong><p className="mt-1">The authentication service has not been connected to this deployment. No account information has been lost.</p></div>}
      <button type="button" onClick={signInWithGoogle} disabled={loading || !configured} className="btn-secondary w-full disabled:cursor-not-allowed disabled:opacity-50">Continue with Google</button>
      <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-slate-400"><span className="h-px flex-1 bg-slate-200" />or use email<span className="h-px flex-1 bg-slate-200" /></div>
      <form className="grid gap-4" onSubmit={submit}>
      <label className="grid gap-2 text-sm font-medium" htmlFor="login-email">Email address</label>
      <input id="login-email" name="email" className="input" type="email" autoComplete="email" disabled={!configured} required />
      <label className="grid gap-2 text-sm font-medium" htmlFor="login-password">Password</label>
      <input id="login-password" name="password" className="input" type="password" autoComplete="current-password" minLength={8} disabled={!configured} required />
      {message && <p role="alert" className="text-sm text-red-700">{message}</p>}
      <button className="btn-primary" disabled={loading || !configured}>{loading ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
