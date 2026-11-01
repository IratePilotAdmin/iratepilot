import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  buildExpediaRapidBookingRequest,
  buildExpediaRapidOccupancy,
  classifyExpediaRapidBookingFailure,
} from "../services/hotel-suppliers/expedia-rapid-booking.server";

const validInput = {
  environment: "sandbox" as const,
  bookingLink: "https://test.ean.com/v3/itineraries?token=opaque-token",
  apiKey: "api-key",
  sharedSecret: "shared-secret",
  timestampSeconds: 1_700_000_000,
  customerIp: "203.0.113.10",
  customerSessionId: "session-123",
  userAgent: "iRatePilot/1.0",
  affiliateReferenceId: "IRPABC123",
  email: "Traveler@Example.com",
  phone: { country_code: "1", area_code: "614", number: "5550100" },
  rooms: [{ given_name: "Hiren", family_name: "Patel", smoking: false }],
  payments: [{
    type: "customer_card" as const,
    number: "4111111111111111",
    security_code: "123",
    expiration_month: "08",
    expiration_year: "2030",
    billing_contact: {
      given_name: "Hiren",
      family_name: "Patel",
      address: {
        line_1: "100 Main Street",
        city: "Columbus",
        state_province_code: "OH",
        postal_code: "43215",
        country_code: "us",
      },
    },
  }],
};

describe("Expedia Rapid booking contract", () => {
  it("encodes adults and every child age for Shopping occupancy", () => {
    expect(buildExpediaRapidOccupancy(2, [4, 9])).toBe("2-4-9");
    expect(() => buildExpediaRapidOccupancy(2, [18])).toThrow("occupancy is invalid");
  });

  it("builds the documented booking fields and required customer headers", () => {
    const request = buildExpediaRapidBookingRequest(validInput);
    const body = JSON.parse(request.body);

    expect(request.url).toBe(validInput.bookingLink);
    expect(request.headers.Authorization).toMatch(/^EAN APIKey=api-key,Signature=[a-f0-9]{128},timestamp=1700000000$/);
    expect(request.headers["Customer-Ip"]).toBe(validInput.customerIp);
    expect(body).toMatchObject({
      affiliate_reference_id: "IRPABC123",
      email: "traveler@example.com",
      phone: validInput.phone,
      rooms: [{ given_name: "Hiren", family_name: "Patel", smoking: false }],
      payments: [{
        billing_contact: {
          given_name: "Hiren",
          family_name: "Patel",
          address: { postal_code: "43215", country_code: "US" },
        },
      }],
    });
  });

  it("rejects untrusted booking links and incomplete compliance fields", () => {
    expect(() => buildExpediaRapidBookingRequest({
      ...validInput,
      bookingLink: "https://attacker.example/v3/itineraries?token=opaque-token",
    })).toThrow("not an approved Price Check link");
    expect(() => buildExpediaRapidBookingRequest({
      ...validInput,
      affiliateReferenceId: "x".repeat(29),
    })).toThrow("affiliate reference ID is invalid");
    expect(() => buildExpediaRapidBookingRequest({
      ...validInput,
      payments: [{ ...validInput.payments[0], billing_contact: {
        ...validInput.payments[0].billing_contact,
        address: { ...validInput.payments[0].billing_contact.address, postal_code: "" },
      } }],
    })).toThrow("billing postal code is invalid");
  });

  it("never blindly retries an ambiguous booking result", () => {
    expect(classifyExpediaRapidBookingFailure(400, "duplicate_itinerary")).toBe("reconcile_by_affiliate_reference");
    expect(classifyExpediaRapidBookingFailure(503, "service_unavailable")).toBe("reconcile_by_affiliate_reference");
    expect(classifyExpediaRapidBookingFailure(429, "too_many_requests")).toBe("reconcile_by_affiliate_reference");
    expect(classifyExpediaRapidBookingFailure(400, "price_mismatch")).toBe("refresh_price_check");
    expect(classifyExpediaRapidBookingFailure(403, "rooms_unavailable")).toBe("re_shop");
    expect(classifyExpediaRapidBookingFailure(401, "request_unauthenticated")).toBe("do_not_retry");
  });
});
