"use client";

import { FormEvent, useEffect, useState } from "react";

type InboxBooking = {
  id: string;
  confirmation_code: string;
  status: string;
  check_in: string;
  check_out: string;
  properties?: { name?: string } | null;
  profiles?: { full_name?: string | null } | null;
  latestMessage?: { body: string; created_at: string } | null;
};
type ThreadMessage = { id: string; body: string; created_at: string; isMine: boolean; profiles?: { full_name?: string | null; role?: string } | null };

export function BookingMessageCenter({ mode }: { mode: "customer" | "partner" }) {
  const [bookings, setBookings] = useState<InboxBooking[]>([]);
  const [selected, setSelected] = useState("");
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [notice, setNotice] = useState("Loading booking conversations…");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(mode === "partner" ? "/api/partner/messages" : "/api/bookings/messages", { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setBookings(body.data || []);
      setSelected(body.data?.[0]?.id || "");
      setNotice(body.truncated ? "Showing the most recent conversations." : "");
    }).catch((error: Error) => setNotice(error.message));
  }, [mode]);

  useEffect(() => {
    if (!selected) return;
    fetch(`/api/bookings/${selected}/messages`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMessages(body.data || []);
      setNotice("");
    }).catch((error: Error) => setNotice(error.message));
  }, [selected]);

  function selectBooking(id: string) {
    setMessages([]);
    setNotice("Loading conversation…");
    setSelected(id);
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") || "");
    setSending(true);
    const response = await fetch(`/api/bookings/${selected}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
    const result = await response.json();
    setSending(false);
    setNotice(response.ok ? result.message : result.error);
    if (response.ok) {
      form.reset();
      const refreshed = await fetch(`/api/bookings/${selected}/messages`, { cache: "no-store" });
      const thread = await refreshed.json();
      if (refreshed.ok) setMessages(thread.data || []);
    }
  }

  const active = bookings.find((booking) => booking.id === selected);
  return <section className="card mt-8 grid min-h-[560px] overflow-hidden lg:grid-cols-[340px_1fr]">
    <aside className="border-b lg:border-b-0 lg:border-r">
      <div className="border-b p-5"><h2 className="font-semibold">Booking conversations</h2><p className="mt-1 text-sm text-slate-500">Messages stay attached to a reservation.</p></div>
      <div className="max-h-[620px] overflow-y-auto divide-y">{bookings.map((booking) => <button type="button" onClick={() => selectBooking(booking.id)} className={`w-full p-5 text-left ${selected === booking.id ? "bg-brand-50" : "hover:bg-slate-50"}`} key={booking.id}>
        <strong className="block text-sm">{booking.properties?.name || "Property"}</strong>
        <span className="mt-1 block text-xs text-slate-500">{mode === "partner" ? `${booking.profiles?.full_name || "Traveler"} · ` : ""}{booking.confirmation_code}</span>
        <span className="mt-2 block truncate text-sm text-slate-600">{booking.latestMessage?.body || "No messages yet"}</span>
      </button>)}</div>
      {!bookings.length && !notice && <p className="p-5 text-sm text-slate-500">No bookings are available for messaging.</p>}
    </aside>
    <div className="flex min-h-[560px] flex-col">
      <div className="border-b p-5"><h2 className="font-semibold">{active ? `${active.properties?.name || "Property"} · ${active.confirmation_code}` : "Select a booking"}</h2>{active && <p className="mt-1 text-sm text-slate-500">{active.check_in} to {active.check_out} · <span className="capitalize">{active.status}</span></p>}</div>
      <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-5">{messages.map((message) => <article className={`max-w-[85%] rounded-2xl p-4 text-sm ${message.isMine ? "ml-auto bg-brand-600 text-white" : "bg-white shadow-sm"}`} key={message.id}>
        <strong className="text-xs">{message.isMine ? "You" : message.profiles?.full_name || (mode === "partner" ? "Traveler" : "Property team")}</strong>
        <p className="mt-1 whitespace-pre-wrap leading-6">{message.body}</p><time className={`mt-2 block text-xs ${message.isMine ? "text-brand-100" : "text-slate-400"}`}>{new Date(message.created_at).toLocaleString()}</time>
      </article>)}{selected && !messages.length && !notice && <p className="text-center text-sm text-slate-500">No messages yet. Start this booking conversation below.</p>}</div>
      {notice && <p role="status" className="border-t px-5 pt-3 text-sm text-slate-600">{notice}</p>}
      <form onSubmit={send} className="flex gap-3 border-t p-5"><textarea name="body" className="input min-h-20 flex-1" maxLength={2000} placeholder="Write a booking message…" required disabled={!selected || sending} /><button className="btn-primary self-end" disabled={!selected || sending}>{sending ? "Sending…" : "Send"}</button></form>
    </div>
  </section>;
}
