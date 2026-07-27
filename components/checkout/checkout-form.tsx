"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

type Breakdown = { subtotal: number; serviceFee: number; total: number };

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
    setMessage(result.error?.message || "Test payment submitted. No live booking was created.");
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
        <div className="mt-4 flex justify-between"><span>3 nights</span><span>${breakdown.subtotal.toFixed(2)}</span></div>
        <div className="mt-2 flex justify-between"><span>Service fee (5%)</span><span>${breakdown.serviceFee.toFixed(2)}</span></div>
        <div className="mt-4 flex justify-between border-t pt-4 text-lg font-bold"><span>Total</span><span>${breakdown.total.toFixed(2)}</span></div>
      </aside>
    </div>
  );
}

export function CheckoutForm() {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const enabled = process.env.NEXT_PUBLIC_ENABLE_TEST_CHECKOUT === "true";
  const stripePromise = useMemo(() => publishableKey?.startsWith("pk_test_") ? loadStripe(publishableKey) : null, [publishableKey]);
  const [clientSecret, setClientSecret] = useState("");
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled || !stripePromise) return;
    fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hotelSlug: "azure-grand-miami", roomName: "Deluxe King", nights: 3, guests: 2 })
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Checkout could not start.");
        setClientSecret(body.clientSecret);
        setBreakdown(body.breakdown);
      })
      .catch((reason: Error) => setError(reason.message));
  }, [enabled, stripePromise]);

  if (!enabled || !stripePromise) {
    return <div className="card p-8"><h2 className="text-xl font-semibold">Checkout is not available</h2><p className="mt-3 text-slate-600">iRatePilot is in a private pilot. Test checkout requires explicit Stripe test-mode configuration.</p></div>;
  }
  if (error) return <p role="alert" className="card p-6 text-red-700">{error}</p>;
  if (!clientSecret || !breakdown) return <p role="status" className="card p-6">Preparing secure test checkout…</p>;

  return <Elements stripe={stripePromise} options={{ clientSecret }}><PaymentForm breakdown={breakdown} /></Elements>;
}
