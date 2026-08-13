import { describe, expect, it, vi } from "vitest";
import { MewsAdapter } from "../services/hotel-suppliers/mews";
import type { MewsMapper, MewsTransport } from "../services/hotel-suppliers/mews";

function setup() {
  const transport: MewsTransport = { execute: vi.fn(async (request) => ({ request })) };
  const mapper: MewsMapper = {
    availabilityPayload: vi.fn((input) => ({ dates: [input.arrivalDate, input.departureDate] })),
    availabilityResponse: vi.fn((_payload, input) => [{
      offerId: "offer-1", propertyCode: input.propertyCode, roomTypeCode: "KING",
      ratePlanCode: "BAR", currency: "USD", totalAmount: 250, available: true, raw: {},
    }]),
    addCustomerPayload: vi.fn((input) => ({ email: input.guest.email })),
    addCustomerResponse: vi.fn(() => "customer-1"),
    createReservationPayload: vi.fn((input, customerId) => ({ offerId: input.offerId, customerId })),
    createReservationResponse: vi.fn((_payload, input) => ({
      propertyCode: input.propertyCode, reservationId: "reservation-1",
      confirmationNumber: "MEWS-1", externalReference: input.externalReference,
      status: "confirmed", raw: {},
    })),
    cancelReservationPayload: vi.fn((input) => ({ reservationId: input.reservationId })),
    cancelReservationResponse: vi.fn((_payload, input) => ({
      propertyCode: input.propertyCode, reservationId: input.reservationId,
      cancellationNumber: "CANCEL-1", status: "cancelled", raw: {},
    })),
  };
  return { adapter: new MewsAdapter(transport, mapper), mapper, transport };
}

describe("MewsAdapter", () => {
  it("maps and requests availability without exposing credentials", async () => {
    const { adapter, transport } = setup();
    const offers = await adapter.availability({
      propertyCode: "hotel-1", arrivalDate: "2026-09-01",
      departureDate: "2026-09-03", adults: 2,
    });
    expect(offers[0]?.offerId).toBe("offer-1");
    expect(transport.execute).toHaveBeenCalledWith(expect.objectContaining({
      propertyCode: "hotel-1", operation: "availability",
      payload: { dates: ["2026-09-01", "2026-09-03"] },
    }));
  });

  it("uses the booking reference as the idempotency request id", async () => {
    const { adapter, transport } = setup();
    await adapter.createReservation({
      propertyCode: "hotel-1", externalReference: "IRP-100", offerId: "offer-1",
      arrivalDate: "2026-09-01", departureDate: "2026-09-03", adults: 2,
      guest: { firstName: "Test", lastName: "Guest" },
    });
    expect(transport.execute).toHaveBeenCalledWith(expect.objectContaining({
      operation: "create_reservation", requestId: "IRP-100",
      payload: { offerId: "offer-1", customerId: "customer-1" },
    }));
    expect(transport.execute).toHaveBeenNthCalledWith(1, expect.objectContaining({
      operation: "add_customer", requestId: "customer:IRP-100",
    }));
  });

  it("uses a distinct idempotency request id for cancellation", async () => {
    const { adapter, transport } = setup();
    const result = await adapter.cancelReservation({
      propertyCode: "hotel-1", reservationId: "reservation-1",
      externalReference: "IRP-100", reason: "guest request",
    });
    expect(result.status).toBe("cancelled");
    expect(transport.execute).toHaveBeenCalledWith(expect.objectContaining({
      operation: "cancel_reservation", requestId: "cancel:IRP-100",
    }));
  });
});
