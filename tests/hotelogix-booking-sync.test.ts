import { describe, expect, it, vi } from "vitest";
import {
  createHotelogixSyncAdapter,
  HotelogixBookingMapper,
  loadHotelogixSyncConfig,
} from "../services/hotel-suppliers/hotelogix";

const availability = {
  propertyCode: "HX-1",
  arrivalDate: "2026-10-10",
  departureDate: "2026-10-12",
  adults: 2,
};

describe("Hotelogix booking synchronization", () => {
  const env = {
    PMS_HOTELOGIX_BASE_URL: "https://api.hotelogix.example/v1/",
    PMS_HOTELOGIX_API_KEY: "api-key",
    PMS_HOTELOGIX_AVAILABILITY_PATH: "properties/{propertyCode}/availability",
    PMS_HOTELOGIX_CREATE_RESERVATION_PATH: "reservations",
    PMS_HOTELOGIX_CANCEL_RESERVATION_PATH: "reservations/{reservationId}/cancel",
    PMS_HOTELOGIX_CURRENCY: "USD",
  };

  it("maps offers and validates configuration", () => {
    const mapper = new HotelogixBookingMapper({ currency: "USD", bookingSourceCode: "IRP" });
    const [offer] = mapper.availabilityResponse({
      rooms: [{ roomTypeCode: "KING", ratePlanCode: "BAR", total: 300, available: true }],
    }, availability);
    expect(offer).toMatchObject({
      roomTypeCode: "KING", ratePlanCode: "BAR", totalAmount: 300, available: true,
    });
    expect(createHotelogixSyncAdapter(loadHotelogixSyncConfig(env)).providerId).toBe("hotelogix");
    expect(() => loadHotelogixSyncConfig({})).toThrow("PMS_HOTELOGIX_BASE_URL");
  });

  it("executes the complete booking lifecycle", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        rooms: [{ roomTypeCode: "KING", ratePlanCode: "BAR", total: 300, available: true }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        reservationId: "HX-R-10", status: "CONFIRMED",
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const adapter = createHotelogixSyncAdapter(loadHotelogixSyncConfig(env), fetcher);
    const [offer] = await adapter.availability(availability);
    const reservation = await adapter.createReservation({
      ...availability,
      offerId: offer!.offerId,
      externalReference: "IRP-1001",
      guest: { firstName: "Ada", lastName: "Lovelace" },
    });
    await expect(adapter.cancelReservation({
      propertyCode: "HX-1",
      reservationId: reservation.reservationId,
      externalReference: "IRP-1001",
    })).resolves.toMatchObject({ status: "CANCELED" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
