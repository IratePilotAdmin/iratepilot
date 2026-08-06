export type PaymentState = "paid" | "refund_pending" | "refunded" | "not_collected";

type CancellationRecord = {
  status: string;
  refund_amount: number | string | null;
};

export type CustomerBookingPayment = {
  id: string;
  confirmation_code: string;
  check_in: string;
  check_out: string;
  subtotal: number | string;
  taxes: number | string;
  fees: number | string;
  total: number | string;
  status: string;
  created_at: string;
  stripe_payment_intent_id: string | null;
  stripe_payment_mode?: "test" | "live" | null;
  properties?: { name?: string } | Array<{ name?: string }> | null;
  rooms?: { name?: string } | Array<{ name?: string }> | null;
  booking_cancellation_requests?: CancellationRecord[] | null;
};

export type CustomerPaymentEntry = {
  bookingId: string;
  confirmationCode: string;
  propertyName: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  bookedAt: string;
  subtotal: number;
  taxes: number;
  fees: number;
  total: number;
  refundedAmount: number;
  state: PaymentState;
  paymentMode: "test" | "live" | null;
};

const amount = (value: number | string | null | undefined) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const relationName = (relation: CustomerBookingPayment["properties"] | CustomerBookingPayment["rooms"], fallback: string) => {
  const record = Array.isArray(relation) ? relation[0] : relation;
  return record?.name || fallback;
};

export function buildCustomerPaymentHistory(bookings: CustomerBookingPayment[]) {
  const entries: CustomerPaymentEntry[] = bookings.map((booking) => {
    const cancellations = booking.booking_cancellation_requests || [];
    const refunded = cancellations.find((request) => request.status === "refunded");
    const refundPending = cancellations.some((request) => ["pending", "processing", "approved"].includes(request.status));
    const hasPayment = Boolean(booking.stripe_payment_intent_id);
    const state: PaymentState = refunded || booking.status === "refunded"
      ? "refunded"
      : hasPayment && refundPending
        ? "refund_pending"
        : hasPayment
          ? "paid"
          : "not_collected";

    return {
      bookingId: booking.id,
      confirmationCode: booking.confirmation_code,
      propertyName: relationName(booking.properties, "Property"),
      roomName: relationName(booking.rooms, "Room"),
      checkIn: booking.check_in,
      checkOut: booking.check_out,
      bookedAt: booking.created_at,
      subtotal: amount(booking.subtotal),
      taxes: amount(booking.taxes),
      fees: amount(booking.fees),
      total: amount(booking.total),
      refundedAmount: state === "refunded" ? amount(refunded?.refund_amount ?? booking.total) : 0,
      state,
      paymentMode: hasPayment ? booking.stripe_payment_mode || "test" : null,
    };
  });

  const paidEntries = entries.filter((entry) => entry.state !== "not_collected");
  const collected = paidEntries.reduce((sum, entry) => sum + entry.total, 0);
  const refunded = entries.reduce((sum, entry) => sum + entry.refundedAmount, 0);

  return {
    entries,
    summary: {
      testPayments: paidEntries.filter((entry) => entry.paymentMode === "test").length,
      livePayments: paidEntries.filter((entry) => entry.paymentMode === "live").length,
      collected,
      refunded,
      net: Math.max(0, collected - refunded),
      unpaidRequests: entries.filter((entry) => entry.state === "not_collected").length,
    },
  };
}
