import { describe, expect, it, vi } from "vitest";
import { createEzeeAbsoluteSyncAdapter, EzeeAbsoluteBookingMapper, loadEzeeAbsoluteSyncConfig } from "../services/hotel-suppliers/ezee-absolute";

const availability = { propertyCode: "EZ-1", arrivalDate: "2026-10-10", departureDate: "2026-10-12", adults: 2 };
describe("eZee Absolute booking synchronization", () => {
  const env = { PMS_EZEE_ABSOLUTE_BASE_URL: "https://api.ezee.example/v1/", PMS_EZEE_ABSOLUTE_ACCESS_TOKEN: "token",
    PMS_EZEE_ABSOLUTE_AVAILABILITY_PATH: "properties/{propertyCode}/availability",
    PMS_EZEE_ABSOLUTE_CREATE_RESERVATION_PATH: "reservations",
    PMS_EZEE_ABSOLUTE_CANCEL_RESERVATION_PATH: "reservations/{reservationId}/cancel", PMS_EZEE_ABSOLUTE_CURRENCY: "USD" };
  it("maps offers and validates configuration", () => {
    const mapper = new EzeeAbsoluteBookingMapper({ currency: "USD", bookingSourceCode: "IRP" });
    const [offer] = mapper.availabilityResponse({ rooms: [{ roomTypeCode: "KING", ratePlanCode: "BAR", total: 300, available: true }] }, availability);
    expect(offer).toMatchObject({ roomTypeCode: "KING", ratePlanCode: "BAR", totalAmount: 300, available: true });
    expect(createEzeeAbsoluteSyncAdapter(loadEzeeAbsoluteSyncConfig(env)).providerId).toBe("ezee-absolute");
    expect(() => loadEzeeAbsoluteSyncConfig({})).toThrow("PMS_EZEE_ABSOLUTE_BASE_URL");
  });
  it("executes the complete booking lifecycle", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ rooms: [{ roomTypeCode: "KING", ratePlanCode: "BAR", total: 300, available: true }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "R-10", status: "CONFIRMED" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const adapter = createEzeeAbsoluteSyncAdapter(loadEzeeAbsoluteSyncConfig(env), fetcher);
    const [offer] = await adapter.availability(availability);
    const reservation = await adapter.createReservation({ ...availability, offerId: offer!.offerId, externalReference: "IRP-1001",
      guest: { firstName: "Ada", lastName: "Lovelace" } });
    await expect(adapter.cancelReservation({ propertyCode: "EZ-1", reservationId: reservation.reservationId, externalReference: "IRP-1001" }))
      .resolves.toMatchObject({ status: "CANCELED" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
