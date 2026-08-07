import { describe, expect, it, vi } from "vitest";
import { ApaleoAdapter } from "../services/hotel-suppliers/apaleo";
import type { ApaleoMapper, ApaleoTransport } from "../services/hotel-suppliers/apaleo";

function setup() {
  const transport: ApaleoTransport = { execute: vi.fn(async (request) => ({ request })) };
  const mapper: ApaleoMapper = {
    availabilityPayload: vi.fn((input) => ({ arrival: input.arrivalDate, departure: input.departureDate })),
    availabilityResponse: vi.fn((_payload, input) => [{
      offerId: "offer-1", propertyCode: input.propertyCode, roomTypeCode: "KING",
      ratePlanCode: "BAR", currency: "USD", totalAmount: 250, available: true, raw: {},
    }]),
    createReservationPayload: vi.fn((input) => ({ offerId: input.offerId })),
    createReservationResponse: vi.fn((_payload, input) => ({
      propertyCode: input.propertyCode, reservationId: "reservation-1",
      confirmationNumber: "APA-1", externalReference: input.externalReference,
      status: "confirmed", raw: {},
    })),
    cancelReservationPayload: vi.fn((input) => ({ reservationId: input.reservationId })),
    cancelReservationResponse: vi.fn((_payload, input) => ({
      propertyCode: input.propertyCode, reservationId: input.reservationId,
      cancellationNumber: "APA-CANCEL-1", status: "cancelled", raw: {},
    })),
  };
  return { adapter: new ApaleoAdapter(transport, mapper), transport };
}

describe("ApaleoAdapter", () => {
  it("maps availability through the OAuth transport boundary", async () => {
    const { adapter, transport } = setup();
    const offers = await adapter.availability({
      propertyCode: "hotel-1", arrivalDate: "2026-11-01", departureDate: "2026-11-03", adults: 2,
    });
    expect(offers[0]?.offerId).toBe("offer-1");
    expect(transport.execute).toHaveBeenCalledWith(expect.objectContaining({
      propertyCode: "hotel-1", operation: "availability",
      payload: { arrival: "2026-11-01", departure: "2026-11-03" },
    }));
  });

  it("uses the booking reference for reservation idempotency", async () => {
    const { adapter, transport } = setup();
    await adapter.createReservation({
      propertyCode: "hotel-1", externalReference: "IRP-300", offerId: "offer-1",
      arrivalDate: "2026-11-01", departureDate: "2026-11-03", adults: 2,
      guest: { firstName: "Test", lastName: "Guest" },
    });
    expect(transport.execute).toHaveBeenCalledWith(expect.objectContaining({
      operation: "create_reservation", requestId: "IRP-300",
    }));
  });

  it("uses a separate cancellation idempotency identifier", async () => {
    const { adapter, transport } = setup();
    const result = await adapter.cancelReservation({
      propertyCode: "hotel-1", reservationId: "reservation-1", externalReference: "IRP-300",
    });
    expect(result.status).toBe("cancelled");
    expect(transport.execute).toHaveBeenCalledWith(expect.objectContaining({
      operation: "cancel_reservation", requestId: "cancel:IRP-300",
    }));
  });
});
