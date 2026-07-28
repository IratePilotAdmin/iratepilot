"use client";

import { useCallback, useEffect, useState } from "react";

type Application = {
  id: string;
  property_name: string;
  contact_name: string;
  email: string;
  property_type: string;
  status: "pending" | "approved" | "declined";
  created_at: string;
};

export function AdminPartnerApplications() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/partner-applications");
    const body = await response.json();
    if (response.ok) setApplications(body.data);
    else setMessage(body.error || "Applications could not be loaded.");
  }, []);

  useEffect(() => {
    // Initial remote-data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function decide(id: string, status: Application["status"]) {
    setBusy(id);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/partner-applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await response.json();
      setMessage(
        response.ok
          ? `${body.data.property_name} was marked ${status}.`
          : body.error || "The decision could not be saved."
      );
      if (response.ok) await load();
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="card mt-8 overflow-hidden">
      <div className="border-b border-slate-200 p-6">
        <h2 className="text-xl font-semibold">Application review queue</h2>
        <p className="mt-1 text-sm text-slate-500">
          Approval records the review decision. Partner access and property
          activation remain separate controlled steps.
        </p>
        {message && <p role="status" className="mt-3 text-sm">{message}</p>}
      </div>
      <div className="divide-y divide-slate-200">
        {applications.length === 0 && (
          <p className="p-6 text-sm text-slate-500">No partner applications yet.</p>
        )}
        {applications.map((application) => (
          <article
            key={application.id}
            className="grid gap-5 p-6 lg:grid-cols-[1fr_auto] lg:items-center"
          >
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <strong>{application.property_name}</strong>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-600">
                  {application.status}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                {application.property_type.replace("_", " ")} ·{" "}
                {application.contact_name} · {application.email}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Submitted {new Date(application.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-primary"
                disabled={busy === application.id || application.status === "approved"}
                onClick={() => decide(application.id, "approved")}
              >
                {application.status === "approved" ? "Approved" : "Approve"}
              </button>
              <button
                className="btn-secondary"
                disabled={busy === application.id || application.status === "declined"}
                onClick={() => decide(application.id, "declined")}
              >
                Decline
              </button>
              {application.status !== "pending" && (
                <button
                  className="btn-secondary"
                  disabled={busy === application.id}
                  onClick={() => decide(application.id, "pending")}
                >
                  Return to review
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
