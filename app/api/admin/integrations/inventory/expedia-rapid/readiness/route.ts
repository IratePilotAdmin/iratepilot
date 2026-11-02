import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { expediaB2cLaunchRequirements } from "@/lib/expedia-rapid/b2c-launch-requirements";
import { buildPaymentReadiness, type PaymentLaunchAuthorization } from "@/lib/admin/payment-readiness";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  evaluateExpediaRapidProductionReadiness,
  expediaRapidProductionCredentialVersion,
} from "@/services/hotel-suppliers/expedia-rapid-production-readiness";

export const dynamic = "force-dynamic";
const noStoreHeaders = { "Cache-Control": "no-store, private" };

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

export async function GET() {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: noStoreHeaders });
  }

  const admin = createAdminClient();
  const [validationResult, receiptResult, approvals] = await Promise.all([
    admin.from("inventory_supplier_validation_evidence")
      .select("validation_kind,environment,configuration_fingerprint")
      .eq("supplier_id", "expedia-rapid")
      .eq("result", "passed")
      .order("tested_at", { ascending: false }),
    admin.from("expedia_b2c_site_review_receipts")
      .select("requirement_code,decision,reviewed_at,id")
      .order("reviewed_at", { ascending: false })
      .order("id", { ascending: false }),
    auth.supabase.from("hotel_payment_launch_authorizations")
      .select("id,approval_reference,stripe_account_reference,approved_at,expires_at")
      .order("approved_at", { ascending: false })
      .limit(20),
  ]);

  if (validationResult.error || receiptResult.error || approvals.error) {
    return NextResponse.json({ error: "Expedia Rapid production readiness evidence could not be loaded." }, {
      status: 503,
      headers: noStoreHeaders,
    });
  }

  const authorizationIds = (approvals.data ?? []).map((item) => item.id);
  const revocations = authorizationIds.length > 0
    ? await auth.supabase.from("hotel_payment_launch_authorization_revocations")
      .select("authorization_id,revoked_at")
      .in("authorization_id", authorizationIds)
    : { data: [], error: null };
  if (revocations.error) {
    return NextResponse.json({ error: "Expedia Rapid payment readiness evidence could not be loaded." }, {
      status: 503,
      headers: noStoreHeaders,
    });
  }

  const revoked = new Map((revocations.data ?? []).map((item) => [item.authorization_id, item.revoked_at]));
  const currentAuthorization = (approvals.data ?? []).map((item): PaymentLaunchAuthorization => ({
    id: item.id,
    approvalReference: item.approval_reference,
    stripeAccountReference: item.stripe_account_reference,
    approvedAt: item.approved_at,
    expiresAt: item.expires_at,
    revokedAt: revoked.get(item.id) ?? null,
  })).find((item) => !item.revokedAt
    && Date.parse(item.approvedAt) <= Date.now()
    && Date.parse(item.expiresAt) > Date.now()) ?? null;

  const latestByRequirement = new Map<string, (typeof receiptResult.data)[number]>();
  for (const receipt of receiptResult.data ?? []) {
    if (!latestByRequirement.has(receipt.requirement_code)) latestByRequirement.set(receipt.requirement_code, receipt);
  }
  const requirementCodes = expediaB2cLaunchRequirements.flatMap((section) =>
    section.requirements.map((requirement) => requirement.code));
  const completedRequirements = requirementCodes.filter((code) => {
    const decision = latestByRequirement.get(code)?.decision;
    return decision === "verified" || decision === "not_applicable";
  });
  const validationEvidence = validationResult.data ?? [];
  const productionCredentialVersion = expediaRapidProductionCredentialVersion(process.env);
  const productionSmokeValidated = Boolean(productionCredentialVersion) && validationEvidence.some((item) =>
    item.environment === "production"
      && item.validation_kind === "production_smoke"
      && item.configuration_fingerprint === productionCredentialVersion);
  const paymentReadiness = buildPaymentReadiness(process.env, currentAuthorization);
  const readiness = evaluateExpediaRapidProductionReadiness(process.env, {
    sandboxSearchValidated: validationEvidence.some((item) =>
      item.environment === "sandbox" && item.validation_kind === "hotel_search"),
    bookingPayloadContractValidated: true,
    siteReviewComplete: completedRequirements.length === requirementCodes.length,
    partnerApproved: enabled(process.env.HOTEL_INVENTORY_EXPEDIA_RAPID_PARTNER_APPROVED),
    paymentLaunchReady: paymentReadiness.productionConfiguration.launchReady,
    productionSmokeValidated,
    liveEnabled: enabled(process.env.HOTEL_INVENTORY_EXPEDIA_RAPID_LIVE_ENABLED),
  });

  return NextResponse.json({
    readiness,
    evidence: {
      completedRequirementCount: completedRequirements.length,
      requiredRequirementCount: requirementCodes.length,
      sandboxSearchValidated: readiness.gates.sandbox_search,
      bookingPayloadContractValidated: true,
      siteReviewComplete: readiness.gates.site_review,
      paymentLaunchReady: readiness.gates.payment_readiness,
      productionSmokeValidated,
    },
  }, { headers: noStoreHeaders });
}
