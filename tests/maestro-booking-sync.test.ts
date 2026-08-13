import { describe, expect, it, vi } from "vitest";
import {
  createMaestroSyncAdapter,
  loadMaestroSyncConfig,
  MaestroBookingMapper,
} from "../services/hotel-suppliers/maestro";

const mapper = new MaestroBookingMapper({ currency: "USD", bookingSourceCode: "IRP" });
const availability = { propertyCode: "MST-1", arrivalDate: "2026-09-10", departureDate: "2026-09-12", adults: 2 };

describe("MaestroBookingMapper", () => {
  it("normalizes partner availability while preserving the raw offer", () => {
    expect(mapper.availabilityPayload(availability)).toEqual({
      arrivalDate: "2026-09-10", departureDate: "2026-09-12", adults: 2,
      children: 0, rooms: 1, currency: "USD",
    });
    const offers = mapper.availabilityResponse({ offers: [{
      id: "offer-1", roomTypeCode: "KING", ratePlanCode: "BAR", currencyCode: "USD",
      total: 375, availableRooms: 2,
    }] }, availability);
    expect(offers[0]).toMatchObject({ roomTypeCode: "KING", ratePlanCode: "BAR", totalAmount: 375, available: true });
  });

  it("builds a reservation request from the signed offer identifier", () => {
    const offer = mapper.availabilityResponse({ results: [{
      offerToken: "vendor-token", roomCode: "KING", rateCode: "BAR", amount: 375, available: true,
    }] }, availability)[0]!;
    expect(mapper.createReservationPayload({
      ...availability, offerId: offer.offerId, externalReference: "IRP-700",
      guest: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" },
    })).toMatchObject({
      roomTypeCode: "KING", ratePlanCode: "BAR", offerToken: "vendor-token",
      externalReference: "IRP-700", bookingSourceCode: "IRP",
      guest: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" },
    });
  });

  it("normalizes creation and requires affirmative cancellation", () => {
    const input = { ...availability, offerId: "unused", externalReference: "IRP-700", guest: { firstName: "Ada", lastName: "Lovelace" } };
    expect(mapper.createReservationResponse({ reservation: { reservationId: "R-9", confirmationNumber: "C-9", status: "CONFIRMED" } }, input))
      .toMatchObject({ reservationId: "R-9", confirmationNumber: "C-9", status: "CONFIRMED" });
    const cancellation = { propertyCode: "MST-1", reservationId: "R-9", externalReference: "IRP-700" };
    expect(mapper.cancelReservationResponse({ success: true, cancellationCode: "X-9" }, cancellation))
      .toMatchObject({ status: "CANCELED", cancellationNumber: "X-9" });
    expect(() => mapper.cancelReservationResponse({ success: false }, cancellation)).toThrow("did not confirm");
  });
});

describe("Maestro synchronization configuration", () => {
  const env = {
    PMS_MAESTRO_BASE_URL: "https://partner-api.maestropms.example/v1/",
    PMS_MAESTRO_ACCESS_TOKEN: "token",
    PMS_MAESTRO_AVAILABILITY_PATH: "properties/{propertyCode}/availability",
    PMS_MAESTRO_CREATE_RESERVATION_PATH: "reservations",
    PMS_MAESTRO_CANCEL_RESERVATION_PATH: "reservations/{reservationId}/cancel",
    PMS_MAESTRO_CURRENCY: "USD",
  };

  it("loads partner-issued endpoints and creates the standard adapter", () => {
    const config = loadMaestroSyncConfig(env);
    expect(config.transport.endpoints).toMatchObject({
      availability: { method: "GET" }, create_reservation: { method: "POST" }, cancel_reservation: { method: "POST" },
    });
    expect(createMaestroSyncAdapter(config).providerId).toBe("maestro-pms");
  });

  it("fails closed when credentials, paths, or currency are absent", () => {
    expect(() => loadMaestroSyncConfig({})).toThrow("PMS_MAESTRO_BASE_URL");
    expect(() => loadMaestroSyncConfig({ ...env, PMS_MAESTRO_CURRENCY: undefined })).toThrow("PMS_MAESTRO_CURRENCY");
  });

  it("executes the complete standard flow through configured endpoints", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ offers: [{ roomTypeCode: "KING", ratePlanCode: "BAR", total: 375, available: true }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ reservationId: "R-9", status: "CONFIRMED" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "cancelled" })));
    const adapter = createMaestroSyncAdapter(loadMaestroSyncConfig(env), fetcher);
    const [offer] = await adapter.availability(availability);
    const reservation = await adapter.createReservation({ ...availability, offerId: offer!.offerId, externalReference: "IRP-700", guest: { firstName: "Ada", lastName: "Lovelace" } });
    await expect(adapter.cancelReservation({ propertyCode: "MST-1", reservationId: reservation.reservationId, externalReference: "IRP-700" }))
      .resolves.toMatchObject({ status: "CANCELED" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
