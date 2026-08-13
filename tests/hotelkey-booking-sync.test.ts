import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createHotelKeySyncAdapter, loadHotelKeySyncConfig,
  parseHotelKeyEvent, verifyHotelKeyWebhook,
} from "../services/hotel-suppliers/hotelkey";

const config = {
  baseUrl: "https://sandbox.hotelkey.example",
  apiCredential: "hotelkey-issued-token",
  endpoints: {
    availability: { method: "GET" as const, path: "/properties/{propertyCode}/rates" },
    create_reservation: { method: "POST" as const, path: "/properties/{propertyCode}/reservations" },
    get_reservation: { method: "GET" as const, path: "/properties/{propertyCode}/reservations/{reservationId}" },
    modify_reservation: { method: "PUT" as const, path: "/properties/{propertyCode}/reservations/{reservationId}" },
    cancel_reservation: { method: "POST" as const, path: "/properties/{propertyCode}/reservations/{reservationId}/cancel" },
  },
};
const booking = {
  propertyCode: "HK100", arrivalDate: "2026-09-10", departureDate: "2026-09-12", adults: 2,
  offerId: "KING-BAR", externalReference: "IRP-BOOKING-5",
  guest: { firstName: "Test", lastName: "Traveler", email: "traveler@example.com" },
};
function response(body: unknown) { return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }); }

describe("HotelKey booking synchronization", () => {
  it("loads HotelKey-issued endpoints and credentials", () => {
    const loaded = loadHotelKeySyncConfig({
      PMS_HOTELKEY_BASE_URL: config.baseUrl,
      PMS_HOTELKEY_API_CREDENTIAL: config.apiCredential,
      PMS_HOTELKEY_AVAILABILITY_PATH: config.endpoints.availability.path,
      PMS_HOTELKEY_CREATE_PATH: config.endpoints.create_reservation.path,
      PMS_HOTELKEY_GET_PATH: config.endpoints.get_reservation.path,
      PMS_HOTELKEY_MODIFY_PATH: config.endpoints.modify_reservation.path,
      PMS_HOTELKEY_CANCEL_PATH: config.endpoints.cancel_reservation.path,
    });
    expect(loaded).toMatchObject({ baseUrl: config.baseUrl, timeoutMs: 15_000 });
    expect(() => loadHotelKeySyncConfig({})).toThrow("PMS_HOTELKEY_BASE_URL");
  });

  it("shops, creates, retrieves, modifies, and cancels with stable correlation IDs", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ rates: [{ bookingCode: "KING-BAR", roomType: "KING", rateCode: "BAR", amountAfterTax: 260, currencyCode: "USD" }] }))
      .mockResolvedValueOnce(response({ reservationId: "HK-123", confirmationNumber: "HK-CNF-123", status: "CONFIRMED" }))
      .mockResolvedValueOnce(response({ reservationId: "HK-123", confirmationNumber: "HK-CNF-123", status: "CONFIRMED", externalReference: "IRP-BOOKING-5" }))
      .mockResolvedValueOnce(response({ reservationId: "HK-123", confirmationNumber: "HK-CNF-123", status: "MODIFIED" }))
      .mockResolvedValueOnce(response({ reservationId: "HK-123", cancellationCode: "HK-CXL-123", status: "CANCELLED" }));
    const adapter = createHotelKeySyncAdapter(config, fetcher);
    await expect(adapter.availability({ propertyCode: "HK100", arrivalDate: "2026-09-10", departureDate: "2026-09-12", adults: 2 }))
      .resolves.toMatchObject([{ offerId: "KING-BAR", totalAmount: 260 }]);
    await expect(adapter.createReservation(booking)).resolves.toMatchObject({ reservationId: "HK-123", externalReference: "IRP-BOOKING-5" });
    await expect(adapter.getReservation({ propertyCode: "HK100", reservationId: "HK-123", externalReference: "IRP-BOOKING-5" }))
      .resolves.toMatchObject({ status: "CONFIRMED" });
    await expect(adapter.modifyReservation({ ...booking, reservationId: "HK-123" })).resolves.toMatchObject({ status: "MODIFIED" });
    await expect(adapter.cancelReservation({ propertyCode: "HK100", reservationId: "HK-123", externalReference: "IRP-BOOKING-5" }))
      .resolves.toMatchObject({ cancellationNumber: "HK-CXL-123" });
    expect(fetcher.mock.calls.map(([url]) => String(url).split("?")[0])).toEqual([
      "https://sandbox.hotelkey.example/properties/HK100/rates",
      "https://sandbox.hotelkey.example/properties/HK100/reservations",
      "https://sandbox.hotelkey.example/properties/HK100/reservations/HK-123",
      "https://sandbox.hotelkey.example/properties/HK100/reservations/HK-123",
      "https://sandbox.hotelkey.example/properties/HK100/reservations/HK-123/cancel",
    ]);
    expect(new Headers(fetcher.mock.calls[3][1].headers).get("x-iratepilot-request-id")).toBe("modify:IRP-BOOKING-5");
  });

  it("verifies signed events and rejects incomplete payloads", () => {
    const body = JSON.stringify({ eventId: "evt-hotelkey-1", eventType: "RESERVATION_UPDATED", propertyCode: "HK100", reservationId: "HK-123" });
    const signature = createHmac("sha256", "webhook-secret").update(body).digest("hex");
    expect(verifyHotelKeyWebhook(body, `sha256=${signature}`, "webhook-secret")).toBe(true);
    expect(verifyHotelKeyWebhook(body, "sha256=bad", "webhook-secret")).toBe(false);
    expect(parseHotelKeyEvent(JSON.parse(body))).toMatchObject({ eventId: "evt-hotelkey-1", reservationId: "HK-123" });
    expect(() => parseHotelKeyEvent({ eventId: "evt-hotelkey-1" })).toThrow(/missing/);
  });
});
