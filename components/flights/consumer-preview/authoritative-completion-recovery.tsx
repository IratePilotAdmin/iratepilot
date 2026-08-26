"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RecoveryState = "idle" | "recovering" | "review";
type RecoveryOutcome = "ignored" | "requested" | "review";

export async function requestFlightConsumerPreviewAuthoritativeCompletion(input: Readonly<{
  orderId: string;
  post: (url: string, init: RequestInit) => Promise<{ ok: boolean }>;
  replace: (url: string) => void;
  refresh: () => void;
}>): Promise<RecoveryOutcome> {
  if (!uuidPattern.test(input.orderId)) return "ignored";
  const cleanUrl = `/flights/preview/confirmation/${encodeURIComponent(input.orderId)}`;
  let outcome: RecoveryOutcome = "review";
  try {
    const response = await input.post(
      `/api/flights/preview/orders/${encodeURIComponent(input.orderId)}/resume`,
      {
        method: "POST",
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
  try {
    input.replace(cleanUrl);
  } catch {
    outcome = "review";
  } finally {
    input.refresh();
  }
  return outcome;
}

export function ConsumerFlightPreviewAuthoritativeCompletionRecovery({
  orderId,
  shouldResume,
}: Readonly<{
  orderId: string;
  shouldResume: boolean;
}>) {
  const router = useRouter();
  const started = useRef(false);
  const [state, setState] = useState<RecoveryState>("idle");

  useEffect(() => {
    if (started.current) return;
    const returnedFromStripe = new URLSearchParams(window.location.search).has("payment_intent");
    if (!shouldResume && !returnedFromStripe) return;
    started.current = true;
    const timer = window.setTimeout(() => {
      setState("recovering");
      void requestFlightConsumerPreviewAuthoritativeCompletion({
        orderId,
        post: (url, init) => fetch(url, init),
        replace: (url) => window.history.replaceState(window.history.state, "", url),
        refresh: () => router.refresh(),
      }).then((outcome) => {
        setState(outcome === "review" ? "review" : "idle");
      }).catch(() => setState("review"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [orderId, router, shouldResume]);

  if (state === "idle") return null;
  if (state === "review") {
    return (
      <div className="mt-5 border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950" role="alert">
        Automatic recovery could not prove a safe next step. The durable receipt below remains authoritative; do not infer success or retry a provider order from the browser.
      </div>
    );
  }
  return (
    <div className="mt-5 border border-sky-300 bg-sky-50 p-4 text-sm leading-6 text-sky-950" role="status" aria-live="polite">
      Resuming from the server-owned Stripe test-payment and provider journals. URL parameters are not trusted as completion evidence.
    </div>
  );
}
