import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("@/lib/flights/duffel/preview-order-reconciliation.server", () => ({
  executeDuffelPreviewOrderReconciliation: mocks.execute,
}));

import {
  GET,
  HEAD,
} from "../app/api/flights/preview-duffel-order-reconciliation/route";

const nonce = "preview-order-reconciliation-nonce-00000001";
const endpoint = "https://preview.example.test/api/flights/preview-duffel-order-reconciliation";

function request(value = nonce, url = endpoint) {
  return new Request(url, {
    method: "GET",
    headers: { "x-iratepilot-flight-test-nonce": value },
  });
}

describe("Duffel Preview order-reconciliation GET route", () => {
  beforeEach(() => {
    process.env.VERCEL_ENV = "preview";
    process.env.FLIGHT_DUFFEL_TEST_BOOKING_ENABLED = "true";
    process.env.FLIGHT_DUFFEL_TEST_CREDENTIAL_PROBE_ENABLED = "false";
    process.env.FLIGHT_DUFFEL_TEST_EXECUTION_NONCE = nonce;
    mocks.execute.mockReset().mockResolvedValue({
      mode: "duffel_test_mode",
      matchCount: 1,
    });
  });

  afterEach(() => {
    delete process.env.VERCEL_ENV;
    delete process.env.FLIGHT_DUFFEL_TEST_BOOKING_ENABLED;
    delete process.env.FLIGHT_DUFFEL_TEST_CREDENTIAL_PROBE_ENABLED;
    delete process.env.FLIGHT_DUFFEL_TEST_EXECUTION_NONCE;
  });

  it("allows only the exact nonce and returns a dynamic no-store result", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      mode: "duffel_test_mode",
      matchCount: 1,
    });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("conceals the route unless Preview, both flags, and the constant-time nonce are exact", async () => {
    const cases: Array<() => void> = [
      () => { process.env.VERCEL_ENV = "production"; },
      () => { process.env.FLIGHT_DUFFEL_TEST_BOOKING_ENABLED = "false"; },
      () => { process.env.FLIGHT_DUFFEL_TEST_CREDENTIAL_PROBE_ENABLED = "true"; },
    ];
    for (const mutate of cases) {
      mutate();
      const response = await GET(request());
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      process.env.VERCEL_ENV = "preview";
      process.env.FLIGHT_DUFFEL_TEST_BOOKING_ENABLED = "true";
      process.env.FLIGHT_DUFFEL_TEST_CREDENTIAL_PROBE_ENABLED = "false";
    }
    for (const supplied of ["wrong", `${nonce}x`]) {
      const response = await GET(request(supplied));
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rejects inbound query parameters and HEAD without executing reconciliation", async () => {
    const queryResponse = await GET(request(nonce, `${endpoint}?order=anything`));
    expect(queryResponse.status).toBe(400);
    expect(queryResponse.headers.get("cache-control")).toBe("no-store");
    const headResponse = HEAD();
    expect(headResponse.status).toBe(405);
    expect(headResponse.headers.get("allow")).toBe("GET");
    expect(headResponse.headers.get("cache-control")).toBe("no-store");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("returns only a stable fingerprint when reconciliation fails", async () => {
    mocks.execute.mockRejectedValueOnce(new Error(
      "provider raw body and token must never leave the server",
    ));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const result = await response.json() as Record<string, unknown>;
    expect(result).toEqual({
      error: "Duffel Preview order reconciliation failed safely.",
      failureFingerprint: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect(JSON.stringify(result)).not.toContain("raw body");
    expect(JSON.stringify(result)).not.toContain("token");
  });
});
