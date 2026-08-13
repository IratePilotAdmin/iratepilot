import { describe, expect, it, vi } from "vitest";
import { MarriottPmsAdapter } from "../services/hotel-suppliers/marriott/adapter";
import type { MarriottPmsMapper, MarriottPmsProvider, MarriottPmsTransport } from "../services/hotel-suppliers/marriott/contracts";

const mapper: MarriottPmsMapper = {
  availabilityPayload: (input) => ({ stay: input }),
  availabilityResponse: (payload, input) => [{
    offerId: "offer-1", propertyCode: input.propertyCode, roomTypeCode: "KING",
    ratePlanCode: "BAR", currency: "USD", totalAmount: 320, available: true, raw: payload,
  }],
  createReservationPayload: (input) => ({ reservation: input }),
  createReservationResponse: (payload, input) => ({
    propertyCode: input.propertyCode, reservationId: "reservation-1",
    confirmationNumber: "MARRIOTT-123", externalReference: input.externalReference,
    status: "CONFIRMED", raw: payload,
  }),
  cancelReservationPayload: (input) => ({ cancellation: input }),
  cancelReservationResponse: (payload, input) => ({
    propertyCode: input.propertyCode, reservationId: input.reservationId,
    cancellationNumber: "CANCEL-123", status: "CANCELLED", raw: payload,
  }),
};

function setup(provider: MarriottPmsProvider) {
  const execute = vi.fn().mockResolvedValue({ upstream: true });
  const transport: MarriottPmsTransport = { execute };
  return { adapter: new MarriottPmsAdapter(provider, transport, mapper), execute };
}

describe("MarriottPmsAdapter", () => {
  it.each(["marriott-fosse", "marriott-fs-pms"] as const)("normalizes %s availability", async (provider) => {
    const { adapter, execute } = setup(provider);
    const offers = await adapter.availability({
      propertyCode: "MSYDT", arrivalDate: "2026-09-10", departureDate: "2026-09-12", adults: 2,
    });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      provider, propertyCode: "MSYDT", operation: "availability",
    }));
    expect(offers[0]).toMatchObject({ offerId: "offer-1", totalAmount: 320 });
  });

  it("uses the iRatePilot reference for safe booking retries", async () => {
    const { adapter, execute } = setup("marriott-fosse");
    const reservation = await adapter.createReservation({
      propertyCode: "MSYDT", arrivalDate: "2026-09-10", departureDate: "2026-09-12",
      adults: 2, offerId: "offer-1", externalReference: "IRP-BOOKING-1",
      guest: { firstName: "Test", lastName: "Traveler" },
    });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ requestId: "IRP-BOOKING-1" }));
    expect(reservation.confirmationNumber).toBe("MARRIOTT-123");
  });

  it("separates cancellation retry identifiers", async () => {
    const { adapter, execute } = setup("marriott-fs-pms");
    await adapter.cancelReservation({
      propertyCode: "MSYDT", reservationId: "reservation-1", externalReference: "IRP-BOOKING-1",
    });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      operation: "cancel_reservation", requestId: "cancel:IRP-BOOKING-1",
    }));
  });
});
