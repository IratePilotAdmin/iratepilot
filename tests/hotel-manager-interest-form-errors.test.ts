import { describe, expect, it } from "vitest";
import {
  HOTEL_MANAGER_INTEREST_ERROR,
  HOTEL_MANAGER_INTEREST_RATE_LIMIT_ERROR,
  HOTEL_MANAGER_INTEREST_SUCCESS,
  HOTEL_MANAGER_INTEREST_UNCONFIRMED,
  PARTNER_APPLICATION_ERROR,
  PARTNER_APPLICATION_RATE_LIMIT_ERROR,
  PARTNER_APPLICATION_SUCCESS,
  hotelManagerInterestResponseMessage,
  isHotelManagerInterestReceived,
  partnerApplicationResponseMessage,
} from "../lib/hotels/intake-response-message";

const receivedInterest = { status: "received", intakeMode: "manager_interest" };

describe("hotel intake response messages", () => {
  it("uses product-owned throttling copy for unrecognized rate-limit responses", () => {
    for (const payload of [
      {
        code: "rate_limited",
        message: "Provider-owned message",
        id: "waf-request-id",
      },
      {
        error: {
          code: "rate_limited",
          message: "Nested provider-owned message",
          id: "waf-request-id",
        },
      },
      { error: "Provider-owned error" },
      { code: "unknown_capacity_code", error: "Provider-owned error" },
      { error: { code: "hotel_interest_capacity_full" } },
      [{ code: "hotel_interest_capacity_full" }],
      "<html><body>gateway response</body></html>",
      null,
    ]) {
      expect(hotelManagerInterestResponseMessage(payload, { ok: false, status: 429 }))
        .toBe(HOTEL_MANAGER_INTEREST_RATE_LIMIT_ERROR);
      expect(partnerApplicationResponseMessage(payload, { ok: false, status: 429 }))
        .toBe(PARTNER_APPLICATION_RATE_LIMIT_ERROR);
    }
  });

  it.each([
    { code: "hotel_interest_capacity_full", error: "Untrusted replacement copy" },
    { code: "hotel_interest_capacity_full", error: { message: "Unexpected object" } },
  ])("explains a full hotel queue using fixed capacity copy (%j)", (payload) => {
    expect(hotelManagerInterestResponseMessage(payload, { ok: false, status: 429 }))
      .toBe("Hotel manager interest capacity is temporarily full. Please contact the team.");
    expect(isHotelManagerInterestReceived(payload, { ok: false, status: 429 })).toBe(false);
    expect(partnerApplicationResponseMessage(payload, { ok: false, status: 429 }))
      .toBe(PARTNER_APPLICATION_RATE_LIMIT_ERROR);
  });

  it("accepts only the app contract's top-level string errors", () => {
    expect(hotelManagerInterestResponseMessage({
      error: "Hotel manager interest intake is temporarily unavailable.",
    }, { ok: false, status: 503 })).toBe("Hotel manager interest intake is temporarily unavailable.");

    expect(hotelManagerInterestResponseMessage({
      code: "rate_limited",
      message: "Technical message must not be used for a failed response.",
      id: "waf-request-id",
    }, { ok: false, status: 500 })).toBe(HOTEL_MANAGER_INTEREST_ERROR);
    expect(hotelManagerInterestResponseMessage({
      error: {
        code: "provider_error",
        message: "Nested provider details must not render.",
        id: "waf-request-id",
      },
    }, { ok: false, status: 500 })).toBe(HOTEL_MANAGER_INTEREST_ERROR);
  });

  it("always returns a string for malformed or arbitrary payloads", () => {
    for (const payload of [
      null,
      undefined,
      429,
      true,
      ["unexpected"],
      { code: "rate_limited", id: "waf-request-id" },
      { error: { code: "rate_limited", id: "waf-request-id" } },
      "<html><body>gateway response</body></html>",
    ]) {
      const message = hotelManagerInterestResponseMessage(payload, { ok: false, status: 500 });
      expect(message).toBe(HOTEL_MANAGER_INTEREST_ERROR);
      expect(typeof message).toBe("string");
    }
  });

  it("uses bounded success copy and ignores malformed or oversized messages", () => {
    expect(hotelManagerInterestResponseMessage({
      ...receivedInterest,
      message: "  Request   received\nfor review.  ",
    }, { ok: true, status: 201 })).toBe("Request received for review.");
    expect(hotelManagerInterestResponseMessage(receivedInterest, { ok: true, status: 201 }))
      .toBe(HOTEL_MANAGER_INTEREST_SUCCESS);
    expect(hotelManagerInterestResponseMessage({ ...receivedInterest, message: "x".repeat(301) }, { ok: true, status: 201 }))
      .toBe(HOTEL_MANAGER_INTEREST_SUCCESS);
    expect(partnerApplicationResponseMessage({ message: "Untrusted success override" }, { ok: true, status: 201 }))
      .toBe(PARTNER_APPLICATION_SUCCESS);
  });

  it.each([
    null,
    {},
    [],
    "<html><body>Sign in</body></html>",
    { message: "Request received" },
    { status: "received", intakeMode: "full_application" },
    { status: "pending", intakeMode: "manager_interest" },
  ])("does not claim receipt for an unexpected successful response (%j)", (payload) => {
    expect(isHotelManagerInterestReceived(payload, { ok: true, status: 201 })).toBe(false);
    expect(hotelManagerInterestResponseMessage(payload, { ok: true, status: 201 }))
      .toBe(HOTEL_MANAGER_INTEREST_UNCONFIRMED);
  });

  it.each([200, 202, 204])("does not confirm a receipt with unexpected HTTP status %s", (status) => {
    expect(isHotelManagerInterestReceived(receivedInterest, { ok: true, status })).toBe(false);
    expect(hotelManagerInterestResponseMessage(receivedInterest, { ok: true, status }))
      .toBe(HOTEL_MANAGER_INTEREST_UNCONFIRMED);
  });

  it("confirms only a received lead on the endpoint's successful HTTP status", () => {
    expect(isHotelManagerInterestReceived(receivedInterest, { ok: true, status: 201 })).toBe(true);
    expect(isHotelManagerInterestReceived(receivedInterest, { ok: false, status: 503 })).toBe(false);
  });

  it("keeps the disabled full application on fixed safe fallbacks", () => {
    expect(partnerApplicationResponseMessage({ error: "Application intake is disabled." }, { ok: false, status: 503 }))
      .toBe("Application intake is disabled.");
    expect(partnerApplicationResponseMessage({ error: { message: "nested" } }, { ok: false, status: 500 }))
      .toBe(PARTNER_APPLICATION_ERROR);
  });
});
