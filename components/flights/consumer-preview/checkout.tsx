"use client";

import { type FormEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { CircleCheck, LockKeyhole, ShieldAlert } from "lucide-react";
import { ConsumerFlightItinerary } from "@/components/flights/consumer-preview/itinerary";
import {
  durableFlightConsumerPreviewCheckoutKey,
  flightConsumerPreviewStripeErrorNeedsDurableRecovery,
} from "@/components/flights/consumer-preview/checkout-idempotency";
import {
  requestFlightConsumerPreviewAuthoritativeCompletion,
} from "@/components/flights/consumer-preview/authoritative-completion-recovery";
import {
  durableFlightConsumerPreviewCompletionKey,
} from "@/components/flights/consumer-preview/stripe-return-recovery";
import {
  formatConsumerFlightMoney,
  formatConsumerFlightStatus,
  type ConsumerFlightOrderDto,
} from "@/components/flights/consumer-preview/types";
import { discloseFlightConsumerPreviewFictionalTravelers } from "@/lib/flights/consumer-preview/fictional-travelers";

type PreparePaymentResponse = {
  clientSecret?: unknown;
  paymentIntentId?: unknown;
  data?: { clientSecret?: unknown; paymentIntentId?: unknown };
  error?: unknown;
};

type CompletionResponse = {
  orderId?: unknown;
  data?: { orderId?: unknown };
  error?: unknown;
};

function FlightTestRecoveryControl({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function recover() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    const outcome = await requestFlightConsumerPreviewAuthoritativeCompletion({
      orderId,
      post: (url, init) => fetch(url, init),
      replace: (url) => router.replace(url),
      refresh: () => router.refresh(),
    }).catch(() => "review" as const);
    if (outcome === "review") {
      setMessage("The server could not prove a safe automatic next step. Review the durable receipt before retrying anything.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 border border-sky-300 bg-sky-50 p-5 text-sm leading-6 text-sky-950">
      <strong className="block">Recover from a closed or reloaded browser</strong>
      <p className="mt-2">The server can inspect its owner-bound Stripe test-payment and provider journals without trusting browser payment details.</p>
      <button type="button" onClick={recover} disabled={busy} className="btn-secondary mt-4 disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? "Checking durable records…" : "Check and resume durable test order"}
      </button>
      {message ? <p className="mt-3 font-medium text-amber-900" role="alert">{message}</p> : null}
    </div>
  );
}

function FlightTestPaymentForm({ order, paymentIntentId }: { order: ConsumerFlightOrderDto; paymentIntentId: string }) {
  const router = useRouter();
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [recoveryNeeded, setRecoveryNeeded] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements || busy) return;
    setBusy(true);
    setMessage("");

    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/flights/preview/confirmation/${encodeURIComponent(order.id)}`,
        },
        redirect: "if_required",
      });

      if (result.error) {
        if (flightConsumerPreviewStripeErrorNeedsDurableRecovery(result.error.type)) {
          setRecoveryNeeded(true);
          setMessage("Stripe returned an indeterminate test-payment result. Use the server-owned recovery control below before retrying anything.");
        } else {
          setMessage(result.error.message || "The Stripe test payment method was not accepted.");
        }
        setBusy(false);
        return;
      }

      const confirmedPaymentIntentId = result.paymentIntent?.id || paymentIntentId;
      const completionIdempotencyKey = durableFlightConsumerPreviewCompletionKey(
        order.id,
        window.localStorage,
        () => window.crypto.randomUUID(),
      );
      const response = await fetch(`/api/flights/preview/orders/${encodeURIComponent(order.id)}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": completionIdempotencyKey,
        },
        body: JSON.stringify({ paymentIntentId: confirmedPaymentIntentId }),
      });
      const body = (await response.json().catch(() => ({}))) as CompletionResponse;
      const completedOrderId = body.data?.orderId ?? body.orderId;

      if (!response.ok || completedOrderId !== order.id) {
        setRecoveryNeeded(true);
        setMessage(typeof body.error === "string" ? body.error : "Payment evidence was received, but durable test-order finalization is still pending.");
        setBusy(false);
        return;
      }

      router.push(`/flights/preview/confirmation/${encodeURIComponent(order.id)}`);
      router.refresh();
    } catch {
      setRecoveryNeeded(true);
      setMessage("Stripe test authorization may have progressed, but the browser could not persist a safe completion identity. Use the server-owned recovery control below.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 border border-black bg-white p-6 sm:p-8" aria-busy={busy}>
      <div className="flex items-start gap-3">
        <LockKeyhole aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <h2 className="text-2xl">Stripe test authorization</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-600">Use a Stripe test card only. Card details are hosted by Stripe and are never stored by iRatePilot.</p>
        </div>
      </div>
      <div className="mt-6"><PaymentElement options={{ paymentMethodOrder: ["card"] }} /></div>
      <button type="submit" disabled={!stripe || !elements || busy} className="btn-primary mt-7 w-full disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? "Authorizing and finalizing…" : `Authorize ${formatConsumerFlightMoney(order.totalCents, order.currency)} in Stripe test mode`}
      </button>
      <p className="mt-4 text-xs leading-5 text-neutral-500">The server independently verifies payment, order ownership, price evidence, Duffel test-order creation, and ticket evidence. This button never claims success by itself.</p>
      <div className="mt-4 min-h-6" aria-live="polite">
        {message ? <p role="alert" className="text-sm font-medium text-red-700">{message}</p> : null}
      </div>
      {recoveryNeeded ? <FlightTestRecoveryControl orderId={order.id} /> : null}
    </form>
  );
}

export function ConsumerFlightPreviewCheckout({
  enabled,
  order,
  publishableKey,
}: {
  enabled: boolean;
  order: ConsumerFlightOrderDto;
  publishableKey?: string;
}) {
  const testStripe = enabled && publishableKey?.startsWith("pk_test_") ? publishableKey : null;
  const stripePromise = useMemo(() => (testStripe ? loadStripe(testStripe) : null), [testStripe]);
  const travelers = useMemo(
    () => discloseFlightConsumerPreviewFictionalTravelers(order.search.travelerCount),
    [order.search.travelerCount],
  );
  const idempotencyKey = useRef<string | null>(null);
  const [fictionalDataConfirmed, setFictionalDataConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [payment, setPayment] = useState<{ clientSecret: string; paymentIntentId: string } | null>(null);
  const checkoutAllowed = order.status === "pending_payment";
  const hasProgressed = !checkoutAllowed;

  async function preparePayment() {
    if (!enabled || !stripePromise || !fictionalDataConfirmed || busy || !checkoutAllowed) return;
    setBusy(true);
    setMessage("");

    try {
      idempotencyKey.current = durableFlightConsumerPreviewCheckoutKey(
        order.id,
        idempotencyKey.current,
        window.localStorage,
        () => window.crypto.randomUUID(),
      );
      const response = await fetch(`/api/flights/preview/orders/${encodeURIComponent(order.id)}/prepare-payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify({ travelers }),
      });
      const body = (await response.json().catch(() => ({}))) as PreparePaymentResponse;
      const clientSecret = body.data?.clientSecret ?? body.clientSecret;
      const paymentIntentId = body.data?.paymentIntentId ?? body.paymentIntentId;
      if (!response.ok || typeof clientSecret !== "string" || typeof paymentIntentId !== "string") {
        throw new Error(typeof body.error === "string" ? body.error : "Stripe test payment could not be prepared.");
      }

      setPayment({ clientSecret, paymentIntentId });
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Stripe test payment could not be prepared.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div>
        <section className="border border-neutral-300 bg-white p-6 sm:p-8" aria-labelledby="test-travelers-title">
          <div className="flex items-start gap-3">
            <ShieldAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <h2 id="test-travelers-title" className="text-2xl">Fictional traveler records</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-600">These fixed test identities prevent genuine personal data from entering the Preview. They cannot be edited.</p>
            </div>
          </div>
          <div className="mt-6 grid gap-4">
            {travelers.map((traveler) => (
              <fieldset key={traveler.travelerSequence} className="grid gap-4 border border-neutral-200 bg-neutral-50 p-5 sm:grid-cols-2">
                <legend className="px-2 text-xs font-semibold uppercase tracking-[.12em]">Test traveler {traveler.travelerSequence}</legend>
                <label className="text-sm font-semibold">Given name<input className="input mt-2 bg-neutral-100" value={traveler.givenName} readOnly /></label>
                <label className="text-sm font-semibold">Family name<input className="input mt-2 bg-neutral-100" value={traveler.familyName} readOnly /></label>
                <label className="text-sm font-semibold">Date of birth<input className="input mt-2 bg-neutral-100" type="date" value={traveler.bornOn} readOnly /></label>
                <label className="text-sm font-semibold">Test email<input className="input mt-2 bg-neutral-100" type="email" value={traveler.email} readOnly /></label>
              </fieldset>
            ))}
          </div>
          <label className="mt-6 flex items-start gap-3 border border-amber-300 bg-amber-50 p-4 text-sm leading-6">
            <input type="checkbox" className="mt-1" checked={fictionalDataConfirmed} onChange={(event) => setFictionalDataConfirmed(event.target.checked)} disabled={!enabled || !checkoutAllowed || Boolean(payment)} />
            <span>I confirm these are fictional test identities and I will not submit real traveler or payment information in this Preview.</span>
          </label>

          {!payment ? (
            <button type="button" onClick={preparePayment} disabled={!enabled || !checkoutAllowed || !stripePromise || !fictionalDataConfirmed || busy} className="btn-primary mt-6 w-full disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? "Preparing Stripe test payment…" : "Continue to Stripe test payment"}
            </button>
          ) : null}
          <div className="mt-4 min-h-6" aria-live="polite">
            {message ? <p role="alert" className="text-sm font-medium text-red-700">{message}</p> : null}
          </div>
          {checkoutAllowed && order.payment ? <FlightTestRecoveryControl orderId={order.id} /> : null}
        </section>

        {checkoutAllowed && payment && stripePromise ? (
          <Elements stripe={stripePromise} options={{ clientSecret: payment.clientSecret }}>
            <FlightTestPaymentForm order={order} paymentIntentId={payment.paymentIntentId} />
          </Elements>
        ) : null}

        {!testStripe ? (
          <div className="mt-6 border border-red-300 bg-red-50 p-5 text-sm leading-6 text-red-900" role="alert">
            A Stripe test publishable key is not available. Payment remains fail-closed; a live key is never accepted here.
          </div>
        ) : null}

        {hasProgressed ? (
          <div className="mt-6 border border-neutral-300 bg-neutral-50 p-6">
            <div className="flex items-start gap-3"><CircleCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" /><div><h2 className="text-xl">This test order has progressed.</h2><p className="mt-2 text-sm text-neutral-700">Its latest durable status is {formatConsumerFlightStatus(order.status)}. Read the database-backed receipt for the authoritative result.</p></div></div>
            <Link href={`/flights/preview/confirmation/${encodeURIComponent(order.id)}`} className="btn-primary mt-5">View durable test receipt</Link>
          </div>
        ) : null}
      </div>

      <aside className="h-fit border border-black bg-[#071b2b] p-6 text-white lg:sticky lg:top-28" aria-label="Test order summary">
        <span className="text-xs font-semibold uppercase tracking-[.14em] text-amber-300">Order {order.confirmationCode}</span>
        <h2 className="mt-3 text-3xl text-white">{order.search.origin} to {order.search.destination}</h2>
        <p className="mt-2 text-sm text-slate-300">{order.search.travelerCount} fictional traveler{order.search.travelerCount === 1 ? "" : "s"} · {formatConsumerFlightStatus(order.search.cabin)}</p>
        <div className="mt-6 bg-white px-4 text-neutral-950"><ConsumerFlightItinerary segments={order.segments} /></div>
        <dl className="mt-6 grid gap-4 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-slate-400">Durable status</dt><dd className="font-semibold">{formatConsumerFlightStatus(order.status)}</dd></div>
          <div className="flex justify-between gap-4 border-t border-white/20 pt-4 text-lg"><dt>Test total</dt><dd className="font-semibold">{formatConsumerFlightMoney(order.totalCents, order.currency)}</dd></div>
        </dl>
        <p className="mt-5 text-xs leading-5 text-slate-400">No Production airline inventory, card charge, or valid travel document is created by this Preview.</p>
      </aside>
    </div>
  );
}
