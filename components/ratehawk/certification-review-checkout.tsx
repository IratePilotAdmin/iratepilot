"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

type Checkout = {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
};

type CompletedResult = {
  partnerOrderId: string;
  finalStatus: string;
  cancelled: boolean;
  refunded: boolean;
};

function CertificationPaymentForm({ checkout }: { checkout: Checkout }) {
  const stripe = useStripe();
  const elements = useElements();
  const [paymentReady, setPaymentReady] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<CompletedResult | null>(null);

  async function pay(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements || !paymentReady) return;
    setBusy(true);
    setMessage("");
    const confirmation = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/certification/ratehawk` },
      redirect: "if_required",
    });
    if (confirmation.error) {
      setMessage(confirmation.error.message || "The Stripe test payment was not completed.");
      setBusy(false);
      return;
    }
    if (confirmation.paymentIntent?.status !== "succeeded") {
      setMessage("The Stripe test payment is still processing. No RateHawk booking was started.");
      setBusy(false);
      return;
    }
    setPaymentComplete(true);
    setMessage("Stripe test payment succeeded. No real money was charged.");
    setBusy(false);
  }

  async function runBooking() {
    setBusy(true);
    setMessage("Running the RateHawk sandbox booking, final-status, cancellation, and test refund steps…");
    const response = await fetch("/api/certification/ratehawk/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentIntentId: checkout.paymentIntentId,
        confirmation: "RUN RATEHAWK SANDBOX BOOKING",
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error || "The RateHawk sandbox workflow could not be completed.");
      setBusy(false);
      return;
    }
    setResult(body.data);
    setMessage(body.message);
    setBusy(false);
  }

  return <div className="grid gap-6">
    <form onSubmit={pay} className="grid gap-5 border border-neutral-300 bg-white p-6">
      <div>
        <span className="section-kicker">Step 1 · Stripe test payment</span>
        <h2 className="mt-3 text-2xl">Verify the website checkout.</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600">Use Stripe test card <strong>4242 4242 4242 4242</strong>, any future expiry, and any CVC. The ${checkout.amount.toFixed(2)} test charge cannot move real money.</p>
      </div>
      <PaymentElement onReady={() => setPaymentReady(true)} onLoadError={() => setMessage("Stripe’s test payment form could not load.")} />
      <button className="btn-primary" disabled={!stripe || !elements || !paymentReady || busy || paymentComplete}>{paymentComplete ? "Test payment completed" : busy ? "Processing…" : `Pay $${checkout.amount.toFixed(2)} in test mode`}</button>
    </form>

    <section className="border border-neutral-300 bg-white p-6">
      <span className="section-kicker">Step 2 · RateHawk sandbox lifecycle</span>
      <h2 className="mt-3 text-2xl">Confirm and cancel the test booking.</h2>
      <p className="mt-2 text-sm leading-6 text-neutral-600">After the test payment succeeds, this runs RateHawk’s documented sandbox booking flow, polls final status, cancels the confirmed test reservation, and refunds the Stripe test charge.</p>
      <button type="button" className="btn-primary mt-5" disabled={!paymentComplete || busy || Boolean(result)} onClick={runBooking}>{result ? "Sandbox lifecycle completed" : busy ? "Running sandbox lifecycle…" : "Run test booking and cancellation"}</button>
      {result ? <dl className="mt-6 grid gap-3 border-t pt-5 text-sm sm:grid-cols-2">
        <div><dt className="text-neutral-500">RateHawk order</dt><dd className="break-all font-semibold">{result.partnerOrderId}</dd></div>
        <div><dt className="text-neutral-500">Final status</dt><dd className="font-semibold">{result.finalStatus}</dd></div>
        <div><dt className="text-neutral-500">Cancellation</dt><dd className="font-semibold">{result.cancelled ? "Completed" : "Not completed"}</dd></div>
        <div><dt className="text-neutral-500">Stripe test refund</dt><dd className="font-semibold">{result.refunded ? "Completed" : "Pending"}</dd></div>
      </dl> : null}
    </section>
    {message ? <p role="status" className="border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">{message}</p> : null}
  </div>;
}

export function RatehawkCertificationReviewCheckout({ publishableKey }: { publishableKey: string }) {
  const stripe = useMemo(() => publishableKey.startsWith("pk_test_") ? loadStripe(publishableKey) : null, [publishableKey]);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const sessionId = crypto.randomUUID();
    fetch("/api/certification/ratehawk/payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Certification checkout is unavailable.");
      setCheckout(body);
    }).catch((reason: Error) => setError(reason.message));
  }, []);

  if (!stripe) return <p role="alert" className="border border-red-200 bg-red-50 p-4 text-red-900">Stripe test mode is not configured.</p>;
  if (error) return <p role="alert" className="border border-red-200 bg-red-50 p-4 text-red-900">{error}</p>;
  if (!checkout) return <p role="status" className="border border-neutral-300 bg-white p-6">Preparing Stripe test checkout…</p>;
  return <Elements stripe={stripe} options={{ clientSecret: checkout.clientSecret }}><CertificationPaymentForm checkout={checkout} /></Elements>;
}

