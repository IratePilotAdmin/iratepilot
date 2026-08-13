import { describe, expect, it, vi } from "vitest";
import {
  ApaleoBookingMapper,
  createApaleoSyncAdapter,
  loadApaleoSyncConfig,
} from "../services/hotel-suppliers/apaleo";
import type { ApaleoFetch } from "../services/hotel-suppliers/apaleo";

const request = {
  propertyCode: "MUC",
  arrivalDate: "2026-09-10",
  departureDate: "2026-09-12",
  adults: 2,
  children: 1,
  childrenAges: [8],
};

const offerResponse = {
  property: { id: "MUC" },
  offers: [{
    ratePlan: { id: "MUC-NONREF-SGL", name: "Non Refundable" },
    unitGroup: { id: "MUC-SGL", name: "Single" },
    minGuaranteeType: "Prepayment",
    availableUnits: 3,
    totalGrossAmount: { amount: 151, currency: "EUR" },
    prePaymentGrossAmount: { amount: 151, currency: "EUR" },
    timeSlices: [
      { ratePlan: { id: "MUC-NONREF-SGL" }, totalGrossAmount: { amount: 75, currency: "EUR" } },
      { ratePlan: { id: "MUC-NONREF-SGL" }, totalGrossAmount: { amount: 76, currency: "EUR" } },
    ],
  }],
};

describe("Apaleo complete booking synchronization", () => {
  it("maps official IBE offer parameters and preserves the selected booking terms", () => {
    const mapper = new ApaleoBookingMapper();
    expect(mapper.availabilityPayload(request)).toEqual({
      arrival: "2026-09-10",
      departure: "2026-09-12",
      adults: 2,
      childrenAges: "8",
    });

    const [offer] = mapper.availabilityResponse(offerResponse, request);
    expect(offer).toMatchObject({
      propertyCode: "MUC",
      roomTypeCode: "MUC-SGL",
      ratePlanCode: "MUC-NONREF-SGL",
      currency: "EUR",
      totalAmount: 151,
      available: true,
    });

    expect(mapper.createReservationPayload({
      ...request,
      externalReference: "IRP-AP-100",
      offerId: offer!.offerId,
      guest: { firstName: "Jon", lastName: "Doe", email: "jon@example.com" },
    })).toEqual({
      booker: { firstName: "Jon", lastName: "Doe", email: "jon@example.com", phone: undefined },
      reservations: [{
        arrival: "2026-09-10",
        departure: "2026-09-12",
        adults: 2,
        childrenAges: [8],
        channelCode: "Ibe",
        primaryGuest: { firstName: "Jon", lastName: "Doe", email: "jon@example.com", phone: undefined },
        guaranteeType: "Prepayment",
        unitGroupId: "MUC-SGL",
        timeSlices: [
          { ratePlanId: "MUC-NONREF-SGL", totalGrossAmount: { amount: 75, currency: "EUR" } },
          { ratePlanId: "MUC-NONREF-SGL", totalGrossAmount: { amount: 76, currency: "EUR" } },
        ],
        prePaymentAmount: { amount: 151, currency: "EUR" },
        comment: "iRatePilot reference IRP-AP-100",
      }],
    });
  });

  it("maps booking and no-content cancellation responses", () => {
    const mapper = new ApaleoBookingMapper();
    const [offer] = mapper.availabilityResponse(offerResponse, request);
    const createInput = {
      ...request,
      externalReference: "IRP-AP-100",
      offerId: offer!.offerId,
      guest: { firstName: "Jon", lastName: "Doe" },
    };
    expect(mapper.createReservationResponse({
      id: "BOOKING-1",
      reservations: [{ id: "RES-1", propertyId: "MUC", status: "Confirmed" }],
    }, createInput)).toMatchObject({
      reservationId: "RES-1",
      confirmationNumber: "BOOKING-1",
      externalReference: "IRP-AP-100",
      status: "Confirmed",
    });
    expect(mapper.cancelReservationResponse(undefined, {
      propertyCode: "MUC",
      reservationId: "RES-1",
      externalReference: "IRP-AP-100",
    })).toMatchObject({ reservationId: "RES-1", status: "canceled" });
  });

  it("loads server-only credentials and executes availability, booking, and cancellation", async () => {
    const fetcher = vi.fn<ApaleoFetch>(async (input, init) => {
      const url = String(input);
      if (url.includes("identity.apaleo.test")) {
        expect(String(init?.headers && (init.headers as Record<string, string>).authorization)).toMatch(/^Basic /);
        return Response.json({ access_token: "short-lived-access-token", expires_in: 3600 });
      }
      if (url.includes("/offers?")) return Response.json(offerResponse);
      if (url.endsWith("/bookings")) {
        expect(init?.headers).toEqual(expect.objectContaining({ "idempotency-key": "IRP-AP-100" }));
        return Response.json({ id: "BOOKING-1", reservations: [{ id: "RES-1", propertyId: "MUC" }] });
      }
      if (url.endsWith("/reservation-actions/RES-1/cancel")) return new Response(undefined, { status: 204 });
      return Response.json({ message: "unexpected" }, { status: 500 });
    });
    const config = loadApaleoSyncConfig({
      PMS_APALEO_BASE_URL: "https://api.apaleo.test",
      PMS_APALEO_CLIENT_ID: "client-id",
      PMS_APALEO_CLIENT_SECRET: "server-secret",
      PMS_APALEO_IDENTITY_URL: "https://identity.apaleo.test/connect/token",
    });
    const adapter = createApaleoSyncAdapter(config, fetcher);
    const [offer] = await adapter.availability(request);
    const reservation = await adapter.createReservation({
      ...request,
      externalReference: "IRP-AP-100",
      offerId: offer!.offerId,
      guest: { firstName: "Jon", lastName: "Doe", email: "jon@example.com" },
    });
    const cancellation = await adapter.cancelReservation({
      propertyCode: "MUC",
      reservationId: reservation.reservationId,
      externalReference: "IRP-AP-100",
      reason: "guest request",
    });

    const offerUrl = new URL(String(fetcher.mock.calls[1]?.[0]));
    expect(offerUrl.searchParams.get("childrenAges")).toBe("8");
    expect(reservation.reservationId).toBe("RES-1");
    expect(cancellation.status).toBe("canceled");
    expect(JSON.stringify({ reservation, cancellation })).not.toContain("server-secret");
    expect(fetcher.mock.calls.filter(([input]) => String(input).includes("identity.apaleo.test"))).toHaveLength(1);
  });

  it("rejects unsupported multi-room calls and malformed offers", () => {
    const mapper = new ApaleoBookingMapper();
    expect(() => mapper.availabilityPayload({ ...request, rooms: 2 }))
      .toThrow("one room at a time");
    expect(() => mapper.availabilityResponse({ offers: [{}] }, request))
      .toThrow("offer rate plan response is malformed");
  });

  it("requires the Apaleo access token", () => {
    expect(() => loadApaleoSyncConfig({})).toThrow("PMS_APALEO_CLIENT_ID");
  });
});
