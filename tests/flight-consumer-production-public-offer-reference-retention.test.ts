import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createFlightConsumerProductionPublicOfferReferenceRetention,
} from "../lib/flights/consumer-production/public-offer-reference-retention.server";

const falseAxes = {
  provider_dispatch_authorized: false, consumer_exposure_authorized: false,
  order_authorized: false, stripe_dispatch_authorized: false,
  booking_authorized: false, payment_authorized: false,
  capture_authorized: false, refund_authorized: false,
  settlement_authorized: false, ticketing_authorized: false,
  servicing_authorized: false, consumer_release_enabled: false,
  blind_retry_authorized: false,
};

describe("Production offer-reference retention bridge", () => {
  it("is default-off, bounded, route-free, and accepts only exact receipts", async () => {
    expect(() => createFlightConsumerProductionPublicOfferReferenceRetention({}, {
      rpc: vi.fn(),
    })).toThrow();
    const rpc = vi.fn().mockResolvedValue({ data: [{
      decision: "empty", purge_receipt_id: null, purged_count: 0,
      purged_at: "2026-08-27T12:00:00.000Z", ...falseAxes,
    }], error: null });
    const retention = createFlightConsumerProductionPublicOfferReferenceRetention(
      { FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_PURGE_ENABLED: "true" },
      { rpc },
    );
    expect(retention).toMatchObject({
      routeExposed: false, schedulerImplemented: false,
      decryptImplemented: false, providerRequests: 0,
    });
    await expect(retention.purge(500)).resolves.toMatchObject({
      decision: "empty", purged_count: 0,
    });
    expect(rpc).toHaveBeenCalledWith(
      "purge_flight_consumer_live_expired_offer_references_v1",
      { p_limit: 500 },
    );
    await expect(retention.purge(501)).rejects.toThrow();
  });
});
