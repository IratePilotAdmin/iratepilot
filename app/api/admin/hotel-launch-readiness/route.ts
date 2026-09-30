import { NextResponse } from "next/server";
import { buildHotelLaunchReadiness } from "@/lib/admin/hotel-launch-readiness";
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
    const commercialStateAvailable = !commercialControls.error && !commercialStates.error;
    const agreementReadyIds = new Set(
      (commercialStates.data ?? [])
        .filter((state: { commercial_agreement_effective?: boolean }) => state.commercial_agreement_effective === true)
        .map((state: { property_id: string }) => state.property_id),
    );
    const reviewReadyIds = new Set(
      (commercialControls.data ?? [])
        .filter((control) => control.listing_scope === "commercial"
          && control.direct_request_mode === "request_only"
          && control.commercial_terms_version === "hotel_partner_fee_disclosure_13_3_2026-08-22_v1"
          && Boolean(control.commercial_verified_at)
          && Boolean(control.commercial_verified_by)
          && Boolean(control.support_contact_email?.trim()))
        .map((control) => control.id),
    );
    const commerciallyReadyHotelCount = propertyIds.filter((id) => agreementReadyIds.has(id) && reviewReadyIds.has(id)).length;

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
    const priorityPmsLiveCount = supplierStateAvailable
      ? auditPriorityPmsProductionReadiness(process.env, evidence).filter(({ status }) => status === "live").length
      : 0;
    const synxisActivationEvidence: SynxisActivationEvidence = {
      vendorApproved: synxisEvidence.data?.vendor_approved ?? false,
      certificationEnvironmentApproved: synxisEvidence.data?.certification_environment_approved ?? false,
      propertyMapped: synxisEvidence.data?.property_mapped ?? false,
      sandboxValidated: synxisEvidence.data?.sandbox_validated ?? false,
      productionSmokeValidated: synxisEvidence.data?.production_smoke_validated ?? false,
      liveEnabled: synxisEvidence.data?.live_enabled ?? false,
    };
    const synxisLiveCount = supplierStateAvailable
      && buildSynxisReadiness(process.env, synxisActivationEvidence).status === "live"
      ? 1
      : 0;
    const liveSupplierCount = priorityPmsLiveCount + synxisLiveCount;

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
      liveSupplierCount,
      supplierStateAvailable,
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
