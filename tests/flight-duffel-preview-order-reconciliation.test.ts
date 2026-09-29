import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  limit: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("../lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import {
  DUFFEL_PREVIEW_ORDER_RECONCILIATION_RUNTIME_CONTROL,
  DUFFEL_PREVIEW_ORDER_RECONCILIATION_URL,
  executeDuffelPreviewOrderReconciliation,
} from "../lib/flights/duffel/preview-order-reconciliation.server";

const token = `duffel_test_${"A".repeat(32)}`;
const bookingReference = "V8TEST1";

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "ord_0000000000000001",
    live_mode: false,
    created_at: "2026-08-25T18:23:00.456789Z",
    passengers: [{
      id: "pas_0000000000000001",
      given_name: "Synthetic",
      family_name: "Traveler",
      email: "flight.preview.synthetic@example.test",
    }],
    slices: [{
      segments: [{
        origin: { iata_code: "ORD" },
        destination: { iata_code: "MIA" },
        departing_at: "2026-11-05T09:00:00",
      }],
    }],
    booking_reference: bookingReference,
    total_amount: "249.50",
    total_currency: "USD",
    payment_status: {
      paid_at: "2026-08-25T18:23:00Z",
      awaiting_payment: false,
    },
    documents: [{
      type: "electronic_ticket",
      unique_identifier: "1252106312810",
      passenger_ids: ["pas_0000000000000001"],
    }],
    cancelled_at: null,
    cancellation: null,
    ...overrides,
  };
}

function body(data: unknown[] = [order()], meta: Record<string, unknown> = {}) {
  return JSON.stringify({
    meta: { before: null, after: null, limit: 10, ...meta },
    data,
  });
}

function response(
  text = body(),
  options: Readonly<{
    status?: number;
    url?: string;
    contentType?: string;
    contentLength?: string;
    redirected?: boolean;
  }> = {},
) {
  const result = new Response(text, {
    status: options.status ?? 200,
    headers: {
      "Content-Type": options.contentType ?? "application/json; charset=utf-8",
      "Content-Length": options.contentLength
        ?? String(Buffer.byteLength(text, "utf8")),
    },
  });
  Object.defineProperty(result, "url", {
    value: options.url ?? DUFFEL_PREVIEW_ORDER_RECONCILIATION_URL,
  });
  Object.defineProperty(result, "redirected", {
    value: options.redirected ?? false,
  });
  return result;
}

function exactControls() {
  return structuredClone(DUFFEL_PREVIEW_ORDER_RECONCILIATION_RUNTIME_CONTROL);
}

describe("Duffel Preview V8 order reconciliation", () => {
  beforeEach(() => {
    process.env.VERCEL_ENV = "preview";
    process.env.FLIGHT_DUFFEL_TEST_BOOKING_ENABLED = "true";
    process.env.FLIGHT_DUFFEL_TEST_CREDENTIAL_PROBE_ENABLED = "false";
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      "https://eiqmdldjnedqgbtoozqa.supabase.co";
    process.env.DUFFEL_TEST_ACCESS_TOKEN = token;

    mocks.createAdminClient.mockReset().mockReturnValue({ from: mocks.from });
    mocks.from.mockReset().mockReturnValue({ select: mocks.select });
    mocks.select.mockReset().mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReset().mockReturnValue({ limit: mocks.limit });
    mocks.limit.mockReset().mockResolvedValue({
      data: [exactControls()],
      error: null,
    });
    mocks.fetch.mockReset().mockResolvedValue(response());
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.VERCEL_ENV;
    delete process.env.FLIGHT_DUFFEL_TEST_BOOKING_ENABLED;
    delete process.env.FLIGHT_DUFFEL_TEST_CREDENTIAL_PROBE_ENABLED;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.DUFFEL_TEST_ACCESS_TOKEN;
  });

  it("pins the exact post-V8 relocked control state", () => {
    expect(DUFFEL_PREVIEW_ORDER_RECONCILIATION_RUNTIME_CONTROL).toMatchObject({
      control_key: "global",
      execution_kill_switch_engaged: true,
      synthetic_execution_enabled: false,
      provider_sandbox_traffic_enabled: false,
      provider_live_traffic_enabled: false,
      shopping_enabled: false,
      order_enabled: false,
      payment_enabled: false,
      ticketing_enabled: false,
      servicing_enabled: false,
      provider_events_enabled: false,
      production_release_enabled: false,
      bound_database_name: "postgres",
      bound_session_user: "authenticator",
      activation_evidence_sha256:
        "366590876dc9b25bcf4182386320777b900b2fdf18206e11296a18d97e215892",
    });
  });

  it("checks exact controls first, performs one fixed GET, and returns only sanitized evidence", async () => {
    expect(DUFFEL_PREVIEW_ORDER_RECONCILIATION_URL).toBe(
      "https://api.duffel.com/air/orders?limit=10&sort=-created_at&passenger_name[]=Synthetic&passenger_name[]=Traveler",
    );
    const rawBody = body();
    mocks.fetch.mockResolvedValueOnce(response(rawBody));
    const result = await executeDuffelPreviewOrderReconciliation();

    expect(mocks.from).toHaveBeenCalledWith("flight_runtime_controls");
    expect(mocks.eq).toHaveBeenCalledWith("control_key", "global");
    expect(mocks.limit).toHaveBeenCalledWith(2);
    expect(mocks.limit.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.fetch.mock.invocationCallOrder[0]!,
    );
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledWith(
      DUFFEL_PREVIEW_ORDER_RECONCILIATION_URL,
      expect.objectContaining({
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "Duffel-Version": "v2",
        },
        redirect: "error",
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(result).toEqual({
      mode: "duffel_test_mode",
      operation: "list_orders_read_only",
      matchCount: 1,
      providerOrderId: "ord_0000000000000001",
      createdAt: "2026-08-25T18:23:00.456Z",
      bookingReferenceDigest: createHash("sha256")
        .update("duffel-booking-reference-v1\0")
        .update(bookingReference)
        .digest("hex"),
      total: { currency: "USD", amountMinor: 24_950 },
      paymentStatus: {
        awaitingPayment: false,
        paidAt: "2026-08-25T18:23:00.000Z",
      },
      ticketDocuments: { count: 1, types: ["electronic_ticket"] },
      cancellation: {
        cancelled: false,
        cancelledAt: null,
        cancellationRecordPresent: false,
      },
      route: {
        origin: "ORD",
        destination: "MIA",
        departureDate: "2026-11-05",
      },
      rawResponseSha256: createHash("sha256").update(rawBody).digest("hex"),
      rawResponseBytes: Buffer.byteLength(rawBody, "utf8"),
      externalProviderRead: true,
      externalMutationAttempted: false,
      automaticRetryAttempted: false,
    });
    const serialized = JSON.stringify(result);
    for (const secretOrPii of [
      token,
      bookingReference,
      "Synthetic",
      "Traveler",
      "flight.preview.synthetic@example.test",
      "1252106312810",
    ]) expect(serialized).not.toContain(secretOrPii);
  });

  it("matches only the exact test-mode creation window, traveler, route, and departure date", async () => {
    const decoys = [
      order({ id: "ord_0000000000000002", live_mode: true }),
      order({
        id: "ord_0000000000000003",
        created_at: "2026-08-25T18:22:59.999Z",
      }),
      order({
        id: "ord_0000000000000004",
        passengers: [{ given_name: "Another", family_name: "Traveler" }],
      }),
      order({
        id: "ord_0000000000000005",
        slices: [{ segments: [{
          origin: { iata_code: "ORD" },
          destination: { iata_code: "JFK" },
          departing_at: "2026-11-05T09:00:00",
        }] }],
      }),
      order({
        id: "ord_0000000000000006",
        slices: [{ segments: [{
          origin: { iata_code: "ORD" },
          destination: { iata_code: "MIA" },
          departing_at: "2026-11-06T09:00:00",
        }] }],
      }),
    ];
    mocks.fetch.mockResolvedValueOnce(response(body([...decoys, order()])));

    await expect(executeDuffelPreviewOrderReconciliation()).resolves.toMatchObject({
      matchCount: 1,
      providerOrderId: "ord_0000000000000001",
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("fails before token use or provider access unless environment and controls are exact", async () => {
    process.env.FLIGHT_DUFFEL_TEST_BOOKING_ENABLED = "false";
    await expect(executeDuffelPreviewOrderReconciliation()).rejects.toThrow(/disabled/i);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();

    process.env.FLIGHT_DUFFEL_TEST_BOOKING_ENABLED = "true";
    const drifted = { ...exactControls(), shopping_enabled: true };
    mocks.limit.mockResolvedValueOnce({ data: [drifted], error: null });
    await expect(executeDuffelPreviewOrderReconciliation()).rejects.toThrow(/exactly locked/i);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("accepts only bounded same-second paid-at truncation", async () => {
    mocks.fetch.mockResolvedValueOnce(response(body([order({
      created_at: "2026-08-25T18:23:00.999999Z",
      payment_status: {
        paid_at: "2026-08-25T18:23:00Z",
        awaiting_payment: false,
      },
    })])));
    await expect(executeDuffelPreviewOrderReconciliation()).resolves.toMatchObject({
      createdAt: "2026-08-25T18:23:00.999Z",
      paymentStatus: { paidAt: "2026-08-25T18:23:00.000Z" },
    });

    mocks.fetch.mockReset().mockResolvedValueOnce(response(body([order({
      created_at: "2026-08-25T18:23:01.000Z",
      payment_status: {
        paid_at: "2026-08-25T18:23:00Z",
        awaiting_payment: false,
      },
    })])));
    await expect(executeDuffelPreviewOrderReconciliation())
      .rejects.toThrow(/chronologically invalid/i);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("refuses ambiguous matches, pagination, status/content-type drift, redirects, and URL drift without retry", async () => {
    const cases = [
      response(body([
        order(),
        order({ id: "ord_0000000000000002" }),
      ])),
      response(body([order()], { after: "cursor" })),
      response(body(), { status: 201 }),
      response(body(), { contentType: "text/plain" }),
      response(body(), { redirected: true }),
      response(body(), {
        url: `${DUFFEL_PREVIEW_ORDER_RECONCILIATION_URL}&unexpected=true`,
      }),
      response(body(), { contentLength: "1048577" }),
    ];
    for (const item of cases) {
      mocks.fetch.mockReset().mockResolvedValueOnce(item);
      await expect(executeDuffelPreviewOrderReconciliation()).rejects.toThrow();
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
    }
  });

  it("is structurally read-only, pins 30 seconds, and contains one fetch site", () => {
    const source = readFileSync(
      "lib/flights/duffel/preview-order-reconciliation.server.ts",
      "utf8",
    );
    const route = readFileSync(
      "app/api/flights/preview-duffel-order-reconciliation/route.ts",
      "utf8",
    );
    expect(source.match(/await fetch\(/g)).toHaveLength(1);
    expect(source).toContain("const DUFFEL_REQUEST_TIMEOUT_MS = 30_000");
    expect(source).toContain("AbortSignal.timeout(DUFFEL_REQUEST_TIMEOUT_MS)");
    expect(source).toContain('redirect: "error"');
    expect(source).toContain('cache: "no-store"');
    expect(source).toContain('method: "GET"');
    expect(source).not.toMatch(/\.(?:insert|upsert|delete)\s*\(/);
    expect(source).not.toMatch(
      /\.from\("flight_runtime_controls"\)[\s\S]{0,250}\.update\s*\(/,
    );
    expect(source).not.toMatch(/\.rpc\s*\(/);
    expect(source).not.toMatch(/console\.(?:log|warn|error)/);
    expect(route).toContain("export async function GET");
    expect(route).not.toContain("export async function POST");
    expect(route).toContain("FLIGHT_DUFFEL_TEST_EXECUTION_NONCE");
    expect(route).toContain("timingSafeEqual");
    expect(route).toContain('dynamic = "force-dynamic"');
  });
});
