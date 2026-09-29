"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { FlightConsumerPreviewSearchStatus } from "@/components/flights/consumer-preview/search-recovery";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RecoveryResult =
  | Readonly<{
    decision: "observed";
    searchId: string;
    status: FlightConsumerPreviewSearchStatus;
    nextAction: "poll" | "results" | "new_search";
  }>
  | Readonly<{ decision: "unauthenticated" | "unavailable" }>;

function exactKeys(record: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(record).sort();
  return actual.length === expected.length
    && expected.every((key, index) => actual[index] === key);
}

export async function requestFlightConsumerPreviewSearchRecovery(input: Readonly<{
  searchId: string;
  signal?: AbortSignal;
  post?: (url: string, init: RequestInit) => Promise<Response>;
}>): Promise<RecoveryResult> {
  if (!uuidPattern.test(input.searchId)) return Object.freeze({ decision: "unavailable" });
  let response: Response;
  try {
    response = await (input.post ?? fetch)(
      `/api/flights/preview/search/${encodeURIComponent(input.searchId)}/recover`,
      {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: input.signal,
      },
    );
  } catch {
    return Object.freeze({ decision: "unavailable" });
  }
  if (response.status === 401) return Object.freeze({ decision: "unauthenticated" });
  const body = await response.json().catch(() => null) as unknown;
  if (!response.ok || body === null || typeof body !== "object" || Array.isArray(body)) {
    return Object.freeze({ decision: "unavailable" });
  }
  const data = (body as { data?: unknown }).data;
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return Object.freeze({ decision: "unavailable" });
  }
  const record = data as Record<string, unknown>;
  if (!exactKeys(record, ["nextAction", "searchId", "status"])) {
    return Object.freeze({ decision: "unavailable" });
  }
  const status = record.status;
  const nextAction = record.nextAction;
  if (
    record.searchId !== input.searchId
    || typeof status !== "string"
    || !["created", "searching", "complete", "failed", "expired"].includes(status)
    || typeof nextAction !== "string"
    || !["poll", "results", "new_search"].includes(nextAction)
    || (nextAction === "results" && status !== "complete")
    || (nextAction === "poll" && status !== "created" && status !== "searching")
    || (nextAction === "new_search" && status !== "failed" && status !== "expired")
  ) return Object.freeze({ decision: "unavailable" });
  return Object.freeze({
    decision: "observed" as const,
    searchId: input.searchId,
    status: status as FlightConsumerPreviewSearchStatus,
    nextAction: nextAction as "poll" | "results" | "new_search",
  });
}

export function ConsumerFlightPreviewSearchProgress({
  enabled,
  searchId,
  initialStatus,
}: {
  enabled: boolean;
  searchId: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const attempts = useRef(0);
  const [generation, setGeneration] = useState(0);
  const [message, setMessage] = useState("Checking the durable test-search journal…");
  const [exhausted, setExhausted] = useState(false);
  const recoverable = initialStatus === "created" || initialStatus === "searching";

  useEffect(() => {
    if (!enabled || !recoverable) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();
    attempts.current = 0;

    async function check() {
      attempts.current += 1;
      const result = await requestFlightConsumerPreviewSearchRecovery({
        searchId,
        signal: controller.signal,
      });
      if (cancelled) return;
      if (result.decision === "unauthenticated") {
        setMessage("Your session ended. Sign in again before checking this test search.");
        return;
      }
      if (result.decision === "observed" && result.nextAction === "results") {
        setMessage("Durable test offers are ready. Refreshing…");
        router.refresh();
        return;
      }
      if (result.decision === "observed" && result.nextAction === "new_search") {
        setMessage("This durable test search ended safely. Start a new test search to continue.");
        router.refresh();
        return;
      }
      setMessage(result.decision === "unavailable"
        ? "The status check was temporarily unavailable. The same durable search will be checked again."
        : "The durable test search is still processing…");
      if (attempts.current < 15) {
        timer = setTimeout(check, 4_000);
      } else {
        setExhausted(true);
        setMessage("The durable outcome is still unknown. Check this same search again before starting another.");
      }
    }

    timer = setTimeout(check, 1_500);
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [enabled, generation, recoverable, router, searchId]);

  if (!recoverable) return null;
  return (
    <div className="mt-3" aria-live="polite">
      <p className="text-sm leading-6">{message || "Preparing a safe durability check…"}</p>
      {exhausted ? (
        <button
          type="button"
          className="mt-3 border border-black px-4 py-2 text-xs font-semibold uppercase tracking-[.1em]"
          onClick={() => {
            setExhausted(false);
            setMessage("Checking the durable test-search journal…");
            setGeneration((value) => value + 1);
          }}
        >
          Check this search again
        </button>
      ) : null}
    </div>
  );
}
