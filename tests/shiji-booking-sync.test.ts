import { describe, expect, it, vi } from "vitest";
import { createShijiSyncAdapter, loadShijiSyncConfig, ShijiBookingMapper } from "../services/hotel-suppliers/shiji";

const mapper = new ShijiBookingMapper({ currency: "USD", bookingSourceCode: "IRP" });
const availability = { propertyCode: "SHJ-1", arrivalDate: "2026-09-10", departureDate: "2026-09-12", adults: 2 };

describe("ShijiBookingMapper", () => {
  it("normalizes availability and encodes the partner offer", () => {
    expect(mapper.availabilityPayload(availability)).toEqual({ arrivalDate: "2026-09-10", departureDate: "2026-09-12",
      adults: 2, children: 0, rooms: 1, currency: "USD" });
    const offers = mapper.availabilityResponse({ items: [{ id: "O-1", roomTypeId: "KING", ratePlanId: "BAR",
      currency: "USD", totalAmount: 410, availableRooms: 2 }] }, availability);
    expect(offers[0]).toMatchObject({ roomTypeCode: "KING", ratePlanCode: "BAR", totalAmount: 410, available: true });
  });
  it("maps reservation creation and cancellation responses", () => {
    const offer = mapper.availabilityResponse({ offers: [{ offerToken: "token", roomCode: "KING", rateCode: "BAR",
      amount: 410, available: true }] }, availability)[0]!;
    const request = { ...availability, offerId: offer.offerId, externalReference: "IRP-801",
      guest: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" } };
    expect(mapper.createReservationPayload(request)).toMatchObject({ roomTypeCode: "KING", ratePlanCode: "BAR",
      offerToken: "token", bookingSourceCode: "IRP", externalReference: "IRP-801" });
    expect(mapper.createReservationResponse({ reservation: { id: "R-8", confirmationCode: "C-8" } }, request))
      .toMatchObject({ reservationId: "R-8", confirmationNumber: "C-8", status: "CONFIRMED" });
    const cancellation = { propertyCode: "SHJ-1", reservationId: "R-8", externalReference: "IRP-801" };
    expect(mapper.cancelReservationResponse({ cancelled: true, cancellationNumber: "X-8" }, cancellation))
      .toMatchObject({ status: "CANCELED", cancellationNumber: "X-8" });
    expect(() => mapper.cancelReservationResponse({ cancelled: false }, cancellation)).toThrow("did not confirm");
  });
});

describe("Shiji synchronization configuration", () => {
  const env = { PMS_SHIJI_BASE_URL: "https://partner-api.shijigroup.example/v1/", PMS_SHIJI_ACCESS_TOKEN: "token",
    PMS_SHIJI_AVAILABILITY_PATH: "properties/{propertyCode}/availability",
    PMS_SHIJI_CREATE_RESERVATION_PATH: "reservations", PMS_SHIJI_CANCEL_RESERVATION_PATH: "reservations/{reservationId}/cancel",
    PMS_SHIJI_CURRENCY: "USD" };
  it("loads partner endpoints and fails closed for incomplete setup", () => {
    const config = loadShijiSyncConfig(env);
    expect(config.transport.endpoints).toMatchObject({ availability: { method: "GET" },
      create_reservation: { method: "POST" }, cancel_reservation: { method: "POST" } });
    expect(createShijiSyncAdapter(config).providerId).toBe("shiji-pms");
    expect(() => loadShijiSyncConfig({})).toThrow("PMS_SHIJI_BASE_URL");
    expect(() => loadShijiSyncConfig({ ...env, PMS_SHIJI_CURRENCY: undefined })).toThrow("PMS_SHIJI_CURRENCY");
  });
  it("executes availability, creation, and cancellation through the standard adapter", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ roomTypeId: "KING", ratePlanId: "BAR", totalAmount: 410, available: true }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ reservationId: "R-8", status: "CONFIRMED" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const adapter = createShijiSyncAdapter(loadShijiSyncConfig(env), fetcher);
    const [offer] = await adapter.availability(availability);
    const reservation = await adapter.createReservation({ ...availability, offerId: offer!.offerId, externalReference: "IRP-801",
      guest: { firstName: "Ada", lastName: "Lovelace" } });
    await expect(adapter.cancelReservation({ propertyCode: "SHJ-1", reservationId: reservation.reservationId,
      externalReference: "IRP-801" }))
      .resolves.toMatchObject({ status: "CANCELED" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
