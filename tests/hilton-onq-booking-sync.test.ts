import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createHiltonOnQSyncAdapter,
  loadHiltonOnQSyncConfig,
  parseHiltonOnQEvent,
  verifyHiltonOnQWebhook,
} from "../services/hotel-suppliers/hilton";

const config = {
  baseUrl: "https://onq-sandbox.example",
  apiCredential: "hilton-onq-token",
  endpoints: {
    availability: { method: "GET" as const, path: "/properties/{propertyCode}/rates" },
    create_reservation: { method: "POST" as const, path: "/properties/{propertyCode}/reservations" },
    get_reservation: { method: "GET" as const, path: "/properties/{propertyCode}/reservations/{reservationId}" },
    modify_reservation: { method: "PUT" as const, path: "/properties/{propertyCode}/reservations/{reservationId}" },
    cancel_reservation: { method: "POST" as const, path: "/properties/{propertyCode}/reservations/{reservationId}/cancel" },
  },
};

const booking = {
  propertyCode: "MSYHH",
  arrivalDate: "2026-09-10",
  departureDate: "2026-09-12",
  adults: 2,
  offerId: "KING-BAR",
  externalReference: "IRP-BOOKING-2",
  guest: { firstName: "Test", lastName: "Traveler", email: "traveler@example.com" },
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("Hilton OnQ booking synchronization", () => {
  it("loads hotel-specific vendor endpoint configuration", () => {
    const loaded = loadHiltonOnQSyncConfig({
      PMS_HILTON_ONQ_BASE_URL: config.baseUrl,
      PMS_HILTON_ONQ_API_CREDENTIAL: config.apiCredential,
      PMS_HILTON_ONQ_AVAILABILITY_PATH: config.endpoints.availability.path,
      PMS_HILTON_ONQ_CREATE_PATH: config.endpoints.create_reservation.path,
      PMS_HILTON_ONQ_GET_PATH: config.endpoints.get_reservation.path,
      PMS_HILTON_ONQ_MODIFY_PATH: config.endpoints.modify_reservation.path,
      PMS_HILTON_ONQ_CANCEL_PATH: config.endpoints.cancel_reservation.path,
    });
    expect(loaded).toMatchObject({ baseUrl: config.baseUrl, timeoutMs: 15_000 });
    expect(() => loadHiltonOnQSyncConfig({})).toThrow("PMS_HILTON_ONQ_BASE_URL");
  });

  it("shops, creates, retrieves, modifies, and cancels with property scoping", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ rates: [{ bookingCode: "KING-BAR", roomType: "KING", rateCode: "BAR", amountAfterTax: 275, currencyCode: "USD" }] }))
      .mockResolvedValueOnce(response({ reservationId: "ONQ-123", confirmationNumber: "HH-456", status: "CONFIRMED" }))
      .mockResolvedValueOnce(response({ reservationId: "ONQ-123", confirmationNumber: "HH-456", status: "CONFIRMED", clientReference: "IRP-BOOKING-2" }))
      .mockResolvedValueOnce(response({ reservationId: "ONQ-123", confirmationNumber: "HH-456", status: "MODIFIED" }))
      .mockResolvedValueOnce(response({ reservationId: "ONQ-123", cancellationCode: "CXL-456", status: "CANCELLED" }));
    const adapter = createHiltonOnQSyncAdapter(config, fetcher);

    await expect(adapter.availability({ propertyCode: "MSYHH", arrivalDate: "2026-09-10", departureDate: "2026-09-12", adults: 2 }))
      .resolves.toMatchObject([{ offerId: "KING-BAR", totalAmount: 275 }]);
    await expect(adapter.createReservation(booking)).resolves.toMatchObject({ reservationId: "ONQ-123", externalReference: "IRP-BOOKING-2" });
    await expect(adapter.getReservation({ propertyCode: "MSYHH", reservationId: "ONQ-123", externalReference: "IRP-BOOKING-2" }))
      .resolves.toMatchObject({ status: "CONFIRMED" });
    await expect(adapter.modifyReservation({ ...booking, reservationId: "ONQ-123" })).resolves.toMatchObject({ status: "MODIFIED" });
    await expect(adapter.cancelReservation({ propertyCode: "MSYHH", reservationId: "ONQ-123", externalReference: "IRP-BOOKING-2" }))
      .resolves.toMatchObject({ cancellationNumber: "CXL-456" });

    expect(fetcher.mock.calls.map(([url]) => String(url).split("?")[0])).toEqual([
      "https://onq-sandbox.example/properties/MSYHH/rates",
      "https://onq-sandbox.example/properties/MSYHH/reservations",
      "https://onq-sandbox.example/properties/MSYHH/reservations/ONQ-123",
      "https://onq-sandbox.example/properties/MSYHH/reservations/ONQ-123",
      "https://onq-sandbox.example/properties/MSYHH/reservations/ONQ-123/cancel",
    ]);
    expect(JSON.parse(fetcher.mock.calls[1][1].body as string)).toMatchObject({
      propertyCode: "MSYHH",
      clientReference: "IRP-BOOKING-2",
      primaryGuest: { lastName: "Traveler" },
    });
    expect(new Headers(fetcher.mock.calls[3][1].headers).get("x-iratepilot-request-id")).toBe("modify:IRP-BOOKING-2");
  });

  it("verifies signed events and fails closed for invalid input", () => {
    const body = JSON.stringify({ eventId: "evt-onq-1", eventType: "RESERVATION_UPDATED", hotelCode: "MSYHH", reservationId: "ONQ-123" });
    const signature = createHmac("sha256", "webhook-secret").update(body).digest("hex");
    expect(verifyHiltonOnQWebhook(body, `sha256=${signature}`, "webhook-secret")).toBe(true);
    expect(verifyHiltonOnQWebhook(body, "sha256=bad", "webhook-secret")).toBe(false);
    expect(parseHiltonOnQEvent(JSON.parse(body))).toMatchObject({ eventId: "evt-onq-1", propertyCode: "MSYHH" });
    expect(() => parseHiltonOnQEvent({ eventId: "evt-onq-1" })).toThrow(/missing/);
  });
});
