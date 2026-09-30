import { NextResponse } from "next/server";
import { buildHotelLaunchReadiness, selectClosestSupplierCandidate } from "@/lib/admin/hotel-launch-readiness";
import { buildPaymentReadiness } from "@/lib/admin/payment-readiness";
import type { PaymentLaunchAuthorization } from "@/lib/admin/payment-readiness";
import { requireRole } from "@/lib/auth/require-role";
import { isEmailWorkerEnabled } from "@/lib/email/worker-gate";
import { isHotelPublicationEnabled } from "@/lib/hotels/publication-gate";
import { getPropertyReadiness, type PropertyReadinessInput } from "@/lib/property-readiness";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  auditPriorityPmsProductionReadiness,
  type PriorityPmsLaunchEvidence,
  type PriorityPmsProviderId,
} from "@/services/hotel-suppliers";
import { buildSynxisReadiness, type SynxisActivationEvidence } from "@/services/hotel-suppliers/synxis";

export const dynamic = "force-dynamic";

type CommercialReviewEvidence = {
  id: string;
  property_id: string;
  commercial_agreement_evidence_id: string;
  reviewer_id: string;
  commercial_terms_version: string;
  support_contact_email: string;
  legal_business_verified: boolean;
  sole_owner_conflict_acknowledged: boolean;
  commercial_terms_evidence_verified: boolean;
  support_contact_verified: boolean;
  created_at: string;
};

export async function GET() {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const admin = createAdminClient();
    const count = (table: string, column: string, values: string[]) => admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .in(column, values);
    const verifiedApprovalCount = (linkedToProperty: boolean) => {
      let query = auth.supabase.from("partner_application_review_evidence")
        .select("application_id,partner_applications!inner(id)", { count: "exact", head: true })
        .eq("decision", "approved")
        .eq("legal_business_verified", true)
        .eq("representative_authority_verified", true)
        .eq("content_rights_verified", true)
        .eq("commercial_terms_acknowledgement_verified", true)
        .eq("inactive_draft_scope_confirmed", true)
        .eq("partner_applications.status", "approved");
      if (linkedToProperty) query = query.not("partner_applications.property_id", "is", null);
      return query;
    };
    const [properties, applications, applicationApprovalEvidence, applicationTotal, pendingApplications, declinedApplications, verifiedApprovals, verifiedLinkedApprovals, commercialControls, supplierEvidence, synxisEvidence, emailBacklog, emailDeadLetters, deliveryFailures, payoutExceptions, paymentApprovals, paymentRevocations] = await Promise.all([
      admin.from("properties").select("id,image_url,amenities,rooms(active,base_rate,max_guests,direct_rate_plan_code,direct_rate_plan_name,direct_currency_code,direct_cancellation_policy,direct_cancellation_policy_version,inventory(stay_date,available_units,rate,direct_tax_amount,direct_mandatory_fee_amount))"),
      admin.from("partner_applications").select("id,property_id,status"),
      auth.supabase.from("partner_application_review_evidence")
        .select("application_id,decision,legal_business_verified,representative_authority_verified,content_rights_verified,commercial_terms_acknowledgement_verified,inactive_draft_scope_confirmed"),
      admin.from("partner_applications").select("id", { count: "exact", head: true }),
      count("partner_applications", "status", ["pending"]),
      count("partner_applications", "status", ["declined"]),
      verifiedApprovalCount(false),
      verifiedApprovalCount(true),
      auth.supabase.from("properties").select("id,listing_scope,direct_request_mode,commercial_terms_version,commercial_verified_at,commercial_verified_by,support_contact_email"),
      admin.from("priority_pms_launch_evidence").select("provider_id,vendor_approved,property_mapped,sandbox_validated,webhook_validated,production_smoke_validated,live_enabled,vendor_approval_reference,approved_environment,property_code,support_contact,verification_notes"),
      admin.from("synxis_crs_launch_evidence").select("vendor_approved,certification_environment_approved,property_mapped,sandbox_validated,production_smoke_validated,live_enabled").eq("provider_id", "sabre-synxis").maybeSingle(),
      count("email_outbox", "status", ["pending", "failed", "processing"]),
      count("email_outbox", "status", ["dead_letter"]),
      count("email_delivery_events", "processing_status", ["failed"]),
      count("booking_financials", "stripe_transfer_status", ["pending", "failed"]),
      auth.supabase.from("hotel_payment_launch_authorizations")
        .select("id,approval_reference,stripe_account_reference,approved_at,expires_at")
        .order("approved_at", { ascending: false }).limit(20),
      auth.supabase.from("hotel_payment_launch_authorization_revocations")
        .select("authorization_id,revoked_at"),
    ]);
    if (properties.error || applications.error) {
      throw properties.error ?? applications.error;
    }

    const approvedHotelStateAvailable = !applicationApprovalEvidence.error
      && !applicationTotal.error
      && !pendingApplications.error
      && !declinedApplications.error
      && !verifiedApprovals.error
      && !verifiedLinkedApprovals.error
      && typeof applicationTotal.count === "number"
      && typeof pendingApplications.count === "number"
      && typeof declinedApplications.count === "number"
      && typeof verifiedApprovals.count === "number"
      && typeof verifiedLinkedApprovals.count === "number";
    const verifiedApprovalApplicationIds = new Set(
      (applicationApprovalEvidence.data ?? [])
        .filter((evidence) => evidence.decision === "approved"
          && evidence.legal_business_verified
          && evidence.representative_authority_verified
          && evidence.content_rights_verified
          && evidence.commercial_terms_acknowledgement_verified
          && evidence.inactive_draft_scope_confirmed)
        .map((evidence) => evidence.application_id),
    );
    const approvedPropertyIds = new Set(
      (applications.data ?? [])
        .filter((application) => application.status === "approved"
          && application.property_id
          && verifiedApprovalApplicationIds.has(application.id))
        .map((application) => application.property_id as string),
    );
    const hotelApplicationCount = applicationTotal.count ?? 0;
    const pendingHotelApplicationCount = pendingApplications.count ?? 0;
    const declinedHotelApplicationCount = declinedApplications.count ?? 0;
    const verifiedHotelApprovalCount = verifiedApprovals.count ?? 0;
    const approvedPropertyReadiness =
      (properties.data ?? [])
        .filter((property) => approvedPropertyIds.has(property.id))
        .map((property) => ({ id: property.id, readiness: getPropertyReadiness(property as PropertyReadinessInput) }));
    const inventoryReadyPropertyIds = new Set(
      approvedPropertyReadiness.filter(({ readiness }) => readiness.ready).map(({ id }) => id),
    );
    const closestListingCandidate = approvedPropertyReadiness
      .map(({ readiness }) => readiness)
      .sort((left, right) =>
        Object.values(right.requirements).filter(Boolean).length - Object.values(left.requirements).filter(Boolean).length)[0];
    const listingChecks = [
      { label: "Safe primary photo", passed: closestListingCandidate?.requirements.primaryPhoto ?? false },
      { label: "Property amenities", passed: closestListingCandidate?.requirements.amenities ?? false },
      { label: "Active room type", passed: closestListingCandidate?.requirements.activeRoom ?? false },
      { label: "Room rate plan and cancellation terms", passed: closestListingCandidate?.requirements.roomTerms ?? false },
      { label: "Future inventory with taxes and mandatory fees", passed: closestListingCandidate?.requirements.futureInventory ?? false },
    ];

    const propertyIds = [...inventoryReadyPropertyIds];
    const commercialStates = propertyIds.length > 0
      ? await auth.supabase.rpc("get_hotel_commercial_agreement_admin_state", { p_property_ids: propertyIds })
      : { data: [], error: null };
    const currentEvidenceIds = (commercialStates.data ?? [])
      .map((state: { current_evidence_id?: string | null }) => state.current_evidence_id)
      .filter((id: string | null | undefined): id is string => Boolean(id));
    const commercialReviews = currentEvidenceIds.length > 0
      ? await auth.supabase.from("property_commercial_review_evidence")
        .select("id,property_id,commercial_agreement_evidence_id,reviewer_id,commercial_terms_version,support_contact_email,legal_business_verified,sole_owner_conflict_acknowledged,commercial_terms_evidence_verified,support_contact_verified,created_at")
        .in("commercial_agreement_evidence_id", currentEvidenceIds)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
      : { data: [], error: null };
    const commercialStateAvailable = !commercialControls.error && !commercialStates.error && !commercialReviews.error;
    const agreementReadyIds = new Set(
      (commercialStates.data ?? [])
        .filter((state: { commercial_agreement_effective?: boolean }) => state.commercial_agreement_effective === true)
        .map((state: { property_id: string }) => state.property_id),
    );
    const commercialStateByProperty = new Map<string, { property_id: string; current_evidence_id?: string | null; commercial_agreement_effective?: boolean }>(
      (commercialStates.data ?? []).map((state: { property_id: string; current_evidence_id?: string | null; commercial_agreement_effective?: boolean }) => [state.property_id, state]),
    );
    const commercialControlByProperty = new Map((commercialControls.data ?? []).map((control) => [control.id, control]));
    const currentReviewByEvidence = new Map<string, CommercialReviewEvidence>();
    for (const review of (commercialReviews.data ?? []) as CommercialReviewEvidence[]) {
      if (!currentReviewByEvidence.has(review.commercial_agreement_evidence_id)) {
        currentReviewByEvidence.set(review.commercial_agreement_evidence_id, review);
      }
    }
    const hasCurrentAccountableReview = (propertyId: string) => {
      const state = commercialStateByProperty.get(propertyId);
      const control = commercialControlByProperty.get(propertyId);
      const evidenceId = state?.current_evidence_id;
      const review = evidenceId ? currentReviewByEvidence.get(evidenceId) : undefined;
      return Boolean(review
        && review.property_id === propertyId
        && review.reviewer_id === control?.commercial_verified_by
        && review.created_at === control?.commercial_verified_at
        && review.commercial_terms_version === control?.commercial_terms_version
        && review.support_contact_email.trim().toLowerCase() === control?.support_contact_email?.trim().toLowerCase()
        && review.legal_business_verified
        && review.sole_owner_conflict_acknowledged
        && review.commercial_terms_evidence_verified
        && review.support_contact_verified);
    };
    const reviewReadyIds = new Set(
      propertyIds.filter((propertyId) => {
        const control = commercialControlByProperty.get(propertyId);
        return control?.listing_scope === "commercial"
          && control.direct_request_mode === "request_only"
          && control.commercial_terms_version === "hotel_partner_fee_disclosure_13_3_2026-08-22_v1"
          && Boolean(control.support_contact_email?.trim())
          && hasCurrentAccountableReview(propertyId);
      }),
    );
    const commerciallyReadyHotelCount = propertyIds.filter((id) => agreementReadyIds.has(id) && reviewReadyIds.has(id)).length;
    const closestCommercialCandidate = propertyIds
      .map((propertyId) => {
        const state = commercialStateByProperty.get(propertyId);
        const control = commercialControlByProperty.get(propertyId);
        const checks = [
          state?.commercial_agreement_effective === true,
          control?.listing_scope === "commercial",
          control?.direct_request_mode === "request_only",
          control?.commercial_terms_version === "hotel_partner_fee_disclosure_13_3_2026-08-22_v1",
          hasCurrentAccountableReview(propertyId),
          Boolean(control?.support_contact_email?.trim()),
        ];
        return { checks, score: checks.filter(Boolean).length };
      })
      .sort((left, right) => right.score - left.score)[0];
    const commercialChecks = [
      { label: "Effective executed hotel agreement", passed: closestCommercialCandidate?.checks[0] ?? false },
      { label: "Commercial listing scope", passed: closestCommercialCandidate?.checks[1] ?? false },
      { label: "Request-only booking mode", passed: closestCommercialCandidate?.checks[2] ?? false },
      { label: "Current 13% + 3% fee disclosure", passed: closestCommercialCandidate?.checks[3] ?? false },
      { label: "Accountable commercial verification", passed: closestCommercialCandidate?.checks[4] ?? false },
      { label: "Hotel support contact", passed: closestCommercialCandidate?.checks[5] ?? false },
    ];

    const supplierStateAvailable = !supplierEvidence.error && !synxisEvidence.error;
    const evidence = Object.fromEntries((supplierEvidence.data ?? []).map((item) => [item.provider_id, {
      vendorApproved: item.vendor_approved,
      propertyMapped: item.property_mapped,
      sandboxValidated: item.sandbox_validated,
      webhookValidated: item.webhook_validated,
      productionSmokeValidated: item.production_smoke_validated,
      liveEnabled: item.live_enabled,
      vendorApprovalReference: item.vendor_approval_reference ?? "",
      approvedEnvironment: item.approved_environment ?? "",
      propertyCode: item.property_code ?? "",
      supportContact: item.support_contact ?? "",
      verificationNotes: item.verification_notes ?? "",
    }])) as Partial<Record<PriorityPmsProviderId, PriorityPmsLaunchEvidence>>;
    const priorityPmsReadiness = auditPriorityPmsProductionReadiness(process.env, evidence);
    const priorityPmsLiveCount = supplierStateAvailable
      ? priorityPmsReadiness.filter(({ status }) => status === "live").length
      : 0;
    const synxisActivationEvidence: SynxisActivationEvidence = {
      vendorApproved: synxisEvidence.data?.vendor_approved ?? false,
      certificationEnvironmentApproved: synxisEvidence.data?.certification_environment_approved ?? false,
      propertyMapped: synxisEvidence.data?.property_mapped ?? false,
      sandboxValidated: synxisEvidence.data?.sandbox_validated ?? false,
      productionSmokeValidated: synxisEvidence.data?.production_smoke_validated ?? false,
      liveEnabled: synxisEvidence.data?.live_enabled ?? false,
    };
    const synxisReadiness = buildSynxisReadiness(process.env, synxisActivationEvidence);
    const synxisLiveCount = supplierStateAvailable
      && synxisReadiness.status === "live"
      ? 1
      : 0;
    const liveSupplierCount = priorityPmsLiveCount + synxisLiveCount;
    const supplierCandidates = [
      ...priorityPmsReadiness.map((provider) => ({
        name: provider.name,
        live: provider.status === "live",
        checks: [
          { label: "Production configuration", passed: provider.activationChecklist.productionConfigurationValid },
          { label: "Vendor approval", passed: provider.activationChecklist.vendorApprovalDocumented },
          { label: "Approved provider environment", passed: provider.activationChecklist.approvedEnvironmentDocumented },
          { label: "Real property code", passed: provider.activationChecklist.realPropertyCodeDocumented },
          { label: "Provider support contact", passed: provider.activationChecklist.supportContactDocumented },
          { label: "Property mapping", passed: provider.activationChecklist.propertyMappingConfirmed },
          { label: "Sandbox validation", passed: provider.activationChecklist.sandboxValidationPassed },
          { label: "Webhook validation", passed: provider.activationChecklist.webhookValidationPassed },
          { label: "Production smoke test", passed: provider.activationChecklist.productionSmokePassed },
          { label: "Live supplier traffic", passed: provider.activationChecklist.liveTrafficEnabled },
        ],
      })),
      {
        name: "Sabre SynXis Central Reservation System",
        live: synxisReadiness.status === "live",
        checks: [
          { label: "Production configuration", passed: synxisReadiness.missingEnvironmentKeys.length === 0 && synxisReadiness.invalidEnvironmentKeys.length === 0 },
          { label: "Vendor approval", passed: synxisActivationEvidence.vendorApproved === true },
          { label: "Certification environment", passed: synxisActivationEvidence.certificationEnvironmentApproved === true },
          { label: "Property mapping", passed: synxisActivationEvidence.propertyMapped === true },
          { label: "Sandbox validation", passed: synxisActivationEvidence.sandboxValidated === true },
          { label: "Production smoke test", passed: synxisActivationEvidence.productionSmokeValidated === true },
          { label: "Live supplier traffic", passed: synxisActivationEvidence.liveEnabled === true },
        ],
      },
    ];
    const closestSupplierCandidate = selectClosestSupplierCandidate(supplierCandidates);
    const supplierChecks = closestSupplierCandidate ? [
      { label: "Closest production connector", passed: closestSupplierCandidate.live, value: closestSupplierCandidate.name },
      ...closestSupplierCandidate.checks,
    ] : [];

    const operationsStateAvailable = !emailBacklog.error
      && !emailDeadLetters.error
      && !deliveryFailures.error
      && !payoutExceptions.error
      && typeof emailBacklog.count === "number"
      && typeof emailDeadLetters.count === "number"
      && typeof deliveryFailures.count === "number"
      && typeof payoutExceptions.count === "number";
    const emailWorkerEnabled = isEmailWorkerEnabled();
    const emailBacklogCount = emailBacklog.count ?? 0;
    const emailDeadLetterCount = emailDeadLetters.count ?? 0;
    const deliveryFailureCount = deliveryFailures.count ?? 0;
    const payoutExceptionCount = payoutExceptions.count ?? 0;
    const operationsReady = operationsStateAvailable
      && emailBacklogCount === 0
      && emailDeadLetterCount === 0
      && deliveryFailureCount === 0
      && payoutExceptionCount === 0
      && emailWorkerEnabled;

    const paymentAuthorizationStateAvailable = !paymentApprovals.error && !paymentRevocations.error;
    const revokedPaymentApprovals = new Map((paymentRevocations.data ?? []).map((item) => [item.authorization_id, item.revoked_at]));
    const currentPaymentAuthorization = paymentAuthorizationStateAvailable
      ? (paymentApprovals.data ?? []).map((item): PaymentLaunchAuthorization => ({
        id: item.id,
        approvalReference: item.approval_reference,
        stripeAccountReference: item.stripe_account_reference,
        approvedAt: item.approved_at,
        expiresAt: item.expires_at,
        revokedAt: revokedPaymentApprovals.get(item.id) ?? null,
      })).find((item) => !item.revokedAt && Date.parse(item.approvedAt) <= Date.now() && Date.parse(item.expiresAt) > Date.now()) ?? null
      : null;
    const paymentReadiness = buildPaymentReadiness(process.env, currentPaymentAuthorization);

    return NextResponse.json(buildHotelLaunchReadiness({
      approvedHotelCount: verifiedLinkedApprovals.count ?? 0,
      approvedHotelStateAvailable,
      hotelApplicationCount,
      pendingHotelApplicationCount,
      declinedHotelApplicationCount,
      verifiedHotelApprovalCount,
      inventoryReadyHotelCount: inventoryReadyPropertyIds.size,
      listingStateAvailable: approvedHotelStateAvailable,
      listingCandidateAvailable: Boolean(closestListingCandidate),
      listingChecks,
      commerciallyReadyHotelCount,
      commercialStateAvailable,
      commercialCandidateAvailable: propertyIds.length > 0,
      commercialChecks,
      liveSupplierCount,
      supplierStateAvailable,
      supplierChecks,
      paymentConfigurationReady: paymentReadiness.productionConfiguration.ready,
      paymentAuthorizationValid: paymentReadiness.productionConfiguration.launchAuthorized,
      paymentAuthorizationStateAvailable,
      paymentChecks: paymentReadiness.productionConfiguration.checks.map(({ label, passed }) => ({ label, passed })),
      operationsReady,
      operationsStateAvailable,
      emailWorkerEnabled,
      emailBacklogCount,
      emailDeadLetterCount,
      deliveryFailureCount,
      payoutExceptionCount,
      publicationEnabled: isHotelPublicationEnabled(),
    }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Hotel launch readiness failed", error);
    return NextResponse.json({ error: "Hotel launch readiness could not be verified." }, { status: 503 });
  }
}
