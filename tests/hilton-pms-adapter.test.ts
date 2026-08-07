import { describe, expect, it, vi } from "vitest";
import { HiltonPmsAdapter } from "../services/hotel-suppliers/hilton/adapter";
import type { HiltonPmsMapper, HiltonPmsTransport } from "../services/hotel-suppliers/hilton/contracts";

const mapper: HiltonPmsMapper = {
  availabilityPayload: (input) => ({ stay: input }),
  availabilityResponse: (payload, input) => [{
    offerId: "offer-1",
    propertyCode: input.propertyCode,
    roomTypeCode: "KING",
    ratePlanCode: "BAR",
    currency: "USD",
    totalAmount: 300,
    available: true,
    raw: payload,
  }],
  createReservationPayload: (input) => ({ reservation: input }),
  createReservationResponse: (payload, input) => ({
    propertyCode: input.propertyCode,
    reservationId: "reservation-1",
    confirmationNumber: "HILTON-123",
    externalReference: input.externalReference,
    status: "CONFIRMED",
    raw: payload,
  }),
  cancelReservationPayload: (input) => ({ cancellation: input }),
  cancelReservationResponse: (payload, input) => ({
    propertyCode: input.propertyCode,
    reservationId: input.reservationId,
    cancellationNumber: "CANCEL-123",
    status: "CANCELLED",
    raw: payload,
  }),
};

function setup(provider: "hilton-pep" | "hilton-onq" = "hilton-pep") {
  const execute = vi.fn().mockResolvedValue({ upstream: true });
  const transport: HiltonPmsTransport = { execute };
  return { adapter: new HiltonPmsAdapter(provider, transport, mapper), execute };
}

describe("HiltonPmsAdapter", () => {
  it.each(["hilton-pep", "hilton-onq"] as const)("keeps %s behind the same normalized contract", async (provider) => {
    const { adapter, execute } = setup(provider);
    const offers = await adapter.availability({
      propertyCode: "MSYHH",
      arrivalDate: "2026-09-10",
      departureDate: "2026-09-12",
      adults: 2,
    });

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      provider,
      propertyCode: "MSYHH",
      operation: "availability",
    }));
    expect(offers[0]).toMatchObject({ offerId: "offer-1", totalAmount: 300 });
  });

  it("uses the iRatePilot reference for safe reservation retries", async () => {
    const { adapter, execute } = setup();
    const reservation = await adapter.createReservation({
      propertyCode: "MSYHH",
      arrivalDate: "2026-09-10",
      departureDate: "2026-09-12",
      adults: 2,
      offerId: "offer-1",
      externalReference: "IRP-BOOKING-1",
      guest: { firstName: "Test", lastName: "Traveler" },
    });

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      operation: "create_reservation",
      requestId: "IRP-BOOKING-1",
    }));
    expect(reservation).toMatchObject({
      confirmationNumber: "HILTON-123",
      externalReference: "IRP-BOOKING-1",
    });
  });

  it("separates cancellation retries from reservation creation", async () => {
    const { adapter, execute } = setup("hilton-onq");
    const cancellation = await adapter.cancelReservation({
      propertyCode: "MSYHH",
      reservationId: "reservation-1",
      externalReference: "IRP-BOOKING-1",
      reason: "Guest request",
    });

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      provider: "hilton-onq",
      operation: "cancel_reservation",
      requestId: "cancel:IRP-BOOKING-1",
    }));
    expect(cancellation.status).toBe("CANCELLED");
  });
});
