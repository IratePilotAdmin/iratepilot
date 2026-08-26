"use client";

import { useState } from "react";

const operations = Object.freeze({
  activate: Object.freeze({
    endpoint: "/api/admin/flights/consumer-preview/activation",
    confirmation: "ACTIVATE_CONSUMER_FLIGHT_PREVIEW_TEST_ONLY",
    decision: "activated",
  }),
  relock: Object.freeze({
    endpoint: "/api/admin/flights/consumer-preview/relock",
    confirmation: "RELOCK_CONSUMER_FLIGHT_PREVIEW_AND_STOP_ALL_TEST_OPERATIONS",
    decision: "relocked",
  }),
});

type Operation = keyof typeof operations;

export type TemporaryPreviewActivationClientDependencies = Readonly<{
  createIdempotencyKey: () => string;
  fetcher: typeof fetch;
}>;

export async function submitTemporaryPreviewActivationOperation(
  operation: Operation,
  dependencies: TemporaryPreviewActivationClientDependencies = {
    createIdempotencyKey: () => crypto.randomUUID(),
    fetcher: fetch,
  },
) {
  const contract = operations[operation];
  try {
    const response = await dependencies.fetcher(contract.endpoint, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": dependencies.createIdempotencyKey(),
      },
      body: JSON.stringify({ confirmation: contract.confirmation }),
    });
    if (
      !response.ok
      || response.status !== 200
      || !response.headers.get("content-type")?.toLowerCase().startsWith("application/json")
    ) {
      await response.body?.cancel().catch(() => undefined);
      return Object.freeze({ ok: false as const, operation });
    }
    const body = await response.json() as { data?: { decision?: unknown } };
    if (body.data?.decision !== contract.decision) {
      return Object.freeze({ ok: false as const, operation });
    }
    return Object.freeze({ ok: true as const, operation, decision: contract.decision });
  } catch {
    return Object.freeze({ ok: false as const, operation });
  }
}

export function TemporaryPreviewActivationClient() {
  const [busy, setBusy] = useState<Operation | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function run(operation: Operation) {
    if (busy) return;
    setBusy(operation);
    setStatus(null);
    setFailed(false);
    const result = await submitTemporaryPreviewActivationOperation(operation);
    setFailed(!result.ok);
    setStatus(result.ok
      ? operation === "activate"
        ? "Consumer Flight Preview activated in TEST mode. Verify runtime preflight before continuing."
        : "Consumer Flight Preview relocked. Verify every runtime capability is closed."
      : "The Preview control-plane operation did not prove the required database state.");
    setBusy(null);
  }

  return (
    <section className="border border-red-400 bg-red-50 p-6" aria-labelledby="temporary-preview-control-title">
      <p className="text-xs font-semibold uppercase tracking-[.14em] text-red-900">
        Temporary Preview-only control plane
      </p>
      <h2 id="temporary-preview-control-title" className="mt-2 text-2xl text-neutral-950">
        Activate once, accept one fictional booking, then relock
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-red-950">
        Activation is a database-guarded TEST-only transition. Use it only after
        both provider webhooks are verified. Relock immediately after the acceptance
        evidence is terminal. Neither action enables Production traffic or live money.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          className="btn-primary"
          type="button"
          disabled={busy !== null}
          onClick={() => void run("activate")}
        >
          {busy === "activate" ? "Activating…" : "Activate Consumer Flight Preview TEST only"}
        </button>
        <button
          className="btn-secondary"
          type="button"
          disabled={busy !== null}
          onClick={() => void run("relock")}
        >
          {busy === "relock" ? "Relocking…" : "Relock and stop all test operations"}
        </button>
      </div>
      {status ? (
        <p
          className={`mt-5 border p-4 text-sm ${failed
            ? "border-red-300 bg-white text-red-950"
            : "border-emerald-300 bg-emerald-50 text-emerald-950"}`}
          role={failed ? "alert" : "status"}
          data-testid="preview-control-status"
        >
          {status}
        </p>
      ) : null}
    </section>
  );
}
