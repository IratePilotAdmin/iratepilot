import { describe, expect, it, vi } from "vitest";
import { ClockPmsBookingMapper, createClockPmsSyncAdapter, loadClockPmsSyncConfig } from "../services/hotel-suppliers/clock-pms-plus";

const availability = { propertyCode: "CLK-1", arrivalDate: "2026-10-10", departureDate: "2026-10-12", adults: 2 };
const signer = vi.fn(async () => 'Digest username="api", response="signed"');
describe("Clock PMS+ booking synchronization", () => {
  const env = { PMS_CLOCK_BASE_URL: "https://api.clock.example/v1/", PMS_CLOCK_API_USER: "api", PMS_CLOCK_API_KEY: "secret",
    PMS_CLOCK_AVAILABILITY_PATH: "properties/{propertyCode}/availability", PMS_CLOCK_CREATE_RESERVATION_PATH: "bookings",
    PMS_CLOCK_CANCEL_RESERVATION_PATH: "bookings/{bookingId}/cancel", PMS_CLOCK_CURRENCY: "EUR" };
  it("maps offers and requires server-side Digest signing", () => {
    const mapper = new ClockPmsBookingMapper({ currency: "EUR" });
    const [offer] = mapper.availabilityResponse({ rooms: [{ roomTypeCode: "DBL", ratePlanCode: "BAR", total: 320, available: true }] }, availability);
    expect(offer).toMatchObject({ roomTypeCode: "DBL", totalAmount: 320, available: true });
    expect(createClockPmsSyncAdapter(loadClockPmsSyncConfig(env, signer)).providerId).toBe("clock-pms-plus");
    expect(() => loadClockPmsSyncConfig({}, signer)).toThrow("PMS_CLOCK_BASE_URL");
  });
  it("executes the complete lifecycle using Digest authorization", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ rooms: [{ roomTypeCode: "DBL", ratePlanCode: "BAR", total: 320, available: true }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ bookingId: "B-11", status: "CONFIRMED" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const adapter = createClockPmsSyncAdapter(loadClockPmsSyncConfig(env, signer), fetcher);
    const [offer] = await adapter.availability(availability);
    const reservation = await adapter.createReservation({ ...availability, offerId: offer!.offerId, externalReference: "IRP-1101",
      guest: { firstName: "Ada", lastName: "Lovelace" } });
    await expect(adapter.cancelReservation({ propertyCode: "CLK-1", reservationId: reservation.reservationId, externalReference: "IRP-1101" }))
      .resolves.toMatchObject({ status: "CANCELED" });
    expect(fetcher).toHaveBeenCalledTimes(3); expect(signer).toHaveBeenCalled();
  });
});
