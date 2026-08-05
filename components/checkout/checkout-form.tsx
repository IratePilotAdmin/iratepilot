"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

type Selection = { hotelSlug: string; roomId: string; checkIn: string; checkOut: string; guests: string };
type Breakdown = {
  propertyName: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  subtotal: number;
  serviceFee: number;
  total: number;
};

function PaymentForm({ breakdown }: { breakdown: Breakdown }) {
  const stripe = useStripe();
  const elements = useElements();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setMessage("");
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/booking-confirmation` },
      redirect: "if_required"
    });
    if (result.error) {
      setMessage(result.error.message || "Test payment could not be completed.");
      setBusy(false);
      return;
    }
    if (result.paymentIntent?.status === "succeeded") {
      const response = await fetch("/api/bookings/complete-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIntentId: result.paymentIntent.id })
      });
      const body = await response.json();
      if (response.ok) {
        window.location.assign(`/booking-confirmation?code=${encodeURIComponent(body.data.confirmation_code)}`);
        return;
      }
      setMessage(body.error || "Payment succeeded, but booking confirmation is still processing.");
    } else {
      setMessage("Payment is still processing. Check your trips shortly.");
    }
    setBusy(false);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <form onSubmit={submit} className="card grid gap-5 p-6">
        <div>
          <h2 className="text-xl font-semibold">Stripe test payment</h2>
          <p className="mt-2 text-sm text-slate-600">Use a Stripe test card only. Public reservations remain disabled.</p>
        </div>
        <PaymentElement />
        {message && <p role="status" className="text-sm text-slate-700">{message}</p>}
        <button disabled={!stripe || busy} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? "Processing…" : "Submit test payment"}
        </button>
      </form>
      <aside className="card h-fit p-6">
        <h2 className="font-semibold">Test booking summary</h2>
        <p className="mt-3 font-semibold">{breakdown.propertyName}</p>
        <p className="text-sm text-slate-500">{breakdown.roomName} · {breakdown.checkIn} to {breakdown.checkOut}</p>
        <p className="text-sm text-slate-500">{breakdown.guests} guests</p>
        <div className="mt-4 flex justify-between"><span>{breakdown.nights} nights</span><span>${breakdown.subtotal.toFixed(2)}</span></div>
        <div className="mt-2 flex justify-between"><span>Traveler service fee{breakdown.serviceFee === 0 ? " (member benefit)" : ""}</span><span>${breakdown.serviceFee.toFixed(2)}</span></div>
        <div className="mt-4 flex justify-between border-t pt-4 text-lg font-bold"><span>Total</span><span>${breakdown.total.toFixed(2)}</span></div>
      </aside>
    </div>
  );
}

export function CheckoutForm({ publishableKey, enabled, selection }: { publishableKey?: string; enabled: boolean; selection: Selection }) {
  const router = useRouter();
  const selectionComplete = Boolean(selection.hotelSlug && selection.roomId && selection.checkIn && selection.checkOut && selection.guests);
  const stripePromise = useMemo(() => publishableKey?.startsWith("pk_test_") ? loadStripe(publishableKey) : null, [publishableKey]);
  const [checkoutAttemptId] = useState(() => crypto.randomUUID());
  const [clientSecret, setClientSecret] = useState("");
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled || !stripePromise || !selectionComplete) return;
    fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": checkoutAttemptId },
      body: JSON.stringify(selection)
    })
      .then(async (response) => {
        const body = await response.json();
        if (response.status === 401) {
          const nextPath = `${window.location.pathname}${window.location.search}`;
          router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
          return;
        }
        if (!response.ok) throw new Error(body.error || "Checkout could not start.");
        setClientSecret(body.clientSecret);
        setBreakdown(body.breakdown);
      })
      .catch((reason: Error) => setError(reason.message));
  }, [checkoutAttemptId, enabled, router, selection, selectionComplete, stripePromise]);

  if (!enabled || !stripePromise) {
    return <div className="card p-8"><h2 className="text-xl font-semibold">Checkout is not available</h2><p className="mt-3 text-slate-600">iRatePilot is in a private pilot. Test checkout requires explicit Stripe test-mode configuration.</p></div>;
  }
  if (!selectionComplete) {
    return <div className="card p-8"><h2 className="text-xl font-semibold">Choose a stay first</h2><p className="mt-3 text-slate-600">Select a property, room, dates, and guest count before opening checkout.</p><Link href="/search" className="btn-primary mt-6">Browse premium stays</Link></div>;
  }
  if (error) return <p role="alert" className="card p-6 text-red-700">{error}</p>;
  if (!clientSecret || !breakdown) return <p role="status" className="card p-6">Preparing secure test checkout…</p>;

  return <Elements stripe={stripePromise} options={{ clientSecret }}><PaymentForm breakdown={breakdown} /></Elements>;
}
