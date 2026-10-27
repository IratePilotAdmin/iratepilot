import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildRatehawkSandboxBookingCancelRequest,
  buildRatehawkSandboxBookingFinishRequest,
  buildRatehawkSandboxBookingFormRequest,
  buildRatehawkSandboxBookingStatusRequest,
  buildRatehawkSandboxHotelpageRequest,
} from "../services/hotel-suppliers/inventory-sandbox-request.server";

const credentials = { keyId: "partner-key", apiKey: "sandbox-api-key" };
const partnerOrderId = "0b370500-5321-4046-92c5-5982f1a64fc6";

describe("RateHawk sandbox booking requests", () => {
  it("builds the required hotel-page request without mixing environments", () => {
    const request = buildRatehawkSandboxHotelpageRequest({
      ...credentials,
      payload: {
        checkin: "2027-02-22",
        checkout: "2027-02-24",
        residency: "us",
        language: "en",
        guests: [{ adults: 2, children: [] }],
        hid: 10004834,
        currency: "USD",
      },
    });

    expect(request.url).toBe("https://api-sandbox.ratehawk.com/api/b2b/v3/search/hp/");
    expect(request.method).toBe("POST");
    expect(JSON.parse(request.body ?? "")).toEqual(expect.objectContaining({ hid: 10004834 }));
  });

  it("builds the documented booking form request", () => {
    const request = buildRatehawkSandboxBookingFormRequest({
      ...credentials,
      partnerOrderId,
      bookHash: "p-bookable-rate",
      userIp: "203.0.113.10",
    });
    expect(request.url).toBe("https://api-sandbox.ratehawk.com/api/b2b/v3/hotel/order/booking/form/");
    expect(JSON.parse(request.body ?? "")).toEqual({
      partner_order_id: partnerOrderId,
      book_hash: "p-bookable-rate",
      language: "en",
      user_ip: "203.0.113.10",
    });
  });

  it("builds finish, status, and cancellation without card data", () => {
    const finish = buildRatehawkSandboxBookingFinishRequest({
      ...credentials,
      partnerOrderId,
      user: { email: "booking@iratepilot.com", phone: "+16144396660" },
      supplier: {
        firstName: "Hiren", lastName: "Patel",
        email: "booking@iratepilot.com", phone: "+16144396660",
      },
      rooms: [{ guests: [{ firstName: "Hiren", lastName: "Patel" }] }],
      paymentType: { type: "deposit", amount: "9.00", currencyCode: "EUR" },
    });
    expect(finish.url).toContain("/booking/finish/");
    expect(JSON.parse(finish.body ?? "")).toMatchObject({
      partner: { partner_order_id: partnerOrderId },
      payment_type: { type: "deposit", amount: "9.00", currency_code: "EUR" },
    });
    expect(finish.body).not.toContain("card");

    expect(buildRatehawkSandboxBookingStatusRequest({ ...credentials, partnerOrderId }).url)
      .toContain("/booking/finish/status/");
    expect(buildRatehawkSandboxBookingCancelRequest({ ...credentials, partnerOrderId }).url)
      .toContain("/order/cancel/");
  });

  it("rejects identifiers, people, and amounts that cannot be certified", () => {
    expect(() => buildRatehawkSandboxBookingFormRequest({
      ...credentials, partnerOrderId: "not-a-uuid", bookHash: "hash", userIp: "203.0.113.10",
    })).toThrow("must be a UUID");
    expect(() => buildRatehawkSandboxBookingFinishRequest({
      ...credentials,
      partnerOrderId,
      user: { email: "invalid", phone: "+16144396660" },
      supplier: { firstName: "Hiren", lastName: "Patel", email: "booking@iratepilot.com", phone: "+16144396660" },
      rooms: [{ guests: [{ firstName: "Hiren1", lastName: "Patel" }] }],
      paymentType: { type: "deposit", amount: "9.000", currencyCode: "EUR" },
    })).toThrow();
  });
});
