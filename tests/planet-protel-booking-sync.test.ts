import { describe, expect, it, vi } from "vitest";
import {
  createPlanetProtelSyncAdapter,
  loadPlanetProtelSyncConfig,
  PlanetProtelBookingMapper,
} from "../services/hotel-suppliers/planet-protel";

const availability = {
  propertyCode: "PT-1",
  arrivalDate: "2026-10-10",
  departureDate: "2026-10-12",
  adults: 2,
};

describe("Planet Protel booking synchronization", () => {
  const env = {
    PMS_PLANET_PROTEL_BASE_URL: "https://api.protel.example/pms/",
    PMS_PLANET_PROTEL_API_CREDENTIAL: "api-credential",
    PMS_PLANET_PROTEL_AVAILABILITY_PATH: "properties/{propertyCode}/availability",
    PMS_PLANET_PROTEL_CREATE_RESERVATION_PATH: "reservations",
    PMS_PLANET_PROTEL_CANCEL_RESERVATION_PATH: "reservations/{reservationId}/cancel",
    PMS_PLANET_PROTEL_CURRENCY: "USD",
  };

  it("maps offers and validates configuration", () => {
    const mapper = new PlanetProtelBookingMapper({ currency: "USD", bookingSourceCode: "IRP" });
    const [offer] = mapper.availabilityResponse({
      rooms: [{ roomTypeCode: "KING", ratePlanCode: "BAR", total: 300, available: true }],
    }, availability);
    expect(offer).toMatchObject({
      roomTypeCode: "KING", ratePlanCode: "BAR", totalAmount: 300, available: true,
    });
    expect(createPlanetProtelSyncAdapter(loadPlanetProtelSyncConfig(env)).providerId)
      .toBe("planet-protel");
    expect(() => loadPlanetProtelSyncConfig({})).toThrow("PMS_PLANET_PROTEL_BASE_URL");
  });

  it("executes the complete booking lifecycle", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        rooms: [{ roomTypeCode: "KING", ratePlanCode: "BAR", total: 300, available: true }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        reservationId: "PT-R-10", status: "CONFIRMED",
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const adapter = createPlanetProtelSyncAdapter(loadPlanetProtelSyncConfig(env), fetcher);
    const [offer] = await adapter.availability(availability);
    const reservation = await adapter.createReservation({
      ...availability,
      offerId: offer!.offerId,
      externalReference: "IRP-1001",
      guest: { firstName: "Ada", lastName: "Lovelace" },
    });
    await expect(adapter.cancelReservation({
      propertyCode: "PT-1",
      reservationId: reservation.reservationId,
      externalReference: "IRP-1001",
    })).resolves.toMatchObject({ status: "CANCELED" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
