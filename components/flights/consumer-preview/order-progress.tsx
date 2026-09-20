"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type StatusResponse = {
  data?: {
    order?: {
      status?: unknown;
      paymentStatus?: unknown;
      ticketCount?: unknown;
      updatedAt?: unknown;
    };
  };
};

export function ConsumerFlightOrderProgress({
  enabled,
  orderId,
  initialVersion,
  shouldPoll,
}: {
  enabled: boolean;
  orderId: string;
  initialVersion: string;
  shouldPoll: boolean;
}) {
  const router = useRouter();
  const attempts = useRef(0);
  const [message, setMessage] = useState(shouldPoll ? "Checking the durable test-order record…" : "");

  useEffect(() => {
    if (!enabled || !shouldPoll) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function check() {
      attempts.current += 1;
      try {
        const response = await fetch(`/api/flights/preview/orders/${encodeURIComponent(orderId)}/status`, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (cancelled) return;
        if (response.status === 401) {
          setMessage("Your session ended. Sign in again to continue checking this test order.");
          return;
        }
        if (!response.ok) throw new Error("Status is temporarily unavailable.");

        const body = (await response.json()) as StatusResponse;
        const updatedAt = body.data?.order?.updatedAt;
        if (typeof updatedAt === "string" && updatedAt !== initialVersion) {
          setMessage("New durable evidence was recorded. Refreshing…");
          router.refresh();
          return;
        }
        setMessage(attempts.current >= 15 ? "Finalization is taking longer than expected. The durable status below remains authoritative." : "Finalization is still processing in test mode…");
      } catch {
        if (!cancelled) setMessage("Automatic status checking paused. Refresh this page to read the latest durable record.");
        return;
      }

      if (!cancelled && attempts.current < 15) timer = setTimeout(check, 4_000);
    }

    timer = setTimeout(check, 1_500);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, initialVersion, orderId, router, shouldPoll]);

  if (!shouldPoll) return null;
  return <p className="mt-5 border border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-700" role="status" aria-live="polite">{message}</p>;
}
