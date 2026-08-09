import { describe, expect, it, vi } from "vitest";
import { createOracleOperaDistributionAdapter } from "../services/hotel-suppliers/oracle-opera/distribution-adapter";
import { loadOracleOperaDistributionConfig } from "../services/hotel-suppliers/oracle-opera/distribution-client";
import {
  parseOracleOperaDistributionEvent,
  verifyOracleOperaWebhookAuthorization,
} from "../services/hotel-suppliers/oracle-opera/webhook";

const config = {
  baseUrl: "https://distribution.example",
  tokenUrl: "https://identity.example/token",
  username: "channel-user",
  password: "channel-password",
  appKey: "app-key",
  channelCode: "IRP",
  originatingApplication: "iRatePilot",
  timeoutMs: 5_000,
};

const reservationRequest = {
  hotelId: "HOTEL1",
  arrivalDate: "2026-09-10",
  departureDate: "2026-09-12",
  adults: 2,
  externalReference: "IRP-BOOKING-1",
  offerId: "KINGBAR",
  roomTypeCode: "KING",
  ratePlanCode: "BAR",
  currency: "USD",
  totalAmount: 250,
  nightlyRates: [
    { start: "2026-09-10", end: "2026-09-10", amountAfterTax: 125 },
    { start: "2026-09-11", end: "2026-09-11", amountAfterTax: 125 },
  ],
  guest: { firstName: "Test", lastName: "Traveler", email: "traveler@example.com" },
  payment: { methodCode: "5", guaranteeType: "5", token: "tokenized-card", tokenType: "Token" },
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("Oracle OPERA Distribution synchronization", () => {
  it("loads isolated Distribution credentials", () => {
    expect(loadOracleOperaDistributionConfig({
      PMS_ORACLE_OPERA_DISTRIBUTION_BASE_URL: config.baseUrl,
      PMS_ORACLE_OPERA_DISTRIBUTION_TOKEN_URL: config.tokenUrl,
      PMS_ORACLE_OPERA_DISTRIBUTION_USERNAME: config.username,
      PMS_ORACLE_OPERA_DISTRIBUTION_PASSWORD: config.password,
      PMS_ORACLE_OPERA_DISTRIBUTION_APP_KEY: config.appKey,
      PMS_ORACLE_OPERA_DISTRIBUTION_CHANNEL_CODE: config.channelCode,
    })).toMatchObject({ channelCode: "IRP", timeoutMs: 15_000 });
  });

  it("shops official Distribution offers with channel-scoped authentication", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ access_token: "jwt", expires_in: 300 }))
      .mockResolvedValueOnce(response({ roomStays: [{ offers: [{
        bookingCode: "KINGBAR",
        roomType: "KING",
        ratePlanCode: "BAR",
        availabilityStatus: "AvailableForSale",
        total: { amountAfterTax: 250, currencyCode: "USD" },
        rateInformation: { base: [{ start: "2026-09-10", end: "2026-09-11", amountAfterTax: 125 }] },
      }] }] }));
    const adapter = createOracleOperaDistributionAdapter(config, fetcher);

    const offers = await adapter.availability({
      hotelId: "HOTEL1", arrivalDate: "2026-09-10", departureDate: "2026-09-12", adults: 2,
    });

    const tokenBody = fetcher.mock.calls[0][1].body as URLSearchParams;
    expect(tokenBody.get("username")).toBe("channel-user");
    expect(tokenBody.get("password")).toBe("channel-password");
    const [shopUrl, shopInit] = fetcher.mock.calls[1];
    expect(shopUrl).toContain("/shop/v1/hotels/HOTEL1/offers?");
    expect(shopInit.method).toBe("GET");
    expect(new Headers(shopInit.headers)).toMatchObject(expect.any(Headers));
    expect(new Headers(shopInit.headers).get("x-channelCode")).toBe("IRP");
    expect(offers[0]).toMatchObject({ offerId: "KINGBAR", totalAmount: 250, available: true });
  });

  it("creates, retrieves, modifies, and cancels reservations through Book v1", async () => {
    const booked = [{
      hotelCode: "HOTEL1",
      reservationStatus: "Reserved",
      reservationIds: [{ id: "OPERA-123", type: "Confirmation", idContext: "Central" }],
    }];
    const cancelled = [{
      hotelCode: "HOTEL1",
      reservationStatus: "Cancelled",
      reservationIds: [
        { id: "OPERA-123", type: "Confirmation" },
        { id: "CANCEL-123", type: "Cancellation" },
      ],
    }];
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ access_token: "jwt", expires_in: 300 }))
      .mockResolvedValueOnce(response(booked))
      .mockResolvedValueOnce(response(booked))
      .mockResolvedValueOnce(response(booked))
      .mockResolvedValueOnce(response(cancelled));
    const adapter = createOracleOperaDistributionAdapter(config, fetcher);

    await expect(adapter.createReservation(reservationRequest)).resolves.toMatchObject({
      reservationId: "OPERA-123", status: "Reserved",
    });
    await expect(adapter.getReservation({ hotelId: "HOTEL1", reservationId: "OPERA-123" }))
      .resolves.toMatchObject({ reservationId: "OPERA-123" });
    await expect(adapter.modifyReservation({ ...reservationRequest, reservationId: "OPERA-123" }))
      .resolves.toMatchObject({ reservationId: "OPERA-123" });
    await expect(adapter.cancelReservation({
      hotelId: "HOTEL1", reservationId: "OPERA-123", externalReference: "IRP-BOOKING-1",
    })).resolves.toMatchObject({ cancellationNumber: "CANCEL-123", status: "Cancelled" });

    expect(fetcher.mock.calls.slice(1).map(([url]) => url)).toEqual([
      "https://distribution.example/book/v1/hotels/HOTEL1/reservations",
      "https://distribution.example/book/v1/hotels/HOTEL1/reservations/OPERA-123",
      "https://distribution.example/book/v1/hotels/HOTEL1/reservations/OPERA-123",
      "https://distribution.example/book/v1/hotels/HOTEL1/reservations/OPERA-123/cancellations",
    ]);
    const createPayload = JSON.parse(fetcher.mock.calls[1][1].body as string);
    expect(createPayload.reservations[0]).toMatchObject({
      hotelCode: "HOTEL1",
      messageId: "IRP-BOOKING-1",
      roomStay: { roomRates: [{ roomType: "KING", ratePlanCode: "BAR" }] },
    });
    expect(createPayload.reservations[0].reservationPaymentMethods[0].paymentCard.cardNumber)
      .toBe("tokenized-card");
    expect(new Headers(fetcher.mock.calls[1][1].headers).has("Idempotency-Key")).toBe(false);
    expect(new Headers(fetcher.mock.calls[1][1].headers).get("x-request-id")).toBe("IRP-BOOKING-1");
  });

  it("fails closed for bad webhook credentials and malformed events", () => {
    expect(verifyOracleOperaWebhookAuthorization("Bearer webhook-secret", "webhook-secret")).toBe(true);
    expect(verifyOracleOperaWebhookAuthorization("Bearer wrong", "webhook-secret")).toBe(false);
    expect(() => parseOracleOperaDistributionEvent({ eventId: "event-1" })).toThrow(/missing/);
    expect(parseOracleOperaDistributionEvent({
      eventId: "event-1", eventType: "ARI_UPDATED", hotelCode: "HOTEL1", data: { inventory: 3 },
    })).toMatchObject({ eventId: "event-1", hotelCode: "HOTEL1" });
  });
});
