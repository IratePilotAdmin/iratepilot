import type { BookingComInboundReservation } from "./reservation-parser";

export type BookingComPmsAmounts = {
  subtotal: string;
  taxes: string;
  fees: "0.00";
  hotel_fees: string;
  total: string;
};

export type BookingComFolioMapping =
  | { outcome: "mapped"; amounts: BookingComPmsAmounts }
  | { outcome: "review"; code: "payment_treatment_required" | "currency_not_supported" | "price_breakdown_missing" | "guest_total_missing" | "unknown_charge_type" | "exclusive_charge_requires_review" | "charges_exceed_guest_total" };

function usd(minor: number) {
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}

/**
 * Map only the guest's USD folio view. OTA settlement/commission amounts are
 * deliberately excluded from guest charges; unsupported cases go to review.
 */
export function mapBookingComRoomToPmsFolio(
  room: BookingComInboundReservation["rooms"][number],
  paymentMode: BookingComInboundReservation["paymentMode"],
): BookingComFolioMapping {
  if (paymentMode !== "pay_at_property") return { outcome: "review", code: "payment_treatment_required" };
  if (room.currency !== "USD") return { outcome: "review", code: "currency_not_supported" };
  const guestView = room.priceDetails?.guestView;
  if (!guestView) return { outcome: "review", code: "price_breakdown_missing" };
  const total = guestView.totalMinor;
  if (!Number.isSafeInteger(total) || total! < 0) {
    return { outcome: "review", code: "guest_total_missing" };
  }
  // Exclusive Booking.com charges are not consistently included in the
  // property-collected total. Hold them until collection responsibility and
  // folio treatment are confirmed for the property/payment model.
  if (guestView.taxes.some((charge) => charge.type !== "inclusive")) {
    return { outcome: "review", code: "exclusive_charge_requires_review" };
  }
  if (guestView.taxes.some((charge) => charge.classification === "unknown")) {
    return { outcome: "review", code: "unknown_charge_type" };
  }
  const taxes = guestView.taxes.filter((charge) => charge.classification === "tax")
    .reduce((sum, charge) => sum + charge.amountMinor, 0);
  const hotelFees = guestView.taxes.filter((charge) => charge.classification === "fee")
    .reduce((sum, charge) => sum + charge.amountMinor, 0);
  const guestTotal = total!;
  if (!Number.isSafeInteger(taxes) || !Number.isSafeInteger(hotelFees)
    || taxes + hotelFees > guestTotal) return { outcome: "review", code: "charges_exceed_guest_total" };
  const subtotal = guestTotal - taxes - hotelFees;
  return {
    outcome: "mapped",
    amounts: {
      subtotal: usd(subtotal), taxes: usd(taxes), fees: "0.00",
      hotel_fees: usd(hotelFees), total: usd(guestTotal),
    },
  };
}
