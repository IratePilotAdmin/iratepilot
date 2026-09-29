import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildFlightConsumerProductionDuffelOrderPlan,
  FlightConsumerProductionDuffelOrderPlanError,
} from "../lib/flights/consumer-production/duffel-order-plan.server";

const now = new Date("2026-08-26T18:00:00.000Z");
const passengerId = "pas_0000000000000001";

function offer(input: Readonly<{
  id: string;
  amount?: string;
  expiresAt?: string;
  liveMode?: boolean;
  partial?: boolean;
  currency?: string;
  requiresInstantPayment?: boolean;
  documentsRequired?: boolean;
  passenger?: Readonly<{ id: string; type: string }>;
}>) {
  return {
    id: input.id,
    live_mode: input.liveMode ?? true,
    partial: input.partial ?? false,
    total_amount: input.amount ?? "250.00",
    total_currency: input.currency ?? "USD",
    expires_at: input.expiresAt ?? "2026-08-26T18:30:00.000000Z",
    passenger_identity_documents_required: input.documentsRequired ?? false,
    payment_requirements: {
      requires_instant_payment: input.requiresInstantPayment ?? true,
    },
    passengers: [input.passenger ?? { id: passengerId, type: "adult" }],
  };
}

function response(offers: readonly ReturnType<typeof offer>[]) {
  return {
    data: {
      id: "orq_0000000000000001",
      live_mode: true,
      passengers: [{ id: passengerId, type: "adult" }],
      offers,
    },
  };
}

function tiebreak(id: string) {
  return createHash("sha256")
    .update(
      "iratepilot:flight-consumer-production:duffel-order-plan:offer-id-tiebreak:v1",
      "utf8",
    )
    .update("\0", "utf8")
    .update(id, "utf8")
    .digest("hex");
}

describe("Flight Consumer Production zero-dispatch Duffel order plan", () => {
  it("selects deterministically by amount, expiry, then a domain-separated offer-ID hash", () => {
    const expensive = offer({ id: "off_0000000000000001", amount: "251.00" });
    const earlier = offer({
      id: "off_0000000000000002",
      amount: "250.00",
      expiresAt: "2026-08-26T18:30:00.000001Z",
    });
    const tieOne = offer({
      id: "off_0000000000000003",
      amount: "250.00",
      expiresAt: "2026-08-26T18:45:00.000001Z",
    });
    const tieTwo = offer({
      id: "off_0000000000000004",
      amount: "250.00",
      expiresAt: "2026-08-26T18:45:00.000001Z",
    });
    const selected = [tieOne, tieTwo]
      .sort((left, right) => tiebreak(left.id).localeCompare(tiebreak(right.id)))[0]!;
    const all = buildFlightConsumerProductionDuffelOrderPlan(
      response([expensive, tieTwo, earlier, tieOne]),
      now,
    );
    const selectedAlone = buildFlightConsumerProductionDuffelOrderPlan(
      response([selected]),
      now,
    );

    expect(all).toMatchObject({
      offerCount: 4,
      eligibleOfferCount: 4,
      selectionPolicySha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      fictionalTravelerFixtureSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      orderRequestBodySha256: selectedAlone.orderRequestBodySha256,
      orderRequestEnvelopeSha256: selectedAlone.orderRequestEnvelopeSha256,
      providerOrderDispatchCount: 0,
      stripeRequestCount: 0,
      rawProviderReferencesExposed: false,
      orderEndpointAuthorized: false,
      stripeAuthorized: false,
      bookingAuthorized: false,
      paymentAuthorized: false,
      settlementAuthorized: false,
      ticketingAuthorized: false,
    });
    expect(Object.isFrozen(all)).toBe(true);
    expect(JSON.stringify(all)).not.toMatch(/(?:off|pas|orq)_|Synthetic|example\.test|13125550121/);
  });

  it("is independent of offer order and changes aggregate hashes with selection evidence", () => {
    const first = offer({ id: "off_0000000000000010", amount: "199.99" });
    const second = offer({ id: "off_0000000000000011", amount: "200.00" });
    const initial = buildFlightConsumerProductionDuffelOrderPlan(response([first, second]), now);
    const reordered = buildFlightConsumerProductionDuffelOrderPlan(response([second, first]), now);
    const changedOffer = buildFlightConsumerProductionDuffelOrderPlan(response([{
      ...first,
      id: "off_0000000000000012",
    }, second]), now);
    const changedPassenger = buildFlightConsumerProductionDuffelOrderPlan({
      data: {
        ...response([first]).data,
        passengers: [{ id: "pas_0000000000000012", type: "adult" }],
        offers: [{
          ...first,
          passengers: [{ id: "pas_0000000000000012", type: "adult" }],
        }],
      },
    }, now);

    expect(reordered).toEqual(initial);
    expect(changedOffer.fictionalTravelerFixtureSha256)
      .toBe(initial.fictionalTravelerFixtureSha256);
    expect(changedOffer.selectionPolicySha256).not.toBe(initial.selectionPolicySha256);
    expect(changedOffer.orderRequestBodySha256).not.toBe(initial.orderRequestBodySha256);
    expect(changedOffer.orderRequestEnvelopeSha256).not.toBe(initial.orderRequestEnvelopeSha256);
    expect(changedPassenger.orderRequestBodySha256).not.toBe(initial.orderRequestBodySha256);
    expect(changedPassenger.orderRequestEnvelopeSha256).not.toBe(initial.orderRequestEnvelopeSha256);
  });

  it("counts only offers compatible with the fixed live instant balance plan", () => {
    const eligible = offer({ id: "off_0000000000000020", amount: "100.00" });
    const decoded = response([
      eligible,
      offer({ id: "off_0000000000000021", liveMode: false }),
      offer({ id: "off_0000000000000022", partial: true }),
      offer({ id: "off_0000000000000023", currency: "CAD" }),
      offer({ id: "off_0000000000000024", amount: "0.00" }),
      offer({ id: "off_0000000000000025", expiresAt: "2026-08-26T18:14:59.999999Z" }),
      offer({ id: "off_0000000000000026", requiresInstantPayment: false }),
      offer({ id: "off_0000000000000027", documentsRequired: true }),
      offer({
        id: "off_0000000000000028",
        passenger: { id: "pas_0000000000000099", type: "adult" },
      }),
      offer({
        id: "off_0000000000000029",
        passenger: { id: passengerId, type: "child" },
      }),
    ]);

    expect(buildFlightConsumerProductionDuffelOrderPlan(decoded, now)).toMatchObject({
      offerCount: 10,
      eligibleOfferCount: 1,
    });
  });

  it("fails closed for malformed response contracts, duplicate IDs, invalid clocks, and no candidate", () => {
    expect(() => buildFlightConsumerProductionDuffelOrderPlan({ data: {} }, now))
      .toThrow(FlightConsumerProductionDuffelOrderPlanError);
    expect(() => buildFlightConsumerProductionDuffelOrderPlan(response([
      offer({ id: "off_0000000000000030" }),
      offer({ id: "off_0000000000000030" }),
    ]), now)).toThrow(expect.objectContaining({ code: "provider_contract_refused" }));
    expect(() => buildFlightConsumerProductionDuffelOrderPlan(response([]), new Date("invalid")))
      .toThrow(expect.objectContaining({ code: "invalid_clock" }));
    expect(() => buildFlightConsumerProductionDuffelOrderPlan(response([
      offer({ id: "off_0000000000000031", documentsRequired: true }),
    ]), now)).toThrow(expect.objectContaining({ code: "no_eligible_offer" }));
  });

  it("keeps the pure source outside all dispatch, secret, persistence, and payment transports", () => {
    const source = readFileSync(
      new URL(
        "../lib/flights/consumer-production/duffel-order-plan.server.ts",
        import.meta.url,
      ),
      "utf8",
    );

    expect(source).not.toMatch(/from\s+["'][^"']*(?:supabase|stripe|preview|order-transport)[^"']*["']/i);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/\bprocess\.env\b/);
    expect(source).not.toMatch(/\bcreateAdminClient\b|\bPaymentIntent\b|\bDUFFEL_(?:LIVE|TEST)_ACCESS_TOKEN\b/);
    expect(source).toContain('path: "/air/orders"');
    expect(source).toContain('type: "balance"');
    expect(source).toContain('type: "instant"');
  });
});
