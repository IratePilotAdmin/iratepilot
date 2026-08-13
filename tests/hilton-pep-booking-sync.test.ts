import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createHiltonPepSyncAdapter,
  loadHiltonPepSyncConfig,
  parseHiltonPepEvent,
  verifyHiltonPepWebhook,
} from "../services/hotel-suppliers/hilton";

const config = {
  baseUrl: "https://pep-sandbox.example",
  apiCredential: "hilton-issued-token",
  endpoints: {
    availability: { method: "GET" as const, path: "/hotels/{propertyCode}/offers" },
    create_reservation: { method: "POST" as const, path: "/hotels/{propertyCode}/reservations" },
    get_reservation: { method: "GET" as const, path: "/hotels/{propertyCode}/reservations/{reservationId}" },
    modify_reservation: { method: "PUT" as const, path: "/hotels/{propertyCode}/reservations/{reservationId}" },
    cancel_reservation: { method: "POST" as const, path: "/hotels/{propertyCode}/reservations/{reservationId}/cancel" },
  },
};

const booking = {
  propertyCode: "MSYHH",
  arrivalDate: "2026-09-10",
  departureDate: "2026-09-12",
  adults: 2,
  offerId: "KING-BAR",
  externalReference: "IRP-BOOKING-1",
  guest: { firstName: "Test", lastName: "Traveler", email: "traveler@example.com" },
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("Hilton PEP booking synchronization", () => {
  it("loads a vendor-issued endpoint configuration without logging credentials", () => {
    const loaded = loadHiltonPepSyncConfig({
      PMS_HILTON_PEP_BASE_URL: config.baseUrl,
      PMS_HILTON_PEP_API_CREDENTIAL: config.apiCredential,
      PMS_HILTON_PEP_AVAILABILITY_PATH: config.endpoints.availability.path,
      PMS_HILTON_PEP_CREATE_PATH: config.endpoints.create_reservation.path,
      PMS_HILTON_PEP_GET_PATH: config.endpoints.get_reservation.path,
      PMS_HILTON_PEP_MODIFY_PATH: config.endpoints.modify_reservation.path,
      PMS_HILTON_PEP_CANCEL_PATH: config.endpoints.cancel_reservation.path,
    });
    expect(loaded).toMatchObject({ baseUrl: config.baseUrl, timeoutMs: 15_000 });
    expect(() => loadHiltonPepSyncConfig({})).toThrow("PMS_HILTON_PEP_BASE_URL");
  });

  it("shops, creates, retrieves, modifies, and cancels with stable request IDs", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ offers: [{ offerId: "KING-BAR", roomTypeCode: "KING", ratePlanCode: "BAR", totalAmount: 250, currency: "USD" }] }))
      .mockResolvedValueOnce(response({ reservationId: "PEP-123", confirmationNumber: "HH-123", status: "CONFIRMED" }))
      .mockResolvedValueOnce(response({ reservationId: "PEP-123", confirmationNumber: "HH-123", status: "CONFIRMED", externalReference: "IRP-BOOKING-1" }))
      .mockResolvedValueOnce(response({ reservationId: "PEP-123", confirmationNumber: "HH-123", status: "MODIFIED" }))
      .mockResolvedValueOnce(response({ reservationId: "PEP-123", cancellationNumber: "CXL-123", status: "CANCELLED" }));
    const adapter = createHiltonPepSyncAdapter(config, fetcher);

    await expect(adapter.availability({ propertyCode: "MSYHH", arrivalDate: "2026-09-10", departureDate: "2026-09-12", adults: 2 }))
      .resolves.toMatchObject([{ offerId: "KING-BAR", totalAmount: 250 }]);
    await expect(adapter.createReservation(booking)).resolves.toMatchObject({ reservationId: "PEP-123", externalReference: "IRP-BOOKING-1" });
    await expect(adapter.getReservation({ propertyCode: "MSYHH", reservationId: "PEP-123", externalReference: "IRP-BOOKING-1" }))
      .resolves.toMatchObject({ status: "CONFIRMED" });
    await expect(adapter.modifyReservation({ ...booking, reservationId: "PEP-123" })).resolves.toMatchObject({ status: "MODIFIED" });
    await expect(adapter.cancelReservation({ propertyCode: "MSYHH", reservationId: "PEP-123", externalReference: "IRP-BOOKING-1" }))
      .resolves.toMatchObject({ cancellationNumber: "CXL-123" });

    expect(fetcher.mock.calls.map(([url]) => String(url).split("?")[0])).toEqual([
      "https://pep-sandbox.example/hotels/MSYHH/offers",
      "https://pep-sandbox.example/hotels/MSYHH/reservations",
      "https://pep-sandbox.example/hotels/MSYHH/reservations/PEP-123",
      "https://pep-sandbox.example/hotels/MSYHH/reservations/PEP-123",
      "https://pep-sandbox.example/hotels/MSYHH/reservations/PEP-123/cancel",
    ]);
    expect(new Headers(fetcher.mock.calls[1][1].headers).get("x-iratepilot-request-id")).toBe("IRP-BOOKING-1");
    expect(new Headers(fetcher.mock.calls[3][1].headers).get("x-iratepilot-request-id")).toBe("modify:IRP-BOOKING-1");
    expect(new Headers(fetcher.mock.calls[4][1].headers).get("x-iratepilot-request-id")).toBe("cancel:IRP-BOOKING-1");
  });

  it("verifies signed webhooks and rejects malformed events", () => {
    const body = JSON.stringify({ eventId: "evt-1", eventType: "RESERVATION_UPDATED", propertyCode: "MSYHH", reservationId: "PEP-123" });
    const signature = createHmac("sha256", "webhook-secret").update(body).digest("hex");
    expect(verifyHiltonPepWebhook(body, `sha256=${signature}`, "webhook-secret")).toBe(true);
    expect(verifyHiltonPepWebhook(body, `sha256=${"0".repeat(64)}`, "webhook-secret")).toBe(false);
    expect(parseHiltonPepEvent(JSON.parse(body))).toMatchObject({ eventId: "evt-1", reservationId: "PEP-123" });
    expect(() => parseHiltonPepEvent({ eventId: "evt-1" })).toThrow(/missing/);
  });
});
