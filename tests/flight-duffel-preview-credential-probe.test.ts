import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createOfferRequest, copyRawBody, sanitizeOfferResponse } = vi.hoisted(() => ({
  createOfferRequest: vi.fn(),
  copyRawBody: vi.fn(),
  sanitizeOfferResponse: vi.fn(),
}));
vi.mock("../lib/flights/duffel/preview-ports.server", () => ({
  createDuffelPreviewTransportDependencies: vi.fn(() => ({ enabled: true })),
}));
vi.mock("../lib/flights/duffel/search-only-integration.server", () => ({
  createInjectedDuffelSandboxSearchOnlyIntegration: vi.fn(() => ({ createOfferRequest })),
}));
vi.mock("../lib/flights/duffel/http-transport.server", () => ({
  copyDuffelHttpTransportRawBody: copyRawBody,
}));
vi.mock("../lib/flights/duffel-sandbox-contract", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/flights/duffel-sandbox-contract")>();
  return { ...actual, sanitizeDuffelSandboxOfferResponse: sanitizeOfferResponse };
});

import {
  DUFFEL_PREVIEW_CREDENTIAL_PROBE_CONFIRMATION,
  executeDuffelPreviewCredentialProbe,
} from "../lib/flights/duffel/preview-credential-probe.server";
import { buildDuffelSandboxOfferRequestPlan } from "../lib/flights/duffel-sandbox-contract";
import { canonicalFlightJson } from "../lib/flights/runtime-safety";

describe("Duffel Preview credential probe", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T12:00:00.000Z"));
    process.env.VERCEL_ENV = "preview";
    process.env.FLIGHT_DUFFEL_TEST_CREDENTIAL_PROBE_ENABLED = "true";
    process.env.FLIGHT_DUFFEL_TEST_BOOKING_ENABLED = "false";
    createOfferRequest.mockReset().mockResolvedValue({
      operation: "create_offer_request",
      status: 200,
      requestDigest: "a".repeat(64),
      responseDigest: "b".repeat(64),
      inboundBodyBytes: 321,
      automaticRetryAttempted: false,
      idempotencyKeyIncluded: false,
    });
    copyRawBody.mockReset().mockReturnValue(new Uint8Array([123, 125]));
    sanitizeOfferResponse.mockReset().mockReturnValue({
      result: {
        offers: [
          { expiresAt: "2026-11-01T13:00:00.000Z" },
          { expiresAt: "2026-11-01T13:00:00.000Z" },
        ],
      },
      evidence: [
        { passengerIdentityDocumentsRequired: false },
        { passengerIdentityDocumentsRequired: true },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.VERCEL_ENV;
    delete process.env.FLIGHT_DUFFEL_TEST_CREDENTIAL_PROBE_ENABLED;
    delete process.env.FLIGHT_DUFFEL_TEST_BOOKING_ENABLED;
  });

  it("dispatches exactly one +68-day offer request and returns only sanitized readiness counts", async () => {
    await expect(executeDuffelPreviewCredentialProbe(DUFFEL_PREVIEW_CREDENTIAL_PROBE_CONFIRMATION))
      .resolves.toEqual({
        mode: "duffel_test_mode",
        operation: "create_offer_request",
        credentialAuthenticated: true,
        providerHttpStatus: 200,
        requestDigest: "a".repeat(64),
        responseDigest: "b".repeat(64),
        inboundBodyBytes: 321,
        certifiedDuffelAirwaysOfferCount: 2,
        bookableWithoutIdentityDocumentsCount: 1,
        search: {
          origin: "ORD",
          destination: "MIA",
          departureDate: "2026-11-01",
          returnDate: null,
          cabin: "economy",
          passengers: { adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 0 },
        },
        externalTestSideEffect: "offer_request_only",
        automaticRetryAttempted: false,
      });
    expect(createOfferRequest).toHaveBeenCalledTimes(1);
  });

  it("fails closed unless Preview and the dedicated probe flag are both exact", async () => {
    process.env.FLIGHT_DUFFEL_TEST_CREDENTIAL_PROBE_ENABLED = "false";
    await expect(executeDuffelPreviewCredentialProbe(DUFFEL_PREVIEW_CREDENTIAL_PROBE_CONFIRMATION))
      .rejects.toThrow(/disabled/i);
    process.env.FLIGHT_DUFFEL_TEST_CREDENTIAL_PROBE_ENABLED = "true";
    process.env.FLIGHT_DUFFEL_TEST_BOOKING_ENABLED = "true";
    await expect(executeDuffelPreviewCredentialProbe(DUFFEL_PREVIEW_CREDENTIAL_PROBE_CONFIRMATION))
      .rejects.toThrow(/disabled/i);
    expect(createOfferRequest).not.toHaveBeenCalled();
  });

  it("pins the one-shot +68-day provider request identity", () => {
    const plan = buildDuffelSandboxOfferRequestPlan({
      origin: "ORD",
      destination: "MIA",
      departureDate: "2026-11-01",
      returnDate: null,
      cabin: "economy",
      passengers: { adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 0 },
    });
    const body = canonicalFlightJson(plan.body as never);
    expect(plan.requestDigest).toBe("81dd0493df6b49200ff29561c7b687d123f2dde21f6044878b912f79299f50f6");
    expect(Buffer.byteLength(body, "utf8")).toBe(193);
    expect(createHash("sha256").update(body, "utf8").digest("hex"))
      .toBe("40f6ca5bf441dc7a7b8cd9c3f897f4e0e6610795b47552e0f4e6d9a971528029");
  });

  it("contains no order, payment, ticket, or raw-body operation", () => {
    const source = readFileSync(
      new URL("../lib/flights/duffel/preview-credential-probe.server.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("createOfferRequest(search)");
    expect(source).toContain("sanitizeDuffelSandboxOfferResponse(rawBody");
    expect(source).toContain("copyDuffelHttpTransportRawBody(result)");
    expect(source).not.toMatch(/createOrder|retrieveOffer|listOrdersByOffer|authorizePayment|issueTicket|rawBodyBase64/);
    const route = readFileSync(
      new URL("../app/api/flights/preview-duffel-credential-probe/route.ts", import.meta.url),
      "utf8",
    );
    expect(route).toMatch(/maxDuration\s*=\s*120/);
    expect(route).toContain(
      'process.env.FLIGHT_DUFFEL_TEST_CREDENTIAL_PROBE_ENABLED !== "true"',
    );
  });
});
