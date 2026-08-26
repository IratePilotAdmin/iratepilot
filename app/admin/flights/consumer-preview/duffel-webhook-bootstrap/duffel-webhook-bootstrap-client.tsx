"use client";

import { useState } from "react";

const endpoint =
  "/api/admin/flights/consumer-preview/duffel-webhook-bootstrap" as const;
const bootstrapConfirmation =
  "BOOTSTRAP_ONE_DUFFEL_TEST_WEBHOOK_FOR_CONSUMER_PREVIEW" as const;
const pingConfirmation =
  "PING_EXACT_DUFFEL_TEST_WEBHOOK_FOR_CONSUMER_PREVIEW" as const;

type Operation = "bootstrap" | "ping";

type SubmissionResult =
  | Readonly<{
    ok: true;
    operation: "bootstrap";
    signingSecret: string;
    status: string;
  }>
  | Readonly<{
    ok: true;
    operation: "ping";
    status: string;
  }>
  | Readonly<{
    ok: false;
    status: string;
  }>;

export type TemporaryDuffelWebhookClientDependencies = Readonly<{
  createIdempotencyKey: () => string;
  fetcher: typeof fetch;
}>;

function isSafeSigningSecret(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 16
    && value.length <= 2_048
    && /^[^\s\u0000-\u001f\u007f]+$/.test(value);
}

function confirmationFor(operation: Operation) {
  return operation === "bootstrap" ? bootstrapConfirmation : pingConfirmation;
}

async function discardResponseBody(response: Response) {
  try {
    await response.body?.cancel();
  } catch {
    // Deliberately ignore unread, sanitized provider-response disposal failures.
  }
}

export async function submitTemporaryDuffelWebhookOperation(
  operation: Operation,
  dependencies: TemporaryDuffelWebhookClientDependencies = {
    createIdempotencyKey: () => crypto.randomUUID(),
    fetcher: fetch,
  },
): Promise<SubmissionResult> {
  let response: Response;
  try {
    response = await dependencies.fetcher(endpoint, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": dependencies.createIdempotencyKey(),
      },
      body: JSON.stringify({ confirmation: confirmationFor(operation) }),
    });
  } catch {
    return { ok: false, status: "The temporary Preview operation is unavailable." };
  }

  if (!response.ok) {
    await discardResponseBody(response);
    return {
      ok: false,
      status: response.status === 409
        ? "The Duffel TEST webhook state does not match this operation."
        : "The temporary Preview operation is unavailable.",
    };
  }
  if (operation === "ping") {
    if (response.status !== 200) {
      await discardResponseBody(response);
      return { ok: false, status: "The temporary Preview operation is unavailable." };
    }
    await discardResponseBody(response);
    return {
      ok: true,
      operation: "ping",
      status: "Duffel accepted the TEST webhook ping request.",
    };
  }
  if (
    response.status !== 201
    || !response.headers.get("content-type")?.toLowerCase().startsWith("application/json")
  ) {
    await discardResponseBody(response);
    return { ok: false, status: "The temporary Preview operation is unavailable." };
  }

  try {
    const body = await response.json() as {
      data?: { decision?: unknown; signingSecret?: unknown };
    };
    if (
      body.data?.decision !== "created"
      || !isSafeSigningSecret(body.data.signingSecret)
    ) return { ok: false, status: "The temporary Preview operation is unavailable." };
    return {
      ok: true,
      operation: "bootstrap",
      signingSecret: body.data.signingSecret,
      status: "The TEST webhook was created. Store the one-time signing secret immediately, then clear it here.",
    };
  } catch {
    return { ok: false, status: "The temporary Preview operation is unavailable." };
  }
}

export function DuffelWebhookBootstrapClient() {
  const [busy, setBusy] = useState<Operation | null>(null);
  const [signingSecret, setSigningSecret] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function run(operation: Operation) {
    setBusy(operation);
    setStatus(null);
    setFailed(false);
    if (operation === "bootstrap") setSigningSecret(null);
    const result = await submitTemporaryDuffelWebhookOperation(operation);
    if (result.ok && result.operation === "bootstrap") {
      setSigningSecret(result.signingSecret);
    }
    setStatus(result.status);
    setFailed(!result.ok);
    setBusy(null);
  }

  function clearSecret() {
    setSigningSecret(null);
    setStatus("The one-time signing secret was cleared from this page.");
    setFailed(false);
  }

  return (
    <div className="space-y-6">
      <section className="border border-amber-400 bg-amber-50 p-6" aria-labelledby="temporary-duffel-title">
        <p className="text-xs font-semibold uppercase tracking-[.14em] text-amber-900">
          Temporary Preview-only operator
        </p>
        <h1 id="temporary-duffel-title" className="mt-2 text-3xl text-neutral-950">
          Bootstrap and verify one Duffel TEST webhook
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-950">
          Bootstrap is allowed only when the Duffel TEST webhook list is empty.
          After storing the returned signing secret as the dedicated Preview secret
          and redeploying, use Ping to prove signed delivery. This page cannot update
          or delete a webhook.
        </p>
      </section>

      <section className="border border-neutral-300 bg-white p-6" aria-label="Temporary Duffel TEST webhook actions">
        <div className="flex flex-wrap gap-3">
          <button
            className="btn-primary"
            type="button"
            disabled={busy !== null || signingSecret !== null}
            onClick={() => void run("bootstrap")}
          >
            {busy === "bootstrap" ? "Bootstrapping…" : "Bootstrap one Duffel TEST webhook"}
          </button>
          <button
            className="btn-secondary"
            type="button"
            disabled={busy !== null || signingSecret !== null}
            onClick={() => void run("ping")}
          >
            {busy === "ping" ? "Requesting ping…" : "Ping exact Duffel TEST webhook"}
          </button>
        </div>

        {status ? (
          <p
            className={`mt-5 border p-4 text-sm ${failed
              ? "border-red-300 bg-red-50 text-red-950"
              : "border-sky-300 bg-sky-50 text-sky-950"}`}
            role={failed ? "alert" : "status"}
          >
            {status}
          </p>
        ) : null}
      </section>

      {signingSecret ? (
        <section className="border-2 border-red-600 bg-red-50 p-6" aria-labelledby="one-time-secret-title">
          <h2 id="one-time-secret-title" className="text-xl text-red-950">
            One-time Duffel webhook signing secret
          </h2>
          <p className="mt-2 text-sm leading-6 text-red-900">
            Store this value immediately in the dedicated Preview environment variable.
            It will not be available from Duffel again.
          </p>
          <code
            className="mt-4 block break-all border border-red-300 bg-white p-4 font-mono text-sm text-neutral-950"
            data-testid="duffel-webhook-signing-secret"
          >
            {signingSecret}
          </code>
          <button className="btn-secondary mt-4" type="button" onClick={clearSecret}>
            Clear secret
          </button>
        </section>
      ) : null}
    </div>
  );
}
