import type { BookingPaymentMode } from "@/lib/stripe/booking-payment-mode";

export type BookingConfirmationStatus = "pending" | "confirmed" | "cancelled" | "refunded";

export function getBookingConfirmationPresentation(
  status: BookingConfirmationStatus,
  paid: boolean,
  replayed = false,
  paymentMode?: BookingPaymentMode | null,
) {
  if (status === "pending") {
    return replayed
      ? {
        title: "Your request is already pending",
        message: "We found the same open request and did not create a duplicate. No payment was collected.",
      }
      : {
        title: "Your booking request was sent",
        message: "The property will review your pending request. No payment was collected.",
      };
  }
  if (status === "confirmed") {
    return paid
      ? paymentMode === "live"
        ? { title: "Your stay is confirmed", message: "Your secure payment was received and your reservation is confirmed." }
        : { title: "Your test stay is confirmed", message: "Stripe test mode was used. No real money was charged." }
      : { title: "Your booking is confirmed", message: "The property approved your request. No payment was collected." };
  }
  if (status === "refunded") {
    return { title: "This booking was refunded", message: "Open Trips for the latest refund and cancellation details." };
  }
  return { title: "This booking was cancelled", message: "Open Trips for the latest cancellation details." };
}
