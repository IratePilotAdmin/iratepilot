import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { buildPaymentReadiness, type PaymentLaunchAuthorization } from "@/lib/admin/payment-readiness";

export const dynamic = "force-dynamic";

const timestampSchema = z.string().datetime({ offset: true });
const authorizationSchema = z.object({
  action: z.literal("record"),
  approvalReference: z.string().trim().min(8).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/),
  stripeAccountReference: z.string().trim().regex(/^acct_[A-Za-z0-9]{6,64}$/),
  approvedAt: timestampSchema,
  expiresAt: timestampSchema,
  reviewNotes: z.string().trim().min(20).max(2000),
  stripeAccountVerified: z.literal(true),
  liveChargesCapabilityVerified: z.literal(true),
  livePayoutsCapabilityVerified: z.literal(true),
  webhookEndpointVerified: z.literal(true),
  refundDisputeProcessVerified: z.literal(true),
  supportEscalationVerified: z.literal(true),
  financeSettlementVerified: z.literal(true),
}).strict();
const revocationSchema = z.object({
  action: z.literal("revoke"),
  authorizationId: z.string().uuid(),
  revocationReference: z.string().trim().min(8).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/),
  reasonSummary: z.string().trim().min(20).max(2000),
}).strict();
const requestSchema = z.discriminatedUnion("action", [authorizationSchema, revocationSchema]);

export async function GET() {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const approvals = await auth.supabase
    .from("hotel_payment_launch_authorizations")
    .select("id,approval_reference,stripe_account_reference,approved_at,expires_at")
    .order("approved_at", { ascending: false })
    .limit(20);
  if (approvals.error) {
    return NextResponse.json(
      { data: buildPaymentReadiness(process.env), evidenceAvailable: false },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  }

  const ids = (approvals.data ?? []).map((item) => item.id);
  const revocations = ids.length > 0
    ? await auth.supabase.from("hotel_payment_launch_authorization_revocations")
      .select("authorization_id,revoked_at")
      .in("authorization_id", ids)
    : { data: [], error: null };
  const revoked = new Map((revocations.data ?? []).map((item) => [item.authorization_id, item.revoked_at]));
  const current = revocations.error ? null : (approvals.data ?? []).map((item): PaymentLaunchAuthorization => ({
    id: item.id,
    approvalReference: item.approval_reference,
    stripeAccountReference: item.stripe_account_reference,
    approvedAt: item.approved_at,
    expiresAt: item.expires_at,
    revokedAt: revoked.get(item.id) ?? null,
  })).find((item) => !item.revokedAt && Date.parse(item.approvedAt) <= Date.now() && Date.parse(item.expiresAt) > Date.now()) ?? null;

  return NextResponse.json(
    { data: buildPaymentReadiness(process.env, current), evidenceAvailable: !revocations.error },
    { headers: { "Cache-Control": "no-store, private" } },
  );
}

export async function POST(request: Request) {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Complete every production payment approval field with valid evidence." }, { status: 400 });
  }
  if (parsed.data.action === "revoke") {
    const { data, error } = await auth.supabase.rpc("revoke_hotel_payment_launch_authorization", {
      p_authorization_id: parsed.data.authorizationId,
      p_revocation_reference: parsed.data.revocationReference,
      p_reason_summary: parsed.data.reasonSummary,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ data, message: "Production payment approval was revoked. Payment flags were not changed." });
  }
  if (Date.parse(parsed.data.expiresAt) <= Date.now()
    || Date.parse(parsed.data.expiresAt) <= Date.parse(parsed.data.approvedAt)) {
    return NextResponse.json({ error: "The production payment approval must expire in the future." }, { status: 400 });
  }

  const { data, error } = await auth.supabase.rpc("record_hotel_payment_launch_authorization", {
    p_approval_reference: parsed.data.approvalReference,
    p_stripe_account_reference: parsed.data.stripeAccountReference,
    p_approved_at: parsed.data.approvedAt,
    p_expires_at: parsed.data.expiresAt,
    p_stripe_account_verified: parsed.data.stripeAccountVerified,
    p_live_charges_capability_verified: parsed.data.liveChargesCapabilityVerified,
    p_live_payouts_capability_verified: parsed.data.livePayoutsCapabilityVerified,
    p_webhook_endpoint_verified: parsed.data.webhookEndpointVerified,
    p_refund_dispute_process_verified: parsed.data.refundDisputeProcessVerified,
    p_support_escalation_verified: parsed.data.supportEscalationVerified,
    p_finance_settlement_verified: parsed.data.financeSettlementVerified,
    p_review_notes: parsed.data.reviewNotes,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ data, message: "Production payment approval evidence recorded. No payment flags were changed." });
}
