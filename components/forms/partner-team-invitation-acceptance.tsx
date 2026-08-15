"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function PartnerTeamInvitationAcceptance({ invitationId }: { invitationId: string | null }) {
  const [email, setEmail] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState("");
  const nextPath = invitationId ? `/team-invite?invitation=${encodeURIComponent(invitationId)}` : "/team-invite";
  const loginHref = `/login?next=${encodeURIComponent(nextPath)}`;
  const registerHref = `/register?next=${encodeURIComponent(nextPath)}`;

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        setAuthenticated(response.ok && body.authenticated);
        setEmail(body.user?.email ?? null);
      })
      .catch(() => setAuthenticated(false));
  }, []);

  async function accept() {
    if (!invitationId) return setMessage("This invitation link is incomplete.");
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/partner/team/invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitationId }),
    });
    const body = await response.json();
    setMessage(response.ok ? body.message : body.error || "Invitation could not be accepted.");
    setAccepted(response.ok);
    setBusy(false);
  }

  return <div className="card w-full max-w-lg p-8">
    <Link className="font-bold text-brand-700" href="/">iRatePilot</Link>
    <h1 className="mt-6 text-2xl font-bold">Hotel team invitation</h1>
    <p className="mt-2 text-sm text-slate-500">Sign in using the exact email address that received the invitation. Acceptance grants scoped draft-property, room, inventory, and integration access for the assigned hotel team.</p>
    {authenticated === null ? <p className="mt-6 text-sm text-slate-500">Checking your session…</p>
      : !authenticated ? <div className="mt-6 flex flex-wrap gap-3">
        <Link className="btn-primary" href={loginHref}>Sign in</Link>
        <Link className="btn-secondary" href={registerHref}>Create account</Link>
      </div>
        : <div className="mt-6">
          <p className="text-sm">Signed in as <strong>{email}</strong></p>
          {!accepted && <button className="btn-primary mt-4" disabled={busy || !invitationId} onClick={() => void accept()} type="button">{busy ? "Accepting…" : "Accept invitation"}</button>}
          {accepted && <Link className="btn-primary mt-4 inline-flex" href="/partner/properties">Open hotel properties</Link>}
        </div>}
    {message && <p className="mt-4 text-sm" role="status">{message}</p>}
    <p className="mt-6 text-xs text-slate-500">Invitation links are not bearer credentials. iRatePilot validates the signed-in account email, expiration, partner approval, and invitation status before granting access.</p>
  </div>;
}
