import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  submitTemporaryDuffelWebhookOperation,
  type TemporaryDuffelWebhookClientDependencies,
} from "../app/admin/flights/consumer-preview/duffel-webhook-bootstrap/duffel-webhook-bootstrap-client";

const pageSource = readFileSync(
  new URL("../app/admin/flights/consumer-preview/duffel-webhook-bootstrap/page.tsx", import.meta.url),
  "utf8",
);
const clientSource = readFileSync(
  new URL("../app/admin/flights/consumer-preview/duffel-webhook-bootstrap/duffel-webhook-bootstrap-client.tsx", import.meta.url),
  "utf8",
);
const endpoint =
  "/api/admin/flights/consumer-preview/duffel-webhook-bootstrap";
const idempotencyKey = "22222222-2222-4222-8222-222222222222";

function dependencies(fetcher: ReturnType<typeof vi.fn>): TemporaryDuffelWebhookClientDependencies {
  return {
    createIdempotencyKey: () => idempotencyKey,
    fetcher: fetcher as unknown as typeof fetch,
  };
}

describe("temporary Duffel webhook bootstrap admin page", () => {
  it("is an uncached admin-only server page with no indexing", () => {
    expect(pageSource).toContain('process.env.VERCEL_ENV !== "preview"');
    expect(pageSource).toContain("notFound()");
    expect(pageSource).toContain('requireRole(["admin"])');
    expect(pageSource).toContain('export const dynamic = "force-dynamic"');
    expect(pageSource).toContain("export const revalidate = 0");
    expect(pageSource).toContain('export const fetchCache = "force-no-store"');
    expect(pageSource).toContain("robots: { index: false, follow: false }");
    expect(pageSource).toContain("/login?next=");
    expect(pageSource).toContain("DuffelWebhookBootstrapClient");
    expect(pageSource).toContain('encType="application/x-www-form-urlencoded"');
    expect(pageSource).toContain("NATIVE_OPERATOR_FORM_V1");
    expect(pageSource).toContain("Native: Bootstrap one Duffel TEST webhook");
    expect(pageSource).toContain("Native: Ping exact Duffel TEST webhook");
    expect(pageSource).toContain("Native: Activate Consumer Flight Preview TEST only");
    expect(pageSource).toContain("Native: Close one terminal TEST reprice without redispatch");
    expect(pageSource).toContain("Native: Relock and stop all test operations");
  });

  it("submits the exact bootstrap confirmation with a fresh UUID header and surfaces only the one-time secret", async () => {
    const signingSecret = "Duffel+one/time/signing/secret==";
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      data: {
        decision: "created",
        mode: "duffel_test_mode",
        signingSecret,
        webhookIdSha256: "a".repeat(64),
      },
    }, { status: 201 }));

    const result = await submitTemporaryDuffelWebhookOperation(
      "bootstrap",
      dependencies(fetcher),
    );
    expect(result).toMatchObject({
      ok: true,
      operation: "bootstrap",
      signingSecret,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(endpoint);
    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect(init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
    expect(new Headers(init.headers).get("idempotency-key")).toBe(idempotencyKey);
    expect(JSON.parse(init.body as string)).toEqual({
      confirmation: "BOOTSTRAP_ONE_DUFFEL_TEST_WEBHOOK_FOR_CONSUMER_PREVIEW",
    });
    expect(JSON.stringify(result)).not.toContain("a".repeat(64));
  });

  it("submits the distinct ping confirmation and discards all response identifiers", async () => {
    const webhookDigest = "b".repeat(64);
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      data: {
        decision: "ping_requested",
        mode: "duffel_test_mode",
        webhookIdSha256: webhookDigest,
      },
    }));

    const result = await submitTemporaryDuffelWebhookOperation(
      "ping",
      dependencies(fetcher),
    );
    expect(result).toEqual({
      ok: true,
      operation: "ping",
      status: "Duffel accepted the TEST webhook ping request.",
    });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      confirmation: "PING_EXACT_DUFFEL_TEST_WEBHOOK_FOR_CONSUMER_PREVIEW",
    });
    expect(JSON.stringify(result)).not.toContain(webhookDigest);
  });

  it("does not surface server error bodies or malformed bootstrap secrets", async () => {
    const leaked = "never-render-this-provider-secret";
    const conflictFetcher = vi.fn().mockResolvedValue(Response.json({
      error: leaked,
      signingSecret: leaked,
    }, { status: 409 }));
    const conflict = await submitTemporaryDuffelWebhookOperation(
      "bootstrap",
      dependencies(conflictFetcher),
    );
    expect(conflict).toEqual({
      ok: false,
      status: "The Duffel TEST webhook state does not match this operation.",
    });
    expect(JSON.stringify(conflict)).not.toContain(leaked);

    const malformedFetcher = vi.fn().mockResolvedValue(Response.json({
      data: { decision: "created", signingSecret: "short" },
    }, { status: 201 }));
    const malformed = await submitTemporaryDuffelWebhookOperation(
      "bootstrap",
      dependencies(malformedFetcher),
    );
    expect(malformed.ok).toBe(false);
  });

  it("renders explicit actions and a removable code element without persistence or automatic copying", () => {
    expect(clientSource).toContain("Bootstrap one Duffel TEST webhook");
    expect(clientSource).toContain("Ping exact Duffel TEST webhook");
    expect(clientSource).toContain('data-testid="duffel-webhook-signing-secret"');
    expect(clientSource).toContain("Clear secret");
    expect(clientSource).toContain("setSigningSecret(null)");
    expect(clientSource).toContain("crypto.randomUUID()");
    expect(clientSource).not.toMatch(/localStorage|sessionStorage|navigator\.clipboard|clipboard\.write|console\./);
  });
});
