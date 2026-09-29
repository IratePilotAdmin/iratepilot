"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const paymentIntentPattern = /^pi_[A-Za-z0-9]{8,252}$/;

type RecoveryOutcome = "ignored" | "requested" | "review";
type RecoveryState = "idle" | "recovering" | "review";
type DurableStorage = Pick<Storage, "getItem" | "setItem">;

type StripeReturnCompletionInput = {
  orderId: string;
  paymentIntentId: string;
  storage: DurableStorage;
  createUuid: () => string;
  post: (url: string, init: RequestInit) => Promise<{ ok: boolean }>;
  replace: (url: string) => void;
  refresh: () => void;
  onReview?: () => void;
};

export function readFlightConsumerPreviewStripeReturnPaymentIntent(search: string) {
  const values = new URLSearchParams(search).getAll("payment_intent");
  if (values.length !== 1) return null;
  return paymentIntentPattern.test(values[0]) ? values[0] : null;
}

function completionStorageKey(orderId: string) {
  return `iratepilot:flight-preview:redirect-completion:${orderId}`;
}

export function durableFlightConsumerPreviewCompletionKey(
  orderId: string,
  storage: DurableStorage,
  createUuid: () => string,
) {
  if (!uuidPattern.test(orderId)) throw new TypeError("Invalid Preview order identity.");
  const key = completionStorageKey(orderId);
  const stored = storage.getItem(key);
  if (stored) {
    if (!uuidPattern.test(stored)) {
      throw new TypeError("Invalid Preview completion identity.");
    }
    return stored.toLowerCase();
  }

  const created = createUuid().toLowerCase();
  if (!uuidPattern.test(created)) throw new TypeError("Invalid Preview completion identity.");
  storage.setItem(key, created);
  if (storage.getItem(key)?.toLowerCase() !== created) {
    throw new TypeError("Preview completion identity was not persisted.");
  }
  return created;
}

export async function requestFlightConsumerPreviewStripeReturnCompletion(
  input: StripeReturnCompletionInput,
): Promise<RecoveryOutcome> {
  if (!uuidPattern.test(input.orderId) || !paymentIntentPattern.test(input.paymentIntentId)) {
    return "ignored";
  }

  const cleanUrl = `/flights/preview/confirmation/${encodeURIComponent(input.orderId)}`;
  let outcome: RecoveryOutcome = "review";

  try {
    const idempotencyKey = durableFlightConsumerPreviewCompletionKey(
      input.orderId,
      input.storage,
      input.createUuid,
    );
    const response = await input.post(
      `/api/flights/preview/orders/${encodeURIComponent(input.orderId)}/complete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ paymentIntentId: input.paymentIntentId }),
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
        referrerPolicy: "no-referrer",
      },
    );
    outcome = response.ok ? "requested" : "review";
  } catch {
    outcome = "review";
  }

  if (outcome === "review") input.onReview?.();
  try {
    input.replace(cleanUrl);
  } catch {
    outcome = "review";
    input.onReview?.();
  } finally {
    input.refresh();
  }
  return outcome;
}

export function ConsumerFlightPreviewStripeReturnRecovery({ orderId }: { orderId: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [state, setState] = useState<RecoveryState>("idle");

  useEffect(() => {
    if (started.current) return;
    const paymentIntentId = readFlightConsumerPreviewStripeReturnPaymentIntent(window.location.search);
    if (!paymentIntentId) return;

    const start = window.setTimeout(() => {
      if (started.current) return;
      started.current = true;
      setState("recovering");
      void requestFlightConsumerPreviewStripeReturnCompletion({
        orderId,
        paymentIntentId,
        storage: window.localStorage,
        createUuid: () => window.crypto.randomUUID(),
        post: (url, init) => fetch(url, init),
        replace: (url) => window.history.replaceState(window.history.state, "", url),
        refresh: () => router.refresh(),
        onReview: () => setState("review"),
      }).then((outcome) => {
        if (outcome === "requested") setState("idle");
      }).catch(() => setState("review"));
    }, 0);
    return () => window.clearTimeout(start);
  }, [orderId, router]);

  if (state === "idle") return null;
  if (state === "review") {
    return (
      <div className="mt-5 border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950" role="alert">
        The test booking was not safely finalized automatically. Review the durable status below before taking any action.
      </div>
    );
  }
  return (
    <div className="mt-5 border border-sky-300 bg-sky-50 p-4 text-sm leading-6 text-sky-950" role="status" aria-live="polite">
      Checking the durable test-payment and booking record. Stripe&apos;s return URL does not establish completion.
    </div>
  );
}
