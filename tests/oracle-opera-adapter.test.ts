import { describe, expect, it, vi } from "vitest";
import { OracleOperaAdapter } from "../services/hotel-suppliers/oracle-opera/adapter";
import type { OracleOperaClient } from "../services/hotel-suppliers/oracle-opera/client";
import type { OracleOperaContractMapper } from "../services/hotel-suppliers/oracle-opera/contracts";

const mapper: OracleOperaContractMapper = {
  availabilityPath: ({ hotelId }) => `/shop/v1/hotels/${hotelId}/offers`,
  availabilityPayload: (input) => ({ stay: input }),
  availabilityResponse: (payload, input) => [{
    offerId: "offer-1",
    hotelId: input.hotelId,
    roomTypeCode: "KING",
    ratePlanCode: "BAR",
    currency: "USD",
    totalAmount: 250,
    nightlyRates: [{ start: input.arrivalDate, end: input.departureDate, amountAfterTax: 250 }],
    available: true,
    raw: payload,
  }],
  createReservationPath: ({ hotelId }) => `/rsv/v1/hotels/${hotelId}/reservations`,
  createReservationPayload: (input) => ({ booking: input }),
  createReservationResponse: (payload, input) => ({
    hotelId: input.hotelId,
    reservationId: "reservation-1",
    confirmationNumber: "OPERA-123",
    externalReference: input.externalReference,
    status: "RESERVED",
    raw: payload,
  }),
  cancelReservationPath: ({ hotelId, reservationId }) =>
    `/rsv/v1/hotels/${hotelId}/reservations/${reservationId}/cancellations`,
  cancelReservationPayload: (input) => ({ reason: input.reason }),
  cancelReservationResponse: (payload, input) => ({
    hotelId: input.hotelId,
    reservationId: input.reservationId,
    cancellationNumber: "CANCEL-123",
    status: "CANCELLED",
    raw: payload,
  }),
};

function setup() {
  const request = vi.fn().mockResolvedValue({ upstream: true });
  const adapter = new OracleOperaAdapter({ request } as unknown as OracleOperaClient, mapper);
  return { adapter, request };
}

describe("OracleOperaAdapter", () => {
  it("maps availability without exposing Oracle payloads to callers", async () => {
    const { adapter, request } = setup();
    const input = {
      hotelId: "HOTEL1",
      arrivalDate: "2026-09-10",
      departureDate: "2026-09-12",
      adults: 2,
    };

    const offers = await adapter.availability(input);

    expect(request).toHaveBeenCalledWith("/shop/v1/hotels/HOTEL1/offers", {
      method: "POST",
      hotelId: "HOTEL1",
      body: { stay: input },
    });
    expect(offers[0]).toMatchObject({ offerId: "offer-1", totalAmount: 250 });
  });

  it("uses the iRatePilot booking reference as the reservation idempotency key", async () => {
    const { adapter, request } = setup();
    const input = {
      hotelId: "HOTEL1",
      arrivalDate: "2026-09-10",
      departureDate: "2026-09-12",
      adults: 2,
      externalReference: "IRP-BOOKING-1",
      offerId: "offer-1",
      roomTypeCode: "KING",
      ratePlanCode: "BAR",
      currency: "USD",
      totalAmount: 250,
      nightlyRates: [{ start: "2026-09-10", end: "2026-09-12", amountAfterTax: 250 }],
      guest: { firstName: "Test", lastName: "Traveler" },
      payment: { methodCode: "5", guaranteeType: "5" },
    };

    const reservation = await adapter.createReservation(input);

    expect(request).toHaveBeenCalledWith("/rsv/v1/hotels/HOTEL1/reservations", expect.objectContaining({
      method: "POST",
      hotelId: "HOTEL1",
      headers: { "Idempotency-Key": "IRP-BOOKING-1" },
    }));
    expect(reservation).toMatchObject({
      reservationId: "reservation-1",
      confirmationNumber: "OPERA-123",
      externalReference: "IRP-BOOKING-1",
    });
  });

  it("makes cancellation retries distinct from booking creation retries", async () => {
    const { adapter, request } = setup();
    const cancellation = await adapter.cancelReservation({
      hotelId: "HOTEL1",
      reservationId: "reservation-1",
      externalReference: "IRP-BOOKING-1",
      reason: "Guest request",
    });

    expect(request).toHaveBeenCalledWith(
      "/rsv/v1/hotels/HOTEL1/reservations/reservation-1/cancellations",
      expect.objectContaining({
        headers: { "Idempotency-Key": "cancel:IRP-BOOKING-1" },
      }),
    );
    expect(cancellation).toMatchObject({ status: "CANCELLED", cancellationNumber: "CANCEL-123" });
  });
});
