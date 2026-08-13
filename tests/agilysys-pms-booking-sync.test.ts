import { describe, expect, it, vi } from "vitest";
import {
  AgilysysPmsBookingMapper,
  createAgilysysPmsSyncAdapter,
  loadAgilysysPmsSyncConfig,
} from "../services/hotel-suppliers/agilysys-pms";

const availability = {
  propertyCode: "AG-1",
  arrivalDate: "2026-10-10",
  departureDate: "2026-10-12",
  adults: 2,
};

describe("Agilysys PMS booking synchronization", () => {
  const env = {
    PMS_AGILYSYS_BASE_URL: "https://api.agilysys.example/pms/",
    PMS_AGILYSYS_API_CREDENTIAL: "api-credential",
    PMS_AGILYSYS_AVAILABILITY_PATH: "properties/{propertyCode}/availability",
    PMS_AGILYSYS_CREATE_RESERVATION_PATH: "reservations",
    PMS_AGILYSYS_CANCEL_RESERVATION_PATH: "reservations/{reservationId}/cancel",
    PMS_AGILYSYS_CURRENCY: "USD",
  };

  it("maps offers and validates configuration", () => {
    const mapper = new AgilysysPmsBookingMapper({ currency: "USD", bookingSourceCode: "IRP" });
    const [offer] = mapper.availabilityResponse({
      rooms: [{ roomTypeCode: "KING", ratePlanCode: "BAR", total: 300, available: true }],
    }, availability);
    expect(offer).toMatchObject({
      roomTypeCode: "KING", ratePlanCode: "BAR", totalAmount: 300, available: true,
    });
    expect(createAgilysysPmsSyncAdapter(loadAgilysysPmsSyncConfig(env)).providerId)
      .toBe("agilysys-pms");
    expect(() => loadAgilysysPmsSyncConfig({})).toThrow("PMS_AGILYSYS_BASE_URL");
  });

  it("executes the complete booking lifecycle", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        rooms: [{ roomTypeCode: "KING", ratePlanCode: "BAR", total: 300, available: true }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        reservationId: "AG-R-10", status: "CONFIRMED",
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const adapter = createAgilysysPmsSyncAdapter(loadAgilysysPmsSyncConfig(env), fetcher);
    const [offer] = await adapter.availability(availability);
    const reservation = await adapter.createReservation({
      ...availability,
      offerId: offer!.offerId,
      externalReference: "IRP-1001",
      guest: { firstName: "Ada", lastName: "Lovelace" },
    });
    await expect(adapter.cancelReservation({
      propertyCode: "AG-1",
      reservationId: reservation.reservationId,
      externalReference: "IRP-1001",
    })).resolves.toMatchObject({ status: "CANCELED" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
