"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Invitation = {
  id: string;
  email: string;
  member_role: string;
  status: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};
type Member = {
  member_id: string;
  member_email: string;
  member_role: string;
  member_status: string;
  can_manage_integrations: boolean;
  updated_at: string;
};

export function PartnerTeamInvitations() {
  const [owner, setOwner] = useState<boolean | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [invitationResponse, accessResponse] = await Promise.all([
      fetch("/api/partner/team/invitations", { cache: "no-store" }),
      fetch("/api/partner/team/access", { cache: "no-store" }),
    ]);
    const [body, accessBody] = await Promise.all([
      invitationResponse.json(),
      accessResponse.json(),
    ]);
    if (!invitationResponse.ok) {
      setOwner(false);
      return setMessage(body.error || "Manager invitations could not be loaded.");
    }
    if (!accessResponse.ok) {
      setOwner(false);
      return setMessage(accessBody.error || "Manager access could not be loaded.");
    }
    setOwner(body.owner);
    setInvitations(body.invitations);
    setMembers(accessBody.members);
  }, []);

  useEffect(() => {
    // Initial remote-data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/partner/team/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        memberRole: form.get("memberRole"),
      }),
    });
    const body = await response.json();
    setMessage(response.ok ? body.message : body.error || "Invitation could not be sent.");
    if (response.ok) {
      event.currentTarget.reset();
      await load();
    }
    setBusy(false);
  }

  async function changeAccess(body: Record<string, string>) {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/partner/team/access", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    setMessage(response.ok ? result.message : result.error || "Team access could not be changed.");
    if (response.ok) await load();
    setBusy(false);
  }

  if (owner === null) return <p className="mt-8 text-sm text-slate-500">Checking team invitation access…</p>;
  if (!owner) return message ? <p className="mt-8 text-sm text-amber-700">{message}</p> : null;

  return <section className="card mt-8 overflow-hidden">
    <div className="border-b p-6">
      <h2 className="text-xl font-semibold">Hotel integration team</h2>
      <p className="mt-1 text-sm text-slate-500">Invite a general, revenue, or sales manager using their exact sign-in email. Access is limited to non-secret hotel-system onboarding.</p>
    </div>
    <div className="grid gap-8 p-6 xl:grid-cols-[420px_1fr]">
      <form className="grid h-fit gap-4" onSubmit={submit}>
        <label className="text-sm font-medium">Manager email
          <input autoComplete="email" className="input mt-2" maxLength={254} name="email" required type="email" />
        </label>
        <label className="text-sm font-medium">Integration role
          <select className="input mt-2" name="memberRole" required>
            <option value="">Select role</option>
            <option value="general_manager">General manager</option>
            <option value="revenue_manager">Revenue manager</option>
            <option value="sales_manager">Sales manager</option>
          </select>
        </label>
        <p className="text-xs text-amber-700">The invitation expires after seven days. It does not grant credentials, certification approval, or live-traffic access.</p>
        {message && <p className="text-sm" role="status">{message}</p>}
        <button className="btn-primary" disabled={busy} type="submit">{busy ? "Queueing…" : "Invite manager"}</button>
      </form>
      <div className="overflow-x-auto">
        {invitations.length === 0 ? <p className="text-sm text-slate-500">No manager invitations have been created.</p>
          : <table className="min-w-full text-left text-xs">
            <thead className="border-b text-slate-500"><tr><th className="px-2 py-2">Email</th><th className="px-2 py-2">Role</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Expires</th><th className="px-2 py-2">Action</th></tr></thead>
            <tbody className="divide-y">{invitations.map((invitation) => <tr key={invitation.id}>
              <td className="px-2 py-2">{invitation.email}</td>
              <td className="px-2 py-2">{invitation.member_role.replaceAll("_", " ")}</td>
              <td className="px-2 py-2">{invitation.status}</td>
              <td className="whitespace-nowrap px-2 py-2"><time dateTime={invitation.expires_at}>{new Date(invitation.expires_at).toLocaleDateString()}</time></td>
              <td className="px-2 py-2">{invitation.status === "pending"
                ? <button className="btn-secondary text-xs" disabled={busy} onClick={() => void changeAccess({ action: "revoke_invitation", invitationId: invitation.id })} type="button">Revoke</button>
                : "—"}</td>
            </tr>)}</tbody>
          </table>}
      </div>
    </div>
    <div className="border-t p-6">
      <h3 className="text-sm font-semibold">Active and disabled managers</h3>
      {members.length === 0 ? <p className="mt-3 text-sm text-slate-500">No manager has accepted an invitation.</p>
        : <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-xs">
          <thead className="border-b text-slate-500"><tr><th className="px-2 py-2">Email</th><th className="px-2 py-2">Role</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Action</th></tr></thead>
          <tbody className="divide-y">{members.map((member) => <tr key={member.member_id}>
            <td className="px-2 py-2">{member.member_email}</td>
            <td className="px-2 py-2">{member.member_role.replaceAll("_", " ")}</td>
            <td className="px-2 py-2">{member.member_status}</td>
            <td className="px-2 py-2">{member.member_status === "active" && member.can_manage_integrations
              ? <button className="btn-secondary text-xs" disabled={busy} onClick={() => void changeAccess({ action: "disable_member", memberId: member.member_id })} type="button">Disable access</button>
              : "—"}</td>
          </tr>)}</tbody>
        </table></div>}
      <p className="mt-3 text-xs text-slate-500">Revocation and deactivation are retained as immutable audit events. No invitation or membership record is deleted.</p>
    </div>
  </section>;
}
