import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  submitTemporaryPreviewActivationOperation,
  type TemporaryPreviewActivationClientDependencies,
} from "../app/admin/flights/consumer-preview/duffel-webhook-bootstrap/preview-activation-client";

const pageSource = readFileSync(
  new URL("../app/admin/flights/consumer-preview/duffel-webhook-bootstrap/page.tsx", import.meta.url),
  "utf8",
);
const clientSource = readFileSync(
  new URL("../app/admin/flights/consumer-preview/duffel-webhook-bootstrap/preview-activation-client.tsx", import.meta.url),
  "utf8",
);
const idempotencyKey = "22222222-2222-4222-8222-222222222222";

function dependencies(fetcher: ReturnType<typeof vi.fn>): TemporaryPreviewActivationClientDependencies {
  return {
    createIdempotencyKey: () => idempotencyKey,
    fetcher: fetcher as unknown as typeof fetch,
  };
}

describe("temporary Consumer Flight Preview activation page", () => {
  it.each([
    [
      "activate" as const,
      "/api/admin/flights/consumer-preview/activation",
      "ACTIVATE_CONSUMER_FLIGHT_PREVIEW_TEST_ONLY",
      "activated",
    ],
    [
      "relock" as const,
      "/api/admin/flights/consumer-preview/relock",
      "RELOCK_CONSUMER_FLIGHT_PREVIEW_AND_STOP_ALL_TEST_OPERATIONS",
      "relocked",
    ],
  ])("submits exact %s contract as one same-origin mutation", async (operation, endpoint, confirmation, decision) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ data: { decision } }));
    await expect(submitTemporaryPreviewActivationOperation(
      operation,
      dependencies(fetcher),
    )).resolves.toEqual({ ok: true, operation, decision });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(endpoint);
    expect(init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
    expect(new Headers(init.headers).get("idempotency-key")).toBe(idempotencyKey);
    expect(JSON.parse(String(init.body))).toEqual({ confirmation });
  });

  it("fails closed without surfacing response evidence or server error bodies", async () => {
    const leaked = "never-render-control-plane-evidence";
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: leaked }, { status: 409 }));
    const result = await submitTemporaryPreviewActivationOperation(
      "activate",
      dependencies(fetcher),
    );
    expect(result).toEqual({ ok: false, operation: "activate" });
    expect(JSON.stringify(result)).not.toContain(leaked);
  });

  it("is reachable only through the existing Preview-only admin page and persists no authority", () => {
    expect(pageSource).toContain('process.env.VERCEL_ENV !== "preview"');
    expect(pageSource).toContain('requireRole(["admin"])');
    expect(pageSource).toContain("TemporaryPreviewActivationClient");
    expect(clientSource).toContain("Activate Consumer Flight Preview TEST only");
    expect(clientSource).toContain("Relock and stop all test operations");
    expect(clientSource).toContain("crypto.randomUUID()");
    expect(clientSource).not.toMatch(/localStorage|sessionStorage|console\.|navigator\.clipboard/);
  });
});
