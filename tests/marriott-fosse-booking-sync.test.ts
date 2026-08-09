import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createMarriottFosseSyncAdapter, loadMarriottFosseSyncConfig,
  parseMarriottFosseEvent, verifyMarriottFosseWebhook,
} from "../services/hotel-suppliers/marriott";

const config = {
  baseUrl: "https://fosse-sandbox.example",
  apiCredential: "marriott-issued-token",
  endpoints: {
    availability: { method: "GET" as const, path: "/properties/{propertyCode}/rates" },
    create_reservation: { method: "POST" as const, path: "/properties/{propertyCode}/reservations" },
    get_reservation: { method: "GET" as const, path: "/properties/{propertyCode}/reservations/{reservationId}" },
    modify_reservation: { method: "PUT" as const, path: "/properties/{propertyCode}/reservations/{reservationId}" },
    cancel_reservation: { method: "POST" as const, path: "/properties/{propertyCode}/reservations/{reservationId}/cancel" },
  },
};
const booking = {
  propertyCode: "MSYRI", arrivalDate: "2026-09-10", departureDate: "2026-09-12", adults: 2,
  offerId: "KING-BAR", externalReference: "IRP-BOOKING-3",
  guest: { firstName: "Test", lastName: "Traveler", email: "traveler@example.com" },
};
function response(body: unknown) { return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }); }

describe("Marriott FOSSE booking synchronization", () => {
  it("loads Marriott-issued endpoints and credentials", () => {
    const loaded = loadMarriottFosseSyncConfig({
      PMS_MARRIOTT_FOSSE_BASE_URL: config.baseUrl,
      PMS_MARRIOTT_FOSSE_API_CREDENTIAL: config.apiCredential,
      PMS_MARRIOTT_FOSSE_AVAILABILITY_PATH: config.endpoints.availability.path,
      PMS_MARRIOTT_FOSSE_CREATE_PATH: config.endpoints.create_reservation.path,
      PMS_MARRIOTT_FOSSE_GET_PATH: config.endpoints.get_reservation.path,
      PMS_MARRIOTT_FOSSE_MODIFY_PATH: config.endpoints.modify_reservation.path,
      PMS_MARRIOTT_FOSSE_CANCEL_PATH: config.endpoints.cancel_reservation.path,
    });
    expect(loaded).toMatchObject({ baseUrl: config.baseUrl, timeoutMs: 15_000 });
    expect(() => loadMarriottFosseSyncConfig({})).toThrow("PMS_MARRIOTT_FOSSE_BASE_URL");
  });

  it("shops, creates, retrieves, modifies, and cancels with stable correlation IDs", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ rates: [{ bookingCode: "KING-BAR", roomType: "KING", rateCode: "BAR", amountAfterTax: 240, currencyCode: "USD" }] }))
      .mockResolvedValueOnce(response({ reservationId: "FOSSE-123", confirmationNumber: "MAR-123", status: "CONFIRMED" }))
      .mockResolvedValueOnce(response({ reservationId: "FOSSE-123", confirmationNumber: "MAR-123", status: "CONFIRMED", externalReference: "IRP-BOOKING-3" }))
      .mockResolvedValueOnce(response({ reservationId: "FOSSE-123", confirmationNumber: "MAR-123", status: "MODIFIED" }))
      .mockResolvedValueOnce(response({ reservationId: "FOSSE-123", cancellationCode: "CXL-789", status: "CANCELLED" }));
    const adapter = createMarriottFosseSyncAdapter(config, fetcher);
    await expect(adapter.availability({ propertyCode: "MSYRI", arrivalDate: "2026-09-10", departureDate: "2026-09-12", adults: 2 }))
      .resolves.toMatchObject([{ offerId: "KING-BAR", totalAmount: 240 }]);
    await expect(adapter.createReservation(booking)).resolves.toMatchObject({ reservationId: "FOSSE-123", externalReference: "IRP-BOOKING-3" });
    await expect(adapter.getReservation({ propertyCode: "MSYRI", reservationId: "FOSSE-123", externalReference: "IRP-BOOKING-3" }))
      .resolves.toMatchObject({ status: "CONFIRMED" });
    await expect(adapter.modifyReservation({ ...booking, reservationId: "FOSSE-123" })).resolves.toMatchObject({ status: "MODIFIED" });
    await expect(adapter.cancelReservation({ propertyCode: "MSYRI", reservationId: "FOSSE-123", externalReference: "IRP-BOOKING-3" }))
      .resolves.toMatchObject({ cancellationNumber: "CXL-789" });
    expect(fetcher.mock.calls.map(([url]) => String(url).split("?")[0])).toEqual([
      "https://fosse-sandbox.example/properties/MSYRI/rates",
      "https://fosse-sandbox.example/properties/MSYRI/reservations",
      "https://fosse-sandbox.example/properties/MSYRI/reservations/FOSSE-123",
      "https://fosse-sandbox.example/properties/MSYRI/reservations/FOSSE-123",
      "https://fosse-sandbox.example/properties/MSYRI/reservations/FOSSE-123/cancel",
    ]);
    expect(new Headers(fetcher.mock.calls[3][1].headers).get("x-iratepilot-request-id")).toBe("modify:IRP-BOOKING-3");
  });

  it("verifies signed events and rejects incomplete payloads", () => {
    const body = JSON.stringify({ eventId: "evt-fosse-1", eventType: "RESERVATION_UPDATED", propertyCode: "MSYRI", reservationId: "FOSSE-123" });
    const signature = createHmac("sha256", "webhook-secret").update(body).digest("hex");
    expect(verifyMarriottFosseWebhook(body, `sha256=${signature}`, "webhook-secret")).toBe(true);
    expect(verifyMarriottFosseWebhook(body, "sha256=bad", "webhook-secret")).toBe(false);
    expect(parseMarriottFosseEvent(JSON.parse(body))).toMatchObject({ eventId: "evt-fosse-1", reservationId: "FOSSE-123" });
    expect(() => parseMarriottFosseEvent({ eventId: "evt-fosse-1" })).toThrow(/missing/);
  });
});
