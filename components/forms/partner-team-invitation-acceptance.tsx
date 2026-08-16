"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function PartnerTeamInvitationAcceptance({ invitationId }: { invitationId: string | null }) {
  const [email, setEmail] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [canManageHotels, setCanManageHotels] = useState<boolean | null>(null);
  const [scopeLoading, setScopeLoading] = useState(Boolean(invitationId));
  const [scopeError, setScopeError] = useState("");
  const [message, setMessage] = useState("");
  const nextPath = invitationId ? `/team-invite?invitation=${encodeURIComponent(invitationId)}` : "/team-invite";
  const loginHref = `/login?next=${encodeURIComponent(nextPath)}`;
  const registerHref = `/register?next=${encodeURIComponent(nextPath)}`;

  useEffect(() => {
    let cancelled = false;
    async function loadSessionAndScope() {
      try {
        const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
        const session = await sessionResponse.json();
        const signedIn = sessionResponse.ok && session.authenticated;
        if (cancelled) return;
        setAuthenticated(signedIn);
        setEmail(session.user?.email ?? null);
        if (!signedIn || !invitationId) {
          setScopeLoading(false);
          return;
        }

        const scopeResponse = await fetch(
          `/api/partner/team/invitations/accept?invitationId=${encodeURIComponent(invitationId)}`,
          { cache: "no-store" },
        );
        const scope = await scopeResponse.json();
        if (cancelled) return;
        if (!scopeResponse.ok || typeof scope.canManageHotels !== "boolean") {
          setScopeError(scope.error || "Invitation scope could not be verified.");
          return;
        }
        setCanManageHotels(scope.canManageHotels);
      } catch {
        if (!cancelled) {
          setAuthenticated(false);
          setScopeError("Invitation scope could not be verified.");
        }
      } finally {
        if (!cancelled) setScopeLoading(false);
      }
    }
    void loadSessionAndScope();
    return () => { cancelled = true; };
  }, [invitationId]);

  async function accept() {
    if (!invitationId) return setMessage("This invitation link is incomplete.");
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/partner/team/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId }),
      });
      const body = await response.json();
      setMessage(response.ok ? body.message : body.error || "Invitation could not be accepted.");
      if (response.ok && typeof body.canManageHotels === "boolean") {
        setCanManageHotels(body.canManageHotels);
        setAccepted(true);
      }
    } catch {
      setMessage("Invitation could not be accepted.");
    } finally {
      setBusy(false);
    }
  }

  const scopeCopy = authenticated !== true
    ? "Sign in to review the exact access included in this invitation before accepting it."
    : scopeLoading
      ? "Loading the access included in this invitation…"
      : canManageHotels === true
        ? "This invitation grants scoped inactive-property content, room, rate, future-inventory, and integration access for the assigned hotel team. It does not grant publication, billing, payout, or invitation permissions."
        : canManageHotels === false
          ? "This invitation grants integration access only. It does not grant property, room, rate, inventory, publication, billing, payout, or invitation permissions."
          : "The access included in this invitation could not be verified. Acceptance is disabled.";
  const destination = canManageHotels ? "/partner/properties" : "/partner/integrations";
  const destinationLabel = canManageHotels ? "Open hotel properties" : "Open hotel integrations";

  return <div className="card w-full max-w-lg p-8">
    <Link className="font-bold text-brand-700" href="/">iRatePilot</Link>
    <h1 className="mt-6 text-2xl font-bold">Hotel team invitation</h1>
    <p className="mt-2 text-sm text-slate-500">Sign in using the exact email address that received the invitation.</p>
    <p className="mt-3 text-sm text-slate-600" data-testid="invitation-scope">{scopeCopy}</p>
    {scopeError && <p className="mt-3 text-sm text-red-700" role="alert">{scopeError}</p>}
    {authenticated === null ? <p className="mt-6 text-sm text-slate-500">Checking your session…</p>
      : !authenticated ? <div className="mt-6 flex flex-wrap gap-3">
        <Link className="btn-primary" href={loginHref}>Sign in</Link>
        <Link className="btn-secondary" href={registerHref}>Create account</Link>
      </div>
        : <div className="mt-6">
          <p className="text-sm">Signed in as <strong>{email}</strong></p>
          {!accepted && <button className="btn-primary mt-4" disabled={busy || !invitationId || scopeLoading || canManageHotels === null} onClick={() => void accept()} type="button">{busy ? "Accepting…" : "Accept invitation"}</button>}
          {accepted && <Link className="btn-primary mt-4 inline-flex" href={destination}>{destinationLabel}</Link>}
        </div>}
    {message && <p className="mt-4 text-sm" role="status">{message}</p>}
    <p className="mt-6 text-xs text-slate-500">Invitation links are not bearer credentials. iRatePilot validates the signed-in account email, expiration, partner approval, and invitation status before granting access.</p>
  </div>;
}
