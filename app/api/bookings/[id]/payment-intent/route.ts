import { NextResponse } from "next/server";
import { z } from "zod";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getApprovedBookingMetadataMode, getApprovedBookingPaymentMode } from "@/lib/stripe/booking-payment-mode";

const bookingIdSchema = z.string().uuid();

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const paymentMode = getApprovedBookingPaymentMode();
  if (!paymentMode) return NextResponse.json({ error: "Approved-reservation payments are disabled." }, { status: 503 });

  const { id } = await params;
  if (!bookingIdSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid booking ID." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const admin = createAdminClient();
  const { data: booking, error } = await admin.from("bookings")
    .select("id,customer_id,confirmation_code,status,total,stripe_payment_intent_id,properties(name),rooms(name)")
    .eq("id", id)
    .eq("customer_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "The reservation could not be loaded." }, { status: 503 });
  if (!booking) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
  if (booking.status !== "confirmed") return NextResponse.json({ error: "Only approved reservations can be paid." }, { status: 409 });
  if (booking.stripe_payment_intent_id) return NextResponse.json({ error: "This reservation has already been paid." }, { status: 409 });

  const totalCents = Math.round(Number(booking.total) * 100);
  if (!Number.isSafeInteger(totalCents) || totalCents < 50) {
    return NextResponse.json({ error: "The reservation total is invalid." }, { status: 409 });
  }

  const property = booking.properties as unknown as { name?: string } | null;
  const room = booking.rooms as unknown as { name?: string } | null;
  const intent = await getStripe().paymentIntents.create({
    amount: totalCents,
    currency: "usd",
    payment_method_types: ["card"],
    metadata: {
      mode: getApprovedBookingMetadataMode(paymentMode),
      bookingId: booking.id,
      userId: user.id,
      confirmationCode: booking.confirmation_code,
    },
    description: `${paymentMode === "test" ? "Test payment" : "Payment"} for ${booking.confirmation_code}`,
  }, { idempotencyKey: `approved-booking-${paymentMode}-payment-${booking.id}` });

  if (!intent.client_secret) return NextResponse.json({ error: "Stripe did not return a checkout secret." }, { status: 503 });
  return NextResponse.json({
    clientSecret: intent.client_secret,
    paymentMode,
    breakdown: {
      confirmationCode: booking.confirmation_code,
      propertyName: property?.name || "Property",
      roomName: room?.name || "Room",
      total: Number(booking.total),
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
