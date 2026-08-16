"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

const invalidRecoveryPath = "/forgot-password?error=recovery_link_invalid";

export default function ImplicitRecoveryPage() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const finishRecovery = async () => {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = fragment.get("access_token");
      const refreshToken = fragment.get("refresh_token");
      const type = fragment.get("type");

      // Recovery credentials must not remain in the address bar or browser history.
      window.history.replaceState(null, "", window.location.pathname);

      if (type !== "recovery" || !accessToken || !refreshToken) {
        window.location.replace(invalidRecoveryPath);
        return;
      }

      const supabase = createClient();

      try {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error || !data.user) throw error ?? new Error("Recovery session unavailable.");

        const response = await fetch("/api/auth/recovery/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (!response.ok) throw new Error("Recovery session could not be verified.");

        window.location.replace("/reset-password");
      } catch {
        await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        window.location.replace(invalidRecoveryPath);
      }
    };

    void finishRecovery();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-md p-8">
        <Link href="/" className="font-bold text-brand-700">iRatePilot</Link>
        <h1 className="mt-6 text-2xl font-bold">Verifying reset link</h1>
        <p role="status" className="mt-2 text-sm text-slate-500">
          Securely preparing the password form&hellip;
        </p>
      </div>
    </main>
  );
}
