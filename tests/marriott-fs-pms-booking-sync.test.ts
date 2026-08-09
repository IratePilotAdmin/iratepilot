import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createMarriottFsPmsSyncAdapter, loadMarriottFsPmsSyncConfig,
  parseMarriottFsPmsEvent, verifyMarriottFsPmsWebhook,
} from "../services/hotel-suppliers/marriott";

const config = {
  baseUrl: "https://fs-pms-sandbox.example",
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
  propertyCode: "NYCMQ", arrivalDate: "2026-09-10", departureDate: "2026-09-12", adults: 2,
  offerId: "KING-BAR", externalReference: "IRP-BOOKING-4",
  guest: { firstName: "Test", lastName: "Traveler", email: "traveler@example.com" },
};
function response(body: unknown) { return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }); }

describe("Marriott FS-PMS booking synchronization", () => {
  it("loads Marriott-issued endpoints and credentials", () => {
    const loaded = loadMarriottFsPmsSyncConfig({
      PMS_MARRIOTT_FS_PMS_BASE_URL: config.baseUrl,
      PMS_MARRIOTT_FS_PMS_API_CREDENTIAL: config.apiCredential,
      PMS_MARRIOTT_FS_PMS_AVAILABILITY_PATH: config.endpoints.availability.path,
      PMS_MARRIOTT_FS_PMS_CREATE_PATH: config.endpoints.create_reservation.path,
      PMS_MARRIOTT_FS_PMS_GET_PATH: config.endpoints.get_reservation.path,
      PMS_MARRIOTT_FS_PMS_MODIFY_PATH: config.endpoints.modify_reservation.path,
      PMS_MARRIOTT_FS_PMS_CANCEL_PATH: config.endpoints.cancel_reservation.path,
    });
    expect(loaded).toMatchObject({ baseUrl: config.baseUrl, timeoutMs: 15_000 });
    expect(() => loadMarriottFsPmsSyncConfig({})).toThrow("PMS_MARRIOTT_FS_PMS_BASE_URL");
  });

  it("shops, creates, retrieves, modifies, and cancels with stable correlation IDs", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ rates: [{ bookingCode: "KING-BAR", roomType: "KING", rateCode: "BAR", amountAfterTax: 280, currencyCode: "USD" }] }))
      .mockResolvedValueOnce(response({ reservationId: "FSPMS-123", confirmationNumber: "MAR-456", status: "CONFIRMED" }))
      .mockResolvedValueOnce(response({ reservationId: "FSPMS-123", confirmationNumber: "MAR-456", status: "CONFIRMED", externalReference: "IRP-BOOKING-4" }))
      .mockResolvedValueOnce(response({ reservationId: "FSPMS-123", confirmationNumber: "MAR-456", status: "MODIFIED" }))
      .mockResolvedValueOnce(response({ reservationId: "FSPMS-123", cancellationCode: "CXL-456", status: "CANCELLED" }));
    const adapter = createMarriottFsPmsSyncAdapter(config, fetcher);
    await expect(adapter.availability({ propertyCode: "NYCMQ", arrivalDate: "2026-09-10", departureDate: "2026-09-12", adults: 2 }))
      .resolves.toMatchObject([{ offerId: "KING-BAR", totalAmount: 280 }]);
    await expect(adapter.createReservation(booking)).resolves.toMatchObject({ reservationId: "FSPMS-123", externalReference: "IRP-BOOKING-4" });
    await expect(adapter.getReservation({ propertyCode: "NYCMQ", reservationId: "FSPMS-123", externalReference: "IRP-BOOKING-4" }))
      .resolves.toMatchObject({ status: "CONFIRMED" });
    await expect(adapter.modifyReservation({ ...booking, reservationId: "FSPMS-123" })).resolves.toMatchObject({ status: "MODIFIED" });
    await expect(adapter.cancelReservation({ propertyCode: "NYCMQ", reservationId: "FSPMS-123", externalReference: "IRP-BOOKING-4" }))
      .resolves.toMatchObject({ cancellationNumber: "CXL-456" });
    expect(fetcher.mock.calls.map(([url]) => String(url).split("?")[0])).toEqual([
      "https://fs-pms-sandbox.example/properties/NYCMQ/rates",
      "https://fs-pms-sandbox.example/properties/NYCMQ/reservations",
      "https://fs-pms-sandbox.example/properties/NYCMQ/reservations/FSPMS-123",
      "https://fs-pms-sandbox.example/properties/NYCMQ/reservations/FSPMS-123",
      "https://fs-pms-sandbox.example/properties/NYCMQ/reservations/FSPMS-123/cancel",
    ]);
    expect(new Headers(fetcher.mock.calls[3][1].headers).get("x-iratepilot-request-id")).toBe("modify:IRP-BOOKING-4");
  });

  it("verifies signed events and rejects incomplete payloads", () => {
    const body = JSON.stringify({ eventId: "evt-fspms-1", eventType: "RESERVATION_UPDATED", propertyCode: "NYCMQ", reservationId: "FSPMS-123" });
    const signature = createHmac("sha256", "webhook-secret").update(body).digest("hex");
    expect(verifyMarriottFsPmsWebhook(body, `sha256=${signature}`, "webhook-secret")).toBe(true);
    expect(verifyMarriottFsPmsWebhook(body, "sha256=bad", "webhook-secret")).toBe(false);
    expect(parseMarriottFsPmsEvent(JSON.parse(body))).toMatchObject({ eventId: "evt-fspms-1", reservationId: "FSPMS-123" });
    expect(() => parseMarriottFsPmsEvent({ eventId: "evt-fspms-1" })).toThrow(/missing/);
  });
});
