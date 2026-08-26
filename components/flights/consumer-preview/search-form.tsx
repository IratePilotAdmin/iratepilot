"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, PlaneTakeoff, ShieldCheck, Users } from "lucide-react";
import {
  requestFlightConsumerPreviewSearch,
  type FlightConsumerPreviewClientSearchRequest,
} from "@/components/flights/consumer-preview/search-recovery";

export function ConsumerFlightPreviewSearchForm({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [tripType, setTripType] = useState<"one_way" | "round_trip">("round_trip");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || busy) return;

    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    const values = new FormData(form);
    const returnDate = tripType === "round_trip" ? String(values.get("returnDate") || "") : null;
    const request = Object.freeze({
      origin: String(values.get("origin") || "").toUpperCase(),
      destination: String(values.get("destination") || "").toUpperCase(),
      departureDate: String(values.get("departureDate") || ""),
      returnDate: returnDate || null,
      cabin: String(values.get("cabin") || "economy"),
      travelerCount: Number(values.get("travelerCount")),
    }) as FlightConsumerPreviewClientSearchRequest;
    setBusy(true);
    setMessage("");

    try {
      const result = await requestFlightConsumerPreviewSearch({
        request,
        storage: window.localStorage,
      });
      if (result.decision !== "observed") {
        setMessage("This test search has an unknown result. Check the same search again; no second Duffel dispatch will be authorized blindly.");
        setBusy(false);
        return;
      }
      if (result.nextAction === "new_search") {
        setMessage("The previous durable test search ended safely. Submit again to start a new test search.");
        setBusy(false);
        return;
      }
      router.push(`/flights/preview/results/${encodeURIComponent(result.searchId)}`);
    } catch {
      setMessage("This browser could not retain a safe retry identity, so the test search was not sent.");
      setBusy(false);
    }
  }

  if (!enabled) {
    return (
      <div className="border border-neutral-300 bg-neutral-100 p-6" aria-disabled="true">
        <p className="font-semibold">Search is disabled.</p>
        <p className="mt-2 text-sm text-neutral-600">The server-side Preview gate is closed.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} onChange={() => setMessage("")} className="border border-black bg-white p-5 sm:p-7" aria-busy={busy}>
      <fieldset disabled={busy}>
        <legend className="text-sm font-semibold uppercase tracking-[.14em]">Test itinerary</legend>
        <div className="mt-5 flex flex-wrap gap-5 border-b border-neutral-200 pb-5">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="radio"
              name="tripType"
              value="round_trip"
              checked={tripType === "round_trip"}
              onChange={() => setTripType("round_trip")}
            />
            Round trip
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="radio"
              name="tripType"
              value="one_way"
              checked={tripType === "one_way"}
              onChange={() => setTripType("one_way")}
            />
            One way
          </label>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <label className="block text-sm font-semibold" htmlFor="preview-origin">
            <span className="flex items-center gap-2"><PlaneTakeoff aria-hidden="true" className="h-4 w-4" />From</span>
            <input id="preview-origin" name="origin" className="input mt-2 uppercase" inputMode="text" autoComplete="off" minLength={3} maxLength={3} pattern="[A-Za-z]{3}" placeholder="ORD" required />
            <span className="mt-1 block text-xs font-normal text-neutral-500">Three-letter airport code</span>
          </label>
          <label className="block text-sm font-semibold" htmlFor="preview-destination">
            <span className="flex items-center gap-2"><PlaneTakeoff aria-hidden="true" className="h-4 w-4 rotate-90" />To</span>
            <input id="preview-destination" name="destination" className="input mt-2 uppercase" inputMode="text" autoComplete="off" minLength={3} maxLength={3} pattern="[A-Za-z]{3}" placeholder="MIA" required />
            <span className="mt-1 block text-xs font-normal text-neutral-500">Three-letter airport code</span>
          </label>
          <label className="block text-sm font-semibold" htmlFor="preview-departure-date">
            <span className="flex items-center gap-2"><CalendarDays aria-hidden="true" className="h-4 w-4" />Depart</span>
            <input id="preview-departure-date" name="departureDate" className="input mt-2" type="date" required />
          </label>
          <label className="block text-sm font-semibold" htmlFor="preview-return-date">
            <span className="flex items-center gap-2"><CalendarDays aria-hidden="true" className="h-4 w-4" />Return</span>
            <input id="preview-return-date" name="returnDate" className="input mt-2" type="date" required={tripType === "round_trip"} disabled={tripType === "one_way"} />
          </label>
          <label className="block text-sm font-semibold" htmlFor="preview-travelers">
            <span className="flex items-center gap-2"><Users aria-hidden="true" className="h-4 w-4" />Fictional travelers</span>
            <select id="preview-travelers" name="travelerCount" className="input mt-2" defaultValue="1">
              {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count} adult{count === 1 ? "" : "s"}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold" htmlFor="preview-cabin">
            Cabin
            <select id="preview-cabin" name="cabin" className="input mt-2" defaultValue="economy">
              <option value="economy">Economy</option>
              <option value="premium_economy">Premium economy</option>
              <option value="business">Business</option>
              <option value="first">First</option>
            </select>
          </label>
        </div>
      </fieldset>

      <div className="mt-7 flex flex-col gap-5 border-t border-neutral-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex max-w-2xl items-start gap-2 text-sm leading-6 text-neutral-600">
          <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-neutral-900" />
          This calls only the gated Preview API. The server authenticates your account and stores the test search before showing results.
        </p>
        <button type="submit" disabled={busy} className="btn-primary min-w-52 gap-2 disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? "Searching test inventory…" : "Search test inventory"}
          {!busy ? <ArrowRight aria-hidden="true" className="h-4 w-4" /> : null}
        </button>
      </div>
      <div className="mt-4 min-h-6" aria-live="polite">
        {message ? <p role="alert" className="text-sm font-medium text-red-700">{message}</p> : null}
      </div>
    </form>
  );
}
