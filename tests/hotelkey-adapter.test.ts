import { describe, expect, it, vi } from "vitest";
import { HotelKeyAdapter } from "../services/hotel-suppliers/hotelkey/adapter";
import type { HotelKeyMapper, HotelKeyTransport } from "../services/hotel-suppliers/hotelkey/contracts";

const mapper: HotelKeyMapper = {
  availabilityPayload: (input) => ({ stay: input }),
  availabilityResponse: (raw, input) => [{
    offerId: "offer-1", propertyCode: input.propertyCode, roomTypeCode: "KING",
    ratePlanCode: "BAR", currency: "USD", totalAmount: 219, available: true, raw,
  }],
  createReservationPayload: (input) => ({ reservation: input }),
  createReservationResponse: (raw, input) => ({
    propertyCode: input.propertyCode, reservationId: "reservation-1",
    confirmationNumber: "HK-123", externalReference: input.externalReference,
    status: "confirmed", raw,
  }),
  cancelReservationPayload: (input) => ({ cancellation: input }),
  cancelReservationResponse: (raw, input) => ({
    propertyCode: input.propertyCode, reservationId: input.reservationId,
    cancellationNumber: "HK-CANCEL-1", status: "cancelled", raw,
  }),
};

function setup() {
  const execute = vi.fn(async () => ({ ok: true }));
  const transport: HotelKeyTransport = { execute };
  return { adapter: new HotelKeyAdapter(transport, mapper), execute };
}

describe("HotelKeyAdapter", () => {
  it("keeps availability scoped to the property", async () => {
    const { adapter, execute } = setup();
    const offers = await adapter.availability({
      propertyCode: "HK100", arrivalDate: "2026-09-10", departureDate: "2026-09-12", adults: 2,
    });
    expect(offers[0]?.propertyCode).toBe("HK100");
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      propertyCode: "HK100", operation: "availability",
    }));
  });

  it("uses the external reference as the booking retry identifier", async () => {
    const { adapter, execute } = setup();
    const reservation = await adapter.createReservation({
      propertyCode: "HK100", arrivalDate: "2026-09-10", departureDate: "2026-09-12",
      adults: 2, externalReference: "IRP-123", offerId: "offer-1",
      guest: { firstName: "Hiren", lastName: "Patel" },
    });
    expect(reservation.confirmationNumber).toBe("HK-123");
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ requestId: "IRP-123" }));
  });

  it("separates cancellation retries from booking retries", async () => {
    const { adapter, execute } = setup();
    await adapter.cancelReservation({
      propertyCode: "HK100", reservationId: "reservation-1", externalReference: "IRP-123",
    });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      operation: "cancel_reservation", requestId: "cancel:IRP-123",
    }));
  });
});
