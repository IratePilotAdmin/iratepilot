"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import type { BookingPaymentMode } from "@/lib/stripe/booking-payment-mode";

type Breakdown = { confirmationCode: string; propertyName: string; roomName: string; total: number };

function ApprovedPaymentForm({ bookingId, breakdown, paymentMode }: { bookingId: string; breakdown: Breakdown; paymentMode: BookingPaymentMode }) {
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
      confirmParams: { return_url: `${window.location.origin}/account/trips` },
      redirect: "if_required",
    });
    if (result.error) {
      setMessage(result.error.message || "Payment could not be completed.");
      setBusy(false);
      return;
    }
    if (result.paymentIntent?.status !== "succeeded") {
      setMessage("Payment is still processing. Check your trips shortly.");
      setBusy(false);
      return;
    }

    const response = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/complete-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentIntentId: result.paymentIntent.id }),
    });
    const body = await response.json();
    if (response.ok) {
      window.location.assign(`/booking-confirmation?code=${encodeURIComponent(body.data.confirmation_code)}`);
      return;
    }
    setMessage(body.error || "Payment succeeded, but the reservation update is still processing.");
    setBusy(false);
  }

  return <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
    <form onSubmit={submit} className="card grid gap-5 p-6">
      <div><h2 className="text-xl font-semibold">Stripe {paymentMode === "test" ? "test " : ""}payment</h2><p className="mt-2 text-sm text-slate-600">{paymentMode === "test" ? "Use a Stripe test card only. No live card charge will be created." : "Your card is handled securely by Stripe. iRatePilot does not store card numbers."}</p></div>
      <PaymentElement />
      {message && <p role="status" className="text-sm text-slate-700">{message}</p>}
      <button disabled={!stripe || busy} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Processing…" : `Pay $${breakdown.total.toFixed(2)}${paymentMode === "test" ? " in test mode" : ""}`}</button>
    </form>
    <aside className="card h-fit p-6"><h2 className="font-semibold">Approved reservation</h2><p className="mt-3 font-semibold">{breakdown.propertyName}</p><p className="text-sm text-slate-500">{breakdown.roomName}</p><p className="mt-3 text-xs uppercase tracking-wider text-slate-500">{breakdown.confirmationCode}</p><div className="mt-5 flex justify-between border-t pt-4 text-lg font-bold"><span>Total</span><span>${breakdown.total.toFixed(2)}</span></div></aside>
  </div>;
}

export function ApprovedBookingCheckout({ bookingId, paymentMode, publishableKey }: { bookingId: string; paymentMode: BookingPaymentMode | null; publishableKey?: string }) {
  const stripePromise = useMemo(() => {
    const expectedPrefix = paymentMode === "test" ? "pk_test_" : paymentMode === "live" ? "pk_live_" : "";
    return expectedPrefix && publishableKey?.startsWith(expectedPrefix) ? loadStripe(publishableKey) : null;
  }, [paymentMode, publishableKey]);
  const [clientSecret, setClientSecret] = useState("");
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!paymentMode || !stripePromise) return;
    fetch(`/api/bookings/${encodeURIComponent(bookingId)}/payment-intent`, { method: "POST" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Payment could not be prepared.");
        setClientSecret(body.clientSecret);
        setBreakdown(body.breakdown);
      })
      .catch((reason: Error) => setError(reason.message));
  }, [bookingId, paymentMode, stripePromise]);

  if (!paymentMode || !stripePromise) return <div className="card p-8"><h2 className="text-xl font-semibold">Payment is unavailable</h2><p className="mt-3 text-slate-600">Secure payment is not currently enabled for this reservation.</p><Link href="/account/trips" className="btn-secondary mt-6">Return to trips</Link></div>;
  if (error) return <div className="card p-8"><p role="alert" className="text-red-700">{error}</p><Link href="/account/trips" className="btn-secondary mt-6">Return to trips</Link></div>;
  if (!clientSecret || !breakdown) return <p role="status" className="card p-6">Preparing secure payment…</p>;
  return <Elements stripe={stripePromise} options={{ clientSecret }}><ApprovedPaymentForm bookingId={bookingId} breakdown={breakdown} paymentMode={paymentMode} /></Elements>;
}
