import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { isRatehawkCertificationReviewer } from "@/lib/ratehawk/certification-review-access";
import { getStripe } from "@/lib/stripe";
import {
  classifyRatehawkCertificationFailure,
  runRatehawkCertificationScenario,
} from "@/services/hotel-suppliers/ratehawk-certification-runner.server";

export const maxDuration = 300;

const requestSchema = z.object({
  paymentIntentId: z.string().regex(/^pi_[A-Za-z0-9_]+$/).max(255),
  confirmation: z.literal("RUN RATEHAWK SANDBOX BOOKING"),
});

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isRatehawkCertificationReviewer(auth.user.email)) {
    return NextResponse.json({ error: "Certification review access is unavailable." }, { status: 404 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid certification request." }, { status: 400 });

  const stripe = getStripe();
  const paymentIntent = await stripe.paymentIntents.retrieve(parsed.data.paymentIntentId);
  if (
    paymentIntent.livemode
    || paymentIntent.status !== "succeeded"
    || paymentIntent.metadata.mode !== "ratehawk_certification_review"
    || paymentIntent.metadata.userId !== auth.user.id
  ) {
    return NextResponse.json({ error: "A completed Stripe test payment is required." }, { status: 409 });
  }

  if (paymentIntent.metadata.ratehawkOrderId && paymentIntent.metadata.ratehawkCancelled === "true") {
    return NextResponse.json({
      data: {
        paymentIntentId: paymentIntent.id,
        partnerOrderId: paymentIntent.metadata.ratehawkOrderId,
        finalStatus: "confirmed",
        cancelled: true,
        refunded: paymentIntent.metadata.testPaymentRefunded === "true",
      },
      duplicate: true,
      message: "The completed certification result was returned. No duplicate booking was created.",
    });
  }

  try {
    const result = await runRatehawkCertificationScenario({
      environment: process.env,
      scenarioId: "citizenship",
    });
    if (result.finalStatus !== "confirmed" || !result.cancelled) {
      return NextResponse.json({ error: "The sandbox booking did not complete its cancellation." }, { status: 502 });
    }

    const refund = await stripe.refunds.create({
      payment_intent: paymentIntent.id,
      reason: "requested_by_customer",
      metadata: {
        mode: "ratehawk_certification_review",
        ratehawkOrderId: result.partnerOrderId,
      },
    }, { idempotencyKey: `ratehawk-certification-review-refund-${paymentIntent.id}` });
    const refunded = refund.status === "succeeded" || refund.status === "pending";

    await stripe.paymentIntents.update(paymentIntent.id, {
      metadata: {
        ...paymentIntent.metadata,
        ratehawkOrderId: result.partnerOrderId,
        ratehawkCancelled: "true",
        testPaymentRefunded: String(refunded),
      },
    });

    return NextResponse.json({
      data: {
        paymentIntentId: paymentIntent.id,
        partnerOrderId: result.partnerOrderId,
        finalStatus: result.finalStatus,
        cancelled: result.cancelled,
        cancellationAmount: result.cancellationAmount,
        cancellationCurrency: result.cancellationCurrency,
        refunded,
      },
      message: "The RateHawk sandbox booking was confirmed and cancelled, and the Stripe test payment was refunded.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("RateHawk certification reviewer workflow failed", classifyRatehawkCertificationFailure(error));
    return NextResponse.json({
      error: "The RateHawk sandbox booking workflow could not be completed. No production booking or live charge was created.",
    }, { status: 502 });
  }
}

