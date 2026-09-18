import { NextResponse } from "next/server";
import { buildHotelLaunchReadiness } from "@/lib/admin/hotel-launch-readiness";
import { buildPaymentReadiness } from "@/lib/admin/payment-readiness";
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
    const [properties, applications, commercialControls, supplierEvidence, emailBacklog, emailDeadLetters, deliveryFailures, payoutExceptions] = await Promise.all([
      admin.from("properties").select("id,image_url,amenities,rooms(active,inventory(stay_date,available_units))"),
      admin.from("partner_applications").select("id,property_id,status"),
      admin.from("properties").select("id,listing_scope,direct_request_mode,commercial_terms_version,commercial_verified_at,commercial_verified_by,support_contact_email"),
      admin.from("priority_pms_launch_evidence").select("provider_id,vendor_approved,property_mapped,sandbox_validated,webhook_validated,production_smoke_validated,live_enabled,vendor_approval_reference,approved_environment,property_code,support_contact,verification_notes"),
      count("email_outbox", "status", ["pending", "failed", "processing"]),
      count("email_outbox", "status", ["dead_letter"]),
      count("email_delivery_events", "processing_status", ["failed"]),
      count("booking_financials", "stripe_transfer_status", ["pending", "failed"]),
    ]);
    if (properties.error || applications.error || commercialControls.error) {
      throw properties.error ?? applications.error ?? commercialControls.error;
    }

    const approvedPropertyIds = new Set(
      (applications.data ?? [])
        .filter((application) => application.status === "approved" && application.property_id)
        .map((application) => application.property_id as string),
    );
    const inventoryReadyPropertyIds = new Set(
      (properties.data ?? [])
        .filter((property) => approvedPropertyIds.has(property.id)
          && getPropertyReadiness(property as PropertyReadinessInput).ready)
        .map((property) => property.id),
    );

    const propertyIds = [...inventoryReadyPropertyIds];
    const commercialStates = propertyIds.length > 0
      ? await admin.rpc("get_hotel_commercial_agreement_admin_state", { p_property_ids: propertyIds })
      : { data: [], error: null };
    const commercialStateAvailable = !commercialStates.error;
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

    const supplierStateAvailable = !supplierEvidence.error;
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
    const liveSupplierCount = supplierStateAvailable
      ? auditPriorityPmsProductionReadiness(process.env, evidence).filter(({ status }) => status === "live").length
      : 0;

    const operationsStateAvailable = !emailBacklog.error
      && !emailDeadLetters.error
      && !deliveryFailures.error
      && !payoutExceptions.error;
    const operationsReady = operationsStateAvailable
      && (emailBacklog.count ?? 0) === 0
      && (emailDeadLetters.count ?? 0) === 0
      && (deliveryFailures.count ?? 0) === 0
      && (payoutExceptions.count ?? 0) === 0
      && isEmailWorkerEnabled();

    return NextResponse.json(buildHotelLaunchReadiness({
      approvedHotelCount: approvedPropertyIds.size,
      inventoryReadyHotelCount: inventoryReadyPropertyIds.size,
      commerciallyReadyHotelCount,
      commercialStateAvailable,
      liveSupplierCount,
      supplierStateAvailable,
      paymentConfigurationReady: buildPaymentReadiness(process.env).productionConfiguration.ready,
      operationsReady,
      operationsStateAvailable,
      publicationEnabled: isHotelPublicationEnabled(),
    }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Hotel launch readiness failed", error);
    return NextResponse.json({ error: "Hotel launch readiness could not be verified." }, { status: 503 });
  }
}
