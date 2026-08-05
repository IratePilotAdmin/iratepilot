import { createAdminClient } from "@/lib/supabase/admin";
import { queueTransactionalEmail } from "@/lib/email/outbox";

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

    const dedupeKey = `booking:${input.bookingId}:${input.event}`;
    const { data: existing, error: lookupError } = await admin
      .from("email_outbox")
      .select("id")
      .contains("template_data", { dedupe_key: dedupeKey })
      .limit(1)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return existing;

    const content = copy[input.event];
    return await queueTransactionalEmail({
      recipientEmail,
      subject: content.subject,
      templateName: `booking_${input.event}`,
      templateData: {
        dedupe_key: dedupeKey,
        confirmation_code: input.confirmationCode,
        message: content.message,
        action_url: "https://www.iratepilot.com/account/trips",
      },
    });
  } catch (error) {
    console.error("Booking notification could not be queued", { event: input.event, bookingId: input.bookingId, error });
    return null;
  }
}
