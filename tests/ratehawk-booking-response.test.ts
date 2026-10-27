import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  classifyRatehawkBookingFormResponse,
  classifyRatehawkBookingStatusResponse,
  parseRatehawkBookingFormResponse,
  parseRatehawkCancellationResponse,
} from "../services/hotel-suppliers/ratehawk-booking-response.server";

describe("RateHawk booking response safety", () => {
  it("accepts booking form, final status, and cancellation confirmations", () => {
    expect(parseRatehawkBookingFormResponse({
      status: "ok",
      data: { order_id: 559350847, partner_order_id: "order-1", payment_types: [{ type: "deposit" }] },
    })).toEqual({ orderId: 559350847, partnerOrderId: "order-1", paymentTypeCount: 1 });
    expect(classifyRatehawkBookingStatusResponse({
      status: "ok", data: { partner_order_id: "order-1" },
    })).toEqual({ status: "confirmed", partnerOrderId: "order-1", error: null });
    expect(parseRatehawkCancellationResponse({
      status: "ok", data: { amount_payable: { amount: "0.00", currency_code: "EUR" } },
    })).toEqual({ cancelled: true, amountPayable: "0.00", currencyCode: "EUR" });
  });

  it("keeps transient states separate from final failures", () => {
    expect(classifyRatehawkBookingFormResponse({ status: "error", error: "timeout" }))
      .toEqual({ status: "retryable", error: "timeout" });
    expect(classifyRatehawkBookingFormResponse({ status: "error", error: "rate_not_found" }))
      .toEqual({ status: "failed", error: "rate_not_found" });
    expect(classifyRatehawkBookingStatusResponse({ status: "processing", data: {} }).status)
      .toBe("processing");
    expect(classifyRatehawkBookingStatusResponse({ status: "error", error: "timeout", data: {} }).status)
      .toBe("processing");
    expect(classifyRatehawkBookingStatusResponse({ status: "error", error: "soldout", data: {} }))
      .toMatchObject({ status: "failed", error: "soldout" });
  });

  it("fails closed on incomplete success responses", () => {
    expect(() => parseRatehawkBookingFormResponse({ status: "ok", data: {} })).toThrow("invalid_response");
    expect(() => parseRatehawkCancellationResponse({ status: "ok", data: {} })).toThrow("invalid_response");
  });
});
