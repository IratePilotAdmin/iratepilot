import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { getApprovedBookingPaymentMode } from "@/lib/stripe/booking-payment-mode";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const readiness = {
    testCheckoutDisabled: process.env.ENABLE_TEST_CHECKOUT === "false",
    liveBookingEnabled: process.env.ENABLE_LIVE_BOOKING_PAYMENTS === "true",
    pilotDisabled: process.env.PILOT_MODE === "false",
    publicBookingEnabled: process.env.NEXT_PUBLIC_PUBLIC_BOOKING === "true",
    secretKeyIsLive: process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") === true,
    publishableKeyIsLive: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_live_") === true,
    liveWebhooksEnabled: process.env.ENABLE_LIVE_STRIPE_WEBHOOKS === "true",
    webhookSecretConfigured: process.env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_") === true,
    partnerPayoutsEnabled: process.env.ENABLE_LIVE_PARTNER_PAYOUTS === "true",
    paymentMode: getApprovedBookingPaymentMode(),
  };

  return NextResponse.json(
    { data: readiness },
    { headers: { "Cache-Control": "no-store, private" } },
  );
}
