import { describe, expect, it, vi } from "vitest";
import { CloudbedsAdapter } from "../services/hotel-suppliers/cloudbeds";
import type { CloudbedsMapper, CloudbedsTransport } from "../services/hotel-suppliers/cloudbeds";

function setup() {
  const transport: CloudbedsTransport = { execute: vi.fn(async (request) => ({ request })) };
  const mapper: CloudbedsMapper = {
    availabilityPayload: vi.fn((input) => ({ from: input.arrivalDate, to: input.departureDate })),
    availabilityResponse: vi.fn((_payload, input) => [{
      offerId: "offer-1", propertyCode: input.propertyCode, roomTypeCode: "KING",
      ratePlanCode: "BAR", currency: "USD", totalAmount: 250, available: true, raw: {},
    }]),
    createReservationPayload: vi.fn((input) => ({ offerId: input.offerId })),
    createReservationResponse: vi.fn((_payload, input) => ({
      propertyCode: input.propertyCode, reservationId: "reservation-1",
      confirmationNumber: "CB-1", externalReference: input.externalReference,
      status: "confirmed", raw: {},
    })),
    cancelReservationPayload: vi.fn((input) => ({ reservationId: input.reservationId })),
    cancelReservationResponse: vi.fn((_payload, input) => ({
      propertyCode: input.propertyCode, reservationId: input.reservationId,
      cancellationNumber: "CB-CANCEL-1", status: "cancelled", raw: {},
    })),
  };
  return { adapter: new CloudbedsAdapter(transport, mapper), transport };
}

describe("CloudbedsAdapter", () => {
  it("maps availability through the credential-free transport boundary", async () => {
    const { adapter, transport } = setup();
    const offers = await adapter.availability({
      propertyCode: "hotel-1", arrivalDate: "2026-10-01",
      departureDate: "2026-10-03", adults: 2,
    });
    expect(offers[0]?.offerId).toBe("offer-1");
    expect(transport.execute).toHaveBeenCalledWith(expect.objectContaining({
      propertyCode: "hotel-1", operation: "availability",
      payload: { from: "2026-10-01", to: "2026-10-03" },
    }));
  });

  it("uses the external booking reference for reservation idempotency", async () => {
    const { adapter, transport } = setup();
    await adapter.createReservation({
      propertyCode: "hotel-1", externalReference: "IRP-200", offerId: "offer-1",
      arrivalDate: "2026-10-01", departureDate: "2026-10-03", adults: 2,
      guest: { firstName: "Test", lastName: "Guest" },
    });
    expect(transport.execute).toHaveBeenCalledWith(expect.objectContaining({
      operation: "create_reservation", requestId: "IRP-200",
    }));
  });

  it("separates cancellation idempotency from reservation creation", async () => {
    const { adapter, transport } = setup();
    const result = await adapter.cancelReservation({
      propertyCode: "hotel-1", reservationId: "reservation-1",
      externalReference: "IRP-200", reason: "guest request",
    });
    expect(result.status).toBe("cancelled");
    expect(transport.execute).toHaveBeenCalledWith(expect.objectContaining({
      operation: "cancel_reservation", requestId: "cancel:IRP-200",
    }));
  });
});
