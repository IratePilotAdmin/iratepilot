import { createAdminClient } from "@/lib/supabase/admin";

type BookingPushEvent = "request_received" | "approved" | "declined" | "payment_confirmed" | "cancelled" | "refund_completed";

const copy: Record<BookingPushEvent, { title: string; body: string }> = {
  request_received: { title: "Booking request received", body: "Your request is waiting for the hotel to review it." },
  approved: { title: "Reservation approved", body: "Open Trips to complete your secure payment." },
  declined: { title: "Booking update", body: "The hotel could not approve this request. No payment was collected." },
  payment_confirmed: { title: "Payment confirmed", body: "Your payment was verified and your reservation is confirmed." },
  cancelled: { title: "Reservation cancelled", body: "Your reservation was cancelled and held inventory was released." },
  refund_completed: { title: "Refund complete", body: "Your payment was refunded and your reservation was cancelled." },
};

type ExpoTicket = {
  status: "ok" | "error";
  id?: string;
  details?: { error?: string };
};

export async function sendBookingPushNotification(input: {
  event: BookingPushEvent;
  bookingId: string;
  customerId: string;
  confirmationCode?: string | null;
}) {
  if (process.env.ENABLE_MOBILE_PUSH_NOTIFICATIONS !== "true") return { sent: 0, disabled: true };

  const admin = createAdminClient();
  const { data: devices, error } = await admin.from("mobile_push_tokens")
    .select("id,expo_push_token")
    .eq("user_id", input.customerId)
    .eq("enabled", true)
    .limit(100);
  if (error) throw error;
  if (!devices?.length) return { sent: 0, disabled: false };

  const content = copy[input.event];
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers,
    body: JSON.stringify(devices.map((device) => ({
      to: device.expo_push_token,
      title: content.title,
      body: content.body,
      sound: "default",
      channelId: "bookings",
      data: {
        bookingId: input.bookingId,
        confirmationCode: input.confirmationCode ?? undefined,
        event: input.event,
      },
    }))),
  });
  if (!response.ok) throw new Error(`Expo push request failed with status ${response.status}.`);

  const payload = await response.json() as { data?: ExpoTicket[] };
  const tickets = Array.isArray(payload.data) ? payload.data : [];
  const invalidIds = devices
    .filter((_, index) => tickets[index]?.status === "error" && tickets[index]?.details?.error === "DeviceNotRegistered")
    .map((device) => device.id);

  if (invalidIds.length) {
    const { error: disableError } = await admin.from("mobile_push_tokens")
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .in("id", invalidIds)
      .eq("user_id", input.customerId);
    if (disableError) console.error("Invalid mobile push tokens could not be disabled", disableError);
  }

  return { sent: tickets.filter((ticket) => ticket.status === "ok").length, disabled: false };
}
