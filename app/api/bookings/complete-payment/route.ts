import { NextResponse } from "next/server";
import { z } from "zod";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const requestSchema = z.object({
  paymentIntentId: z.string().startsWith("pi_")
});

export async function POST(request: Request) {
  if (process.env.ENABLE_TEST_CHECKOUT !== "true" || !process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
    return NextResponse.json({ error: "Test booking completion is disabled." }, { status: 503 });
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "A valid payment reference is required." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  try {
    const intent = await getStripe().paymentIntents.retrieve(parsed.data.paymentIntentId);
    const metadata = intent.metadata;
    if (intent.status !== "succeeded" || metadata.mode !== "booking_test" || metadata.userId !== user.id) {
      return NextResponse.json({ error: "The test payment has not been verified." }, { status: 409 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("complete_paid_test_booking", {
      p_payment_intent_id: intent.id,
      p_customer_id: user.id,
      p_property_id: metadata.propertyId,
      p_room_id: metadata.roomId,
      p_check_in: metadata.checkIn,
      p_check_out: metadata.checkOut,
      p_guests: Number(metadata.guests),
      p_confirmation_code: metadata.confirmationCode,
      p_amount_total_cents: intent.amount_received
    });
    if (error) throw error;

    return NextResponse.json({
      data,
      message: "Test payment verified and booking confirmed."
    });
  } catch {
    return NextResponse.json({ error: "Payment succeeded, but the booking could not be finalized." }, { status: 503 });
  }
}
