import { createAdminClient } from "@/lib/supabase/admin";
import { queueTransactionalEmail, wakeTransactionalEmailWorker } from "@/lib/email/outbox";
import { sendBookingPushNotification } from "@/lib/notifications/expo";
import type { BookingPaymentMode } from "@/lib/stripe/booking-payment-mode";

type BookingEmailEvent = "request_received" | "approved" | "declined" | "payment_confirmed" | "cancelled" | "refund_completed";

const copy: Record<BookingEmailEvent, { subject: string; message: string }> = {
  request_received: { subject: "We received your iRatePilot booking request", message: "Your booking request is waiting for the hotel to review it." },
  approved: { subject: "Your iRatePilot reservation was approved", message: "The hotel approved your reservation. Open your trips to complete the secure test payment." },
  declined: { subject: "Update on your iRatePilot booking request", message: "The hotel could not approve this booking request. No payment was collected." },
  payment_confirmed: { subject: "Your iRatePilot payment is confirmed", message: "Your test payment was verified and your reservation is confirmed." },
  cancelled: { subject: "Your iRatePilot reservation was cancelled", message: "Your reservation was cancelled and any held inventory was released." },
  refund_completed: { subject: "Your iRatePilot refund is complete", message: "Your test payment was refunded and your reservation was cancelled." },
};

export async function queueBookingNotification(input: {
  event: BookingEmailEvent;
  bookingId: string;
  confirmationCode?: string | null;
  customerId: string;
  recipientEmail?: string | null;
  paymentMode?: BookingPaymentMode;
}) {
  try {
    const admin = createAdminClient();
    let recipientEmail = input.recipientEmail;
    if (!recipientEmail) {
      const { data, error } = await admin.auth.admin.getUserById(input.customerId);
      if (error) throw error;
      recipientEmail = data.user?.email;
    }
    if (!recipientEmail) throw new Error("Customer email is unavailable");

    const { data: booking, error: bookingError } = await admin.from("bookings")
      .select("confirmation_code,supplier_itinerary_id,check_in,check_out,guests,child_ages,subtotal,taxes,fees,total,due_at_property,bed_type,refundable,cancellation_policy,checkin_begin_time,checkin_end_time,checkin_instructions,special_checkin_instructions,stripe_payment_intent_id,properties(name),rooms(name)")
      .eq("id", input.bookingId).maybeSingle();
    if (bookingError) throw bookingError;

    const dedupeKey = `booking:${input.bookingId}:${input.event}`;
    const { data: existing, error: lookupError } = await admin
      .from("email_outbox")
      .select("id")
      .contains("template_data", { dedupe_key: dedupeKey })
      .limit(1)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return existing;

    const content = { ...copy[input.event] };
    if (input.event === "payment_confirmed" && input.paymentMode === "live") {
      content.message = "Your payment was verified and your reservation is confirmed.";
    }
    if (input.event === "refund_completed" && input.paymentMode === "live") {
      content.message = "Your payment was refunded and your reservation was cancelled.";
    }
    const job = await queueTransactionalEmail({
      recipientEmail,
      subject: content.subject,
      templateName: `booking_${input.event}`,
      templateData: {
        dedupe_key: dedupeKey,
        message: content.message,
        action_url: "https://www.iratepilot.com/account/trips",
        confirmation_code: booking?.confirmation_code ?? input.confirmationCode,
        supplier_itinerary_id: booking?.supplier_itinerary_id,
        property_name: (booking?.properties as unknown as { name?: string } | null)?.name,
        room_name: (booking?.rooms as unknown as { name?: string } | null)?.name,
        check_in: booking?.check_in,
        check_out: booking?.check_out,
        guests: booking?.guests,
        child_ages: booking?.child_ages,
        subtotal: booking?.subtotal,
        taxes: booking?.taxes,
        fees: booking?.fees,
        due_at_property: booking?.due_at_property,
        total: booking?.total,
        bed_type: booking?.bed_type,
        refundable: booking?.refundable,
        cancellation_policy: booking?.cancellation_policy,
        checkin_begin_time: booking?.checkin_begin_time,
        checkin_end_time: booking?.checkin_end_time,
        checkin_instructions: booking?.checkin_instructions,
        special_checkin_instructions: booking?.special_checkin_instructions,
        payment_timing: booking?.stripe_payment_intent_id
          ? `$${Math.max(0, Number(booking.total || 0) - Number(booking.due_at_property || 0)).toFixed(2)} was collected securely when the booking was confirmed; $${Number(booking.due_at_property || 0).toFixed(2)} is due at the property.`
          : "No payment was collected with this booking request.",
        support_email: process.env.EMAIL_REPLY_TO || "support@iratepilot.com",
        support_url: "https://www.iratepilot.com/account/support",
      },
    });
    await wakeTransactionalEmailWorker();
    try {
      await sendBookingPushNotification({
        event: input.event,
        bookingId: input.bookingId,
        customerId: input.customerId,
        confirmationCode: input.confirmationCode,
      });
    } catch (pushError) {
      console.error("Booking push notification could not be sent", { event: input.event, bookingId: input.bookingId, pushError });
    }
    return job;
  } catch (error) {
    console.error("Booking notification could not be queued", { event: input.event, bookingId: input.bookingId, error });
    return null;
  }
}
