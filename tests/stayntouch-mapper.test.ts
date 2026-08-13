import { describe, expect, it } from "vitest";
import { StayntouchBookingMapper } from "../services/hotel-suppliers/stayntouch";

const mapper = new StayntouchBookingMapper({ currency: "USD", bookingOriginCode: "IRP" });

const availability = {
  propertyCode: "105",
  arrivalDate: "2026-09-10",
  departureDate: "2026-09-12",
  adults: 2,
};

describe("StayntouchBookingMapper", () => {
  it("maps documented availability rates and calculates the full-stay total", () => {
    expect(mapper.availabilityPayload(availability)).toEqual({
      from_date: "2026-09-10", to_date: "2026-09-12", adults: 2, children: 0,
      rate_classification: "PUBLIC", per_page: 50,
    });
    const offers = mapper.availabilityResponse({
      results: [{
        rate_id: 44, rate_code: "BAR",
        room_types: [{ id: 12, name: "King", availability: 3, adr: 175.5 }],
      }],
    }, availability);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      roomTypeCode: "12", ratePlanCode: "BAR", currency: "USD",
      totalAmount: 351, available: true,
    });
  });

  it("creates one documented stay-date record per night and carries the booking reference", () => {
    const [offer] = mapper.availabilityResponse({
      results: [{ rate_id: 44, rate_code: "BAR", room_types: [{ id: 12, availability: 1, adr: 175 }] }],
    }, availability);
    const payload = mapper.createReservationPayload({
      ...availability,
      externalReference: "IRP-100",
      offerId: offer!.offerId,
      guest: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" },
    }) as Record<string, unknown>;
    expect(payload).toMatchObject({
      arrival_date: "2026-09-10",
      departure_date: "2026-09-12",
      booking_origin_code: "IRP",
      guests: [{ is_primary: true, first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" }],
      references: [{ value: "IRP-100", type: "confirmation_number", interface: "direct", primary: true }],
    });
    expect(payload.stay_dates).toEqual([
      { date: "2026-09-10", rate_id: 44, room_type_id: 12, adults: 2, children: 0 },
      { date: "2026-09-11", rate_id: 44, room_type_id: 12, adults: 2, children: 0 },
    ]);
  });

  it("normalizes creation and requires an affirmative cancellation response", () => {
    expect(mapper.createReservationResponse({ id: 9001 }, {
      ...availability, externalReference: "IRP-100", offerId: "unused",
      guest: { firstName: "Ada", lastName: "Lovelace" },
    })).toMatchObject({ reservationId: "9001", externalReference: "IRP-100", status: "RESERVED" });

    const cancellationInput = {
      propertyCode: "105", reservationId: "9001", externalReference: "IRP-100", reason: "guest request",
    };
    expect(mapper.cancelReservationPayload(cancellationInput)).toEqual({
      reservationId: "9001", reason: "guest request", send_cancellation_email: false,
      refund_deposit: false, charge_penalty: false,
    });
    expect(mapper.cancelReservationResponse({ status: true }, cancellationInput).status).toBe("CANCELED");
    expect(() => mapper.cancelReservationResponse({ status: false }, cancellationInput))
      .toThrow("did not confirm");
  });
});
