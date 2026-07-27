import { NextResponse } from "next/server";
import { fees } from "@/config/fees";
import { hotels } from "@/data/hotels";
import { getStripe } from "@/lib/stripe";
import { checkoutSchema } from "@/lib/validation";

export async function POST(request: Request) {
  if (process.env.ENABLE_TEST_CHECKOUT !== "true") return NextResponse.json({ error: "Test checkout is disabled." }, { status: 503 });
  if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) return NextResponse.json({ error: "A Stripe test key is required." }, { status: 503 });
  const parsed = checkoutSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const hotel = hotels.find((item) => item.slug === parsed.data.hotelSlug);
  if (!hotel) return NextResponse.json({ error: "Property not found." }, { status: 404 });

  const subtotal = hotel.price * parsed.data.nights;
  const serviceFee = Math.round(subtotal * fees.serviceFeeRate * 100) / 100;
  const total = subtotal + serviceFee;
  const intent = await getStripe().paymentIntents.create({
    amount: Math.round(total * 100),
    currency: "usd",
    automatic_payment_methods: { enabled: true },
    metadata: {
      mode: "pilot_test",
      hotelSlug: hotel.slug,
      roomName: parsed.data.roomName,
      nights: String(parsed.data.nights),
      guests: String(parsed.data.guests)
    }
  });
  return NextResponse.json({ clientSecret: intent.client_secret, breakdown: { subtotal, serviceFee, total } });
}
