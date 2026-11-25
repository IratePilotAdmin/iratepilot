import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { isRatehawkCertificationReviewer } from "@/lib/ratehawk/certification-review-access";
import { getStripe } from "@/lib/stripe";

const requestSchema = z.object({ sessionId: z.string().uuid() });
const certificationAmountCents = 100;

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isRatehawkCertificationReviewer(auth.user.email)) {
    return NextResponse.json({ error: "Certification review access is unavailable." }, { status: 404 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid certification session." }, { status: 400 });

  const stripe = getStripe();
  const intent = await stripe.paymentIntents.create({
    amount: certificationAmountCents,
    currency: "usd",
    payment_method_types: ["card"],
    description: "RateHawk certification website checkout test",
    metadata: {
      mode: "ratehawk_certification_review",
      userId: auth.user.id,
      sessionId: parsed.data.sessionId,
    },
  }, { idempotencyKey: `ratehawk-certification-review-${auth.user.id}-${parsed.data.sessionId}` });

  if (intent.livemode || !intent.client_secret) {
    return NextResponse.json({ error: "Stripe test checkout is unavailable." }, { status: 503 });
  }
  return NextResponse.json({
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
    amount: certificationAmountCents / 100,
    currency: "USD",
    paymentMode: "test",
  }, { headers: { "Cache-Control": "no-store" } });
}

