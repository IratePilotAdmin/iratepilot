import { describe, expect, it, vi } from "vitest";
import { createGuestlineSyncAdapter, GuestlineBookingMapper, loadGuestlineSyncConfig } from "../services/hotel-suppliers/guestline";

const availability = { propertyCode: "GST-1", arrivalDate: "2026-10-10", departureDate: "2026-10-12", adults: 2 };
const mapper = new GuestlineBookingMapper({ currency: "GBP", bookingSourceCode: "IRP" });

describe("GuestlineBookingMapper", () => {
  it("normalizes availability and maps the booking lifecycle", () => {
    const [offer] = mapper.availabilityResponse({ rooms: [{ id: "O-1", roomTypeCode: "DBL", ratePlanCode: "BAR",
      currencyCode: "GBP", total: 450, availableRooms: 1 }] }, availability);
    expect(offer).toMatchObject({ roomTypeCode: "DBL", ratePlanCode: "BAR", totalAmount: 450, available: true });
    const request = { ...availability, offerId: offer!.offerId, externalReference: "IRP-901",
      guest: { firstName: "Ada", lastName: "Lovelace" } };
    expect(mapper.createReservationPayload(request)).toMatchObject({ roomTypeCode: "DBL", ratePlanCode: "BAR", bookingSourceCode: "IRP" });
    expect(mapper.createReservationResponse({ reservation: { id: "R-9", confirmationNumber: "C-9" } }, request))
      .toMatchObject({ reservationId: "R-9", confirmationNumber: "C-9", status: "CONFIRMED" });
    const cancel = { propertyCode: "GST-1", reservationId: "R-9", externalReference: "IRP-901" };
    expect(mapper.cancelReservationResponse({ success: true, cancellationCode: "X-9" }, cancel))
      .toMatchObject({ status: "CANCELED", cancellationNumber: "X-9" });
    expect(() => mapper.cancelReservationResponse({ success: false }, cancel)).toThrow("did not confirm");
  });
});

describe("Guestline synchronization", () => {
  const env = { PMS_GUESTLINE_BASE_URL: "https://partner-api.guestline.example/v1/", PMS_GUESTLINE_ACCESS_TOKEN: "token",
    PMS_GUESTLINE_AVAILABILITY_PATH: "properties/{propertyCode}/availability",
    PMS_GUESTLINE_CREATE_RESERVATION_PATH: "reservations",
    PMS_GUESTLINE_CANCEL_RESERVATION_PATH: "reservations/{reservationId}/cancel", PMS_GUESTLINE_CURRENCY: "GBP" };
  it("loads configuration and rejects incomplete setup", () => {
    expect(createGuestlineSyncAdapter(loadGuestlineSyncConfig(env)).providerId).toBe("guestline");
    expect(() => loadGuestlineSyncConfig({})).toThrow("PMS_GUESTLINE_BASE_URL");
    expect(() => loadGuestlineSyncConfig({ ...env, PMS_GUESTLINE_CURRENCY: undefined })).toThrow("PMS_GUESTLINE_CURRENCY");
  });
  it("executes availability, creation, and cancellation", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ rooms: [{ roomTypeCode: "DBL", ratePlanCode: "BAR", total: 450, available: true }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "R-9", status: "CONFIRMED" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const adapter = createGuestlineSyncAdapter(loadGuestlineSyncConfig(env), fetcher);
    const [offer] = await adapter.availability(availability);
    const reservation = await adapter.createReservation({ ...availability, offerId: offer!.offerId, externalReference: "IRP-901",
      guest: { firstName: "Ada", lastName: "Lovelace" } });
    await expect(adapter.cancelReservation({ propertyCode: "GST-1", reservationId: reservation.reservationId, externalReference: "IRP-901" }))
      .resolves.toMatchObject({ status: "CANCELED" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
