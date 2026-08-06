"use client";

import { useEffect, useState } from "react";
import type { ReadinessItem } from "@/lib/admin/platform-readiness";

type Response = {
  items: ReadinessItem[];
  summary: { ready: number; attention: number; off: number };
  requiredReady: boolean;
};

const categories: Array<[ReadinessItem["category"], string]> = [
  ["core", "Core platform"],
  ["communications", "Communications"],
  ["payments", "Payments and pricing"],
  ["features", "Feature flags"],
];
const statusStyle = { ready: "text-emerald-700", attention: "text-amber-700", off: "text-slate-500" };

export function AdminSettings() {
  const [data, setData] = useState<Response | null>(null);
  const [message, setMessage] = useState("Checking platform readiness…");
  const [emailTestBusy, setEmailTestBusy] = useState(false);
  const [emailTestMessage, setEmailTestMessage] = useState("");

  async function sendEmailTest() {
    setEmailTestBusy(true);
    setEmailTestMessage("");
    try {
      const response = await fetch("/api/admin/email-test", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The test email could not be sent.");
      setEmailTestMessage(body.message);
    } catch (error) {
      setEmailTestMessage(error instanceof Error ? error.message : "The test email could not be sent.");
    } finally {
      setEmailTestBusy(false);
    }
  }

  useEffect(() => {
    fetch("/api/admin/settings", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        setData(body);
        setMessage("");
      })
      .catch((error: Error) => setMessage(error.message));
  }, []);

  return <>
    {message && <p role="status" className="card mt-8 p-6 text-sm text-slate-600">{message}</p>}
    {data && <>
      <section className={`card mt-8 border-l-4 p-6 ${data.requiredReady ? "border-l-emerald-600" : "border-l-amber-600"}`}>
        <span className="text-xs uppercase tracking-wider text-slate-500">Private pilot configuration</span>
        <h2 className="mt-2 text-2xl font-semibold">{data.requiredReady ? "Required services are configured" : "Required services need attention"}</h2>
        <p className="mt-2 text-sm text-slate-600">This checks configuration and connectivity only. It does not verify database migration state, legal approval, or production payment readiness.</p>
        <div className="mt-5 flex flex-wrap gap-5 text-sm"><span><strong>{data.summary.ready}</strong> ready</span><span><strong>{data.summary.attention}</strong> need attention</span><span><strong>{data.summary.off}</strong> intentionally off</span></div>
      </section>

      <section className="card mt-6 p-6">
        <h2 className="text-xl font-semibold">Transactional email test</h2>
        <p className="mt-2 text-sm text-slate-600">Send one operational test message to the signed-in administrator. This creates no booking, payment, refund, or partner transfer.</p>
        <button className="btn-primary mt-4" disabled={emailTestBusy} onClick={sendEmailTest}>{emailTestBusy ? "Sending…" : "Send test email"}</button>
        {emailTestMessage && <p className="mt-3 text-sm" role="status">{emailTestMessage}</p>}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">{categories.map(([category, label]) => <section className="card overflow-hidden" key={category}>
        <div className="border-b p-5"><h2 className="text-xl font-semibold">{label}</h2></div>
        <div className="divide-y">{data.items.filter((item) => item.category === category).map((item) => <article className="grid gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-start" key={item.id}>
          <div><strong>{item.label}</strong><p className="mt-1 text-sm text-slate-500">{item.detail}</p>{item.required && <span className="mt-2 block text-xs uppercase tracking-wider text-slate-400">Required for pilot</span>}</div>
          <span className={`text-sm font-semibold capitalize ${statusStyle[item.status]}`}>{item.status}</span>
        </article>)}</div>
      </section>)}</div>
    </>}
  </>;
}
