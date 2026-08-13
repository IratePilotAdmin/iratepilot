import { describe, expect, it } from "vitest";
import {
  CloudbedsBookingMapper,
  loadCloudbedsSyncConfig,
} from "../services/hotel-suppliers/cloudbeds";

const stay = {
  propertyCode: "12345",
  arrivalDate: "2026-10-01",
  departureDate: "2026-10-03",
  adults: 2,
  children: 0,
  rooms: 1,
};

describe("CloudbedsBookingMapper", () => {
  const mapper = new CloudbedsBookingMapper({ sourceId: "s-123" });

  it("maps documented availability fields and creates an opaque offer ID", () => {
    expect(mapper.availabilityPayload(stay)).toEqual(expect.objectContaining({
      propertyIDs: "12345",
      startDate: "2026-10-01",
      endDate: "2026-10-03",
      detailedRates: true,
    }));
    const [offer] = mapper.availabilityResponse({ data: [{
      propertyID: "12345",
      currency: "USD",
      propertyRooms: [{
        roomTypeID: "KING",
        roomRateID: "BAR-KING",
        ratePlanID: "BAR",
        roomsAvailable: 2,
        totalRate: "420.50",
      }],
    }] }, stay);
    expect(offer).toMatchObject({
      propertyCode: "12345",
      roomTypeCode: "KING",
      ratePlanCode: "BAR",
      currency: "USD",
      totalAmount: 420.5,
      available: true,
    });
    expect(offer?.offerId).not.toContain("BAR-KING");
  });

  it("maps an offer into a reservation request without payment credentials", () => {
    const [offer] = mapper.availabilityResponse({ data: [{
      propertyID: "12345",
      propertyRooms: [{ roomTypeID: "KING", roomRateID: "BAR-KING", roomsAvailable: 1, totalRate: 420 }],
    }] }, stay);
    const payload = mapper.createReservationPayload({
      ...stay,
      offerId: offer!.offerId,
      externalReference: "IRP-200",
      guest: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.test" },
    });
    expect(payload).toEqual(expect.objectContaining({
      propertyID: "12345",
      sourceID: "s-123",
      thirdPartyIdentifier: "IRP-200",
      paymentMethod: "cash",
      sendEmailConfirmation: false,
      rooms: [{ roomTypeID: "KING", roomRateID: "BAR-KING", quantity: 1 }],
    }));
    expect(JSON.stringify(payload)).not.toMatch(/card|secret|apiKey/i);
  });

  it("normalizes create and cancellation responses", () => {
    const input = {
      ...stay,
      offerId: btoa(JSON.stringify({ roomTypeID: "KING", roomRateID: "BAR" })),
      externalReference: "IRP-200",
      guest: { firstName: "Ada", lastName: "Lovelace" },
    };
    expect(mapper.createReservationResponse({ data: {
      propertyID: "12345", reservationID: "CB-900", status: "confirmed",
    } }, input)).toMatchObject({
      reservationId: "CB-900", confirmationNumber: "CB-900", externalReference: "IRP-200",
    });
    expect(mapper.cancelReservationResponse({ data: {
      reservationID: "CB-900", status: "canceled",
    } }, { propertyCode: "12345", reservationId: "CB-900", externalReference: "IRP-200" }))
      .toMatchObject({ reservationId: "CB-900", status: "canceled" });
  });

  it("requires the API key and property source mapping for live sync", () => {
    expect(() => loadCloudbedsSyncConfig({})).toThrow("PMS_CLOUDBEDS_API_KEY");
    expect(() => loadCloudbedsSyncConfig({ PMS_CLOUDBEDS_API_KEY: "secret" }))
      .toThrow("PMS_CLOUDBEDS_SOURCE_ID");
    expect(loadCloudbedsSyncConfig({
      PMS_CLOUDBEDS_API_KEY: "secret",
      PMS_CLOUDBEDS_SOURCE_ID: "s-123",
    })).toMatchObject({ mapper: { sourceId: "s-123", paymentMethod: "cash" } });
  });

  it("rejects malformed offers before a booking can be created", () => {
    expect(() => mapper.availabilityResponse({ data: [{ propertyRooms: [{ totalRate: 100 }] }] }, stay))
      .toThrow("missing room or rate identifiers");
    expect(() => mapper.createReservationPayload({
      ...stay,
      offerId: "not-an-offer",
      externalReference: "IRP-200",
      guest: { firstName: "Ada", lastName: "Lovelace" },
    })).toThrow("offer identifier is invalid");
  });
});

