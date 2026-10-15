import { describe, expect, it } from "vitest";
import { mapBookingComRoomToPmsFolio } from "../services/hotel-channels/booking-com/folio-mapping";
import type { BookingComInboundReservation } from "../services/hotel-channels/booking-com/reservation-parser";

const room: BookingComInboundReservation["rooms"][number] = {
  providerRoomIndex: 1, providerRoomTypeId: "room-1", providerRatePlanId: "bar",
  checkIn: "2026-10-01", checkOut: "2026-10-02", guests: 2,
  totalMinor: 11700, totalBasis: "after_tax", currency: "USD",
  priceDetails: {
    guestView: { totalMinor: 11700, taxes: [
      { amountMinor: 1200, currency: "USD", type: "inclusive", classification: "tax", code: "3" },
      { amountMinor: 500, currency: "USD", type: "inclusive", classification: "fee", code: "12" },
    ] },
    hotelView: { totalMinor: 11200, taxes: [] },
  },
};

describe("Booking.com guest folio mapping", () => {
  it("splits the guest total into accommodation, taxes, and hotel fees", () => {
    expect(mapBookingComRoomToPmsFolio(room, "pay_at_property")).toEqual({ outcome: "mapped", amounts: {
      subtotal: "100.00", taxes: "12.00", fees: "0.00", hotel_fees: "5.00", total: "117.00",
    } });
  });

  it("never guesses at payment handling, currencies, missing totals, or unknown fee codes", () => {
    expect(mapBookingComRoomToPmsFolio(room, "payments_by_booking")).toMatchObject({ outcome: "review", code: "payment_treatment_required" });
    expect(mapBookingComRoomToPmsFolio({ ...room, currency: "CAD" }, "pay_at_property")).toMatchObject({ outcome: "review", code: "currency_not_supported" });
    expect(mapBookingComRoomToPmsFolio({ ...room, priceDetails: undefined }, "pay_at_property")).toMatchObject({ outcome: "review", code: "price_breakdown_missing" });
    expect(mapBookingComRoomToPmsFolio({ ...room, priceDetails: { ...room.priceDetails!, guestView: { taxes: [] } } }, "pay_at_property"))
      .toMatchObject({ outcome: "review", code: "guest_total_missing" });
    const unknown = { ...room, priceDetails: { ...room.priceDetails!, guestView: {
      totalMinor: 11700, taxes: [{ ...room.priceDetails!.guestView.taxes[0]!, classification: "unknown" as const }],
    } } };
    expect(mapBookingComRoomToPmsFolio(unknown, "pay_at_property")).toMatchObject({ outcome: "review", code: "unknown_charge_type" });
    const exclusive = { ...room, priceDetails: { ...room.priceDetails!, guestView: { ...room.priceDetails!.guestView,
      taxes: room.priceDetails!.guestView.taxes.map((charge) => ({ ...charge, type: "exclusive" as const })) } } };
    expect(mapBookingComRoomToPmsFolio(exclusive, "pay_at_property")).toMatchObject({ outcome: "review", code: "exclusive_charge_requires_review" });
  });

  it("rejects a charge breakdown larger than the guest total", () => {
    const invalid = { ...room, priceDetails: { ...room.priceDetails!, guestView: {
      totalMinor: 100, taxes: [{ ...room.priceDetails!.guestView.taxes[0]!, amountMinor: 101 }],
    } } };
    expect(mapBookingComRoomToPmsFolio(invalid, "pay_at_property")).toMatchObject({ outcome: "review", code: "charges_exceed_guest_total" });
  });
});
