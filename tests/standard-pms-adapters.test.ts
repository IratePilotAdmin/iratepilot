import { describe, expect, it, vi } from "vitest";
import {
  StandardPmsAdapter,
  standardPmsProviderIds,
} from "../services/hotel-suppliers/standard";
import type {
  StandardPmsMapper,
  StandardPmsTransport,
} from "../services/hotel-suppliers/standard";

function setup(providerId: (typeof standardPmsProviderIds)[number]) {
  const transport: StandardPmsTransport = {
    execute: vi.fn(async (request) => ({ request })),
  };
  const mapper: StandardPmsMapper = {
    availabilityPayload: vi.fn((input) => ({ stay: [input.arrivalDate, input.departureDate] })),
    availabilityResponse: vi.fn((_payload, input) => [{
      offerId: "offer-1",
      propertyCode: input.propertyCode,
      roomTypeCode: "KING",
      ratePlanCode: "BAR",
      currency: "USD",
      totalAmount: 250,
      available: true,
      raw: {},
    }]),
    createReservationPayload: vi.fn((input) => ({ offerId: input.offerId })),
    createReservationResponse: vi.fn((_payload, input) => ({
      propertyCode: input.propertyCode,
      reservationId: "reservation-1",
      confirmationNumber: "PMS-1",
      externalReference: input.externalReference,
      status: "confirmed",
      raw: {},
    })),
    cancelReservationPayload: vi.fn((input) => ({ reservationId: input.reservationId })),
    cancelReservationResponse: vi.fn((_payload, input) => ({
      propertyCode: input.propertyCode,
      reservationId: input.reservationId,
      cancellationNumber: "CANCEL-1",
      status: "cancelled",
      raw: {},
    })),
  };
  return { adapter: new StandardPmsAdapter(providerId, transport, mapper), transport };
}

describe("remaining PMS provider adapters", () => {
  it("covers every registered provider that previously lacked an adapter", () => {
    expect(standardPmsProviderIds).toEqual([
      "oracle-opera-5", "infor-hms", "agilysys-pms", "planet-protel",
      "stayntouch", "sihot", "rms-cloud", "maestro-pms", "shiji-pms",
      "guestline", "ezee-absolute", "clock-pms-plus", "hotelogix",
    ]);
  });

  it.each(standardPmsProviderIds)("routes %s availability through its provider boundary", async (providerId) => {
    const { adapter, transport } = setup(providerId);
    const offers = await adapter.availability({
      propertyCode: "hotel-1",
      arrivalDate: "2026-09-01",
      departureDate: "2026-09-03",
      adults: 2,
    });
    expect(offers[0]?.offerId).toBe("offer-1");
    expect(transport.execute).toHaveBeenCalledWith(expect.objectContaining({
      providerId,
      propertyCode: "hotel-1",
      operation: "availability",
    }));
  });

  it.each(standardPmsProviderIds)("uses booking references for %s idempotency", async (providerId) => {
    const { adapter, transport } = setup(providerId);
    await adapter.createReservation({
      propertyCode: "hotel-1",
      externalReference: "IRP-100",
      offerId: "offer-1",
      arrivalDate: "2026-09-01",
      departureDate: "2026-09-03",
      adults: 2,
      guest: { firstName: "Test", lastName: "Guest" },
    });
    expect(transport.execute).toHaveBeenCalledWith(expect.objectContaining({
      providerId,
      operation: "create_reservation",
      requestId: "IRP-100",
    }));
  });

  it.each(standardPmsProviderIds)("isolates %s cancellation idempotency", async (providerId) => {
    const { adapter, transport } = setup(providerId);
    const result = await adapter.cancelReservation({
      propertyCode: "hotel-1",
      reservationId: "reservation-1",
      externalReference: "IRP-100",
    });
    expect(result.status).toBe("cancelled");
    expect(transport.execute).toHaveBeenCalledWith(expect.objectContaining({
      providerId,
      operation: "cancel_reservation",
      requestId: "cancel:IRP-100",
    }));
  });
});

