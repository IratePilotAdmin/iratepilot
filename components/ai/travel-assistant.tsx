"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";

type Message = {
  role: "assistant" | "user";
  content: string;
};

export function TravelAssistant() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Tell me your destination, dates, and preferred experience." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [signInRequired, setSignInRequired] = useState(false);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = input.trim();
    if (!message || busy) return;

    setMessages((current) => [...current, { role: "user", content: message }]);
    setInput("");
    setBusy(true);
    setError("");
    setSignInRequired(false);

    try {
      const response = await fetch("/api/ai/travel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const body = await response.json();
      if (!response.ok) {
        setSignInRequired(response.status === 401);
        throw new Error(body.error || "The AI travel planner is unavailable.");
      }
      setMessages((current) => [...current, { role: "assistant", content: body.message }]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The AI travel planner is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 p-5 font-semibold">AI travel assistant</div>
      <div className="h-80 space-y-3 overflow-y-auto p-5">
        {messages.map((message, i) => <div key={i} className={message.role === "user" ? "ml-auto max-w-[80%] rounded-xl bg-brand-600 p-3 text-sm text-white" : "max-w-[80%] whitespace-pre-wrap rounded-xl bg-slate-100 p-3 text-sm"}>{message.content}</div>)}
        {busy && <div className="max-w-[80%] rounded-xl bg-slate-100 p-3 text-sm text-slate-600" role="status">Planning your trip…</div>}
      </div>
      <form className="border-t border-slate-200 p-4" onSubmit={send}>
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="travel-plan-message">Travel-planning request</label>
          <input id="travel-plan-message" className="input" value={input} maxLength={2_000} onChange={(e) => setInput(e.target.value)} placeholder="Plan my trip..." disabled={busy} />
          <button className="btn-primary" type="submit" disabled={busy || input.trim().length < 3}>{busy ? "Planning…" : "Send"}</button>
        </div>
        {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}{signInRequired && <> <Link className="font-semibold underline" href={`/login?next=${encodeURIComponent("/ai-planner")}`}>Sign in to continue</Link>.</>}</p>}
        <p className="mt-3 text-xs text-slate-500">Planning guidance only. Verify current rates, availability, and terms before booking. Do not enter payment details or government ID numbers.</p>
      </form>
    </div>
  );
}
