import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  buildExpediaRapidAffiliateReferenceId,
  buildExpediaRapidBookingRequest,
  buildExpediaRapidRetrieveRequest,
  buildExpediaRapidOccupancy,
  classifyExpediaRapidBookingFailure,
  executeExpediaRapidBookingRequest,
  getExpediaRapidBookingRecoveryGuidance,
  logExpediaRapidBookingExecutionResult,
  mapExpediaRapidBookingRequirementCoverage,
  sanitizeExpediaRapidBookingEvidence,
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
  internalBookingId: "booking-123",
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
  it("provides safe, non-retrying customer and operator guidance for every recovery", () => {
    const recoveries = [
      "do_not_retry",
      "reconcile_by_affiliate_reference",
      "refresh_price_check",
      "re_shop",
    ] as const;

    for (const recovery of recoveries) {
      expect(getExpediaRapidBookingRecoveryGuidance(recovery)).toMatchObject({
        version: "expedia-rapid-booking-recovery-v1",
        recovery,
        retryOriginalBooking: false,
      });
      expect(getExpediaRapidBookingRecoveryGuidance(recovery).customerMessage).not.toContain("Expedia");
      expect(getExpediaRapidBookingRecoveryGuidance(recovery).operatorAction.length).toBeGreaterThan(20);
    }
  });

  it("logs only allowlisted operational booking fields", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logExpediaRapidBookingExecutionResult({
      outcome: "action_required",
      status: 503,
      recovery: "reconcile_by_affiliate_reference",
      transactionIdPresent: true,
    });

    expect(warn).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(warn.mock.calls[0]?.[0]));
    expect(payload).toMatchObject({
      level: "warning",
      event: "expedia_rapid_booking_action_required",
      outcome: "action_required",
      status: 503,
      recovery: "reconcile_by_affiliate_reference",
      transactionIdPresent: true,
    });
    expect(Object.keys(payload).sort()).toEqual([
      "event",
      "level",
      "outcome",
      "recovery",
      "status",
      "timestamp",
      "transactionIdPresent",
    ]);
    warn.mockRestore();
  });

  it("derives a stable, environment-bound affiliate reference for every booking", () => {
    const first = buildExpediaRapidAffiliateReferenceId({
      environment: "sandbox",
      internalBookingId: "booking-123",
    });
    const repeated = buildExpediaRapidAffiliateReferenceId({
      environment: "sandbox",
      internalBookingId: "booking-123",
    });
    const otherBooking = buildExpediaRapidAffiliateReferenceId({
      environment: "sandbox",
      internalBookingId: "booking-456",
    });
    const production = buildExpediaRapidAffiliateReferenceId({
      environment: "production",
      internalBookingId: "booking-123",
    });

    expect(first).toMatch(/^IRP[A-F0-9]{25}$/);
    expect(first).toHaveLength(28);
    expect(repeated).toBe(first);
    expect(otherBooking).not.toBe(first);
    expect(production).not.toBe(first);
  });

  it("encodes adults and every child age for Shopping occupancy", () => {
    expect(buildExpediaRapidOccupancy(2, [])).toBe("2");
    expect(buildExpediaRapidOccupancy(2, [4])).toBe("2-4");
    expect(buildExpediaRapidOccupancy(2, [4, 9])).toBe("2-4,9");
    expect(() => buildExpediaRapidOccupancy(2, [18])).toThrow("occupancy is invalid");
  });

  it("builds the documented booking fields and required customer headers", () => {
    const request = buildExpediaRapidBookingRequest(validInput);
    const body = JSON.parse(request.body);

    expect(request.url).toBe(validInput.bookingLink);
    expect(request.headers.Authorization).toMatch(/^EAN APIKey=api-key,Signature=[a-f0-9]{128},timestamp=1700000000$/);
    expect(request.headers["Customer-Ip"]).toBe(validInput.customerIp);
    expect(body).toMatchObject({
      affiliate_reference_id: buildExpediaRapidAffiliateReferenceId(validInput),
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
      internalBookingId: "",
    })).toThrow("internal booking ID is invalid");
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

  it("builds Expedia's documented affiliate-reference retrieval request", () => {
    const request = buildExpediaRapidRetrieveRequest({
      environment: "sandbox",
      apiKey: validInput.apiKey,
      sharedSecret: validInput.sharedSecret,
      timestampSeconds: validInput.timestampSeconds,
      customerIp: validInput.customerIp,
      customerSessionId: validInput.customerSessionId,
      userAgent: validInput.userAgent,
      internalBookingId: validInput.internalBookingId,
      email: validInput.email,
    });
    const url = new URL(request.url);

    expect(url.origin).toBe("https://test.ean.com");
    expect(url.pathname).toBe("/v3/itineraries");
    expect(url.searchParams.get("affiliate_reference_id"))
      .toBe(buildExpediaRapidAffiliateReferenceId(validInput));
    expect(url.searchParams.get("email")).toBe("traveler@example.com");
    expect(request.method).toBe("GET");
  });

  it("accepts a complete confirmation without exposing it in sanitized evidence", async () => {
    const request = buildExpediaRapidBookingRequest(validInput);
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      itinerary_id: "supplier-itinerary-123",
      links: { retrieve: { href: "/v3/itineraries/supplier-itinerary-123" } },
    }), { status: 201, headers: { "transaction-id": "supplier-transaction-456" } }));

    const result = await executeExpediaRapidBookingRequest(request, { fetcher });
    const evidence = sanitizeExpediaRapidBookingEvidence(request, result);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ outcome: "confirmed", status: 201 });
    expect(evidence).toMatchObject({
      outcome: "confirmed",
      itineraryIdPresent: true,
      retrieveLinkPresent: true,
      transactionIdPresent: true,
      requestCoverage: {
        affiliateReferenceId: true,
        travelerEmail: true,
        travelerPhone: true,
        roomGuestNames: true,
        paymentCard: true,
        billingContact: true,
        billingAddress: true,
        payorName: true,
        billingCountry: true,
        billingPostalCode: true,
      },
    });
    expect(mapExpediaRapidBookingRequirementCoverage(evidence)).toEqual({
      TR1: true,
      TR3: true,
      TR3a: true,
      TR3b: true,
      TR3c: true,
      TR4: true,
      TR5: true,
      TR5a: true,
      TR5b: true,
    });
    expect(JSON.stringify(evidence)).not.toContain("supplier-itinerary-123");
    expect(JSON.stringify(evidence)).not.toContain(validInput.email);
    expect(JSON.stringify(evidence)).not.toContain(validInput.payments[0].number);
  });

  it("fails closed and requires reconciliation for ambiguous outcomes", async () => {
    const request = buildExpediaRapidBookingRequest(validInput);
    const malformedSuccess = vi.fn(async () => new Response("<html>gateway response</html>", {
      status: 200,
      headers: { "transaction-id": "transaction-789" },
    }));
    const networkFailure = vi.fn(async () => { throw new Error("socket closed"); });

    await expect(executeExpediaRapidBookingRequest(request, { fetcher: malformedSuccess })).resolves.toEqual({
      outcome: "action_required",
      status: 200,
      recovery: "reconcile_by_affiliate_reference",
      transactionIdPresent: true,
    });
    await expect(executeExpediaRapidBookingRequest(request, { fetcher: networkFailure })).resolves.toEqual({
      outcome: "action_required",
      status: null,
      recovery: "reconcile_by_affiliate_reference",
      transactionIdPresent: false,
    });
    expect(malformedSuccess).toHaveBeenCalledTimes(1);
    expect(networkFailure).toHaveBeenCalledTimes(1);
  });

  it("rejects an untrusted retrieve link in an otherwise successful response", async () => {
    const request = buildExpediaRapidBookingRequest(validInput);
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      itinerary_id: "supplier-itinerary-123",
      links: { retrieve: { href: "https://attacker.example/v3/itineraries/supplier-itinerary-123" } },
    }), { status: 201 }));

    await expect(executeExpediaRapidBookingRequest(request, { fetcher })).resolves.toEqual({
      outcome: "action_required",
      status: 201,
      recovery: "reconcile_by_affiliate_reference",
      transactionIdPresent: false,
    });
  });

  it("maps structured supplier failures without retrying the booking", async () => {
    const request = buildExpediaRapidBookingRequest(validInput);
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      errors: [{ type: "price_mismatch", message: "price changed" }],
    }), { status: 400 }));

    await expect(executeExpediaRapidBookingRequest(request, { fetcher })).resolves.toEqual({
      outcome: "action_required",
      status: 400,
      recovery: "refresh_price_check",
      transactionIdPresent: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("prefers an actionable nested error over Expedia's generic wrapper", async () => {
    const request = buildExpediaRapidBookingRequest(validInput);
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      type: "invalid_input",
      errors: [{ type: "duplicate_itinerary", message: "affiliate reference already exists" }],
    }), { status: 400 }));

    await expect(executeExpediaRapidBookingRequest(request, { fetcher })).resolves.toEqual({
      outcome: "action_required",
      status: 400,
      recovery: "reconcile_by_affiliate_reference",
      transactionIdPresent: false,
    });
  });
});
