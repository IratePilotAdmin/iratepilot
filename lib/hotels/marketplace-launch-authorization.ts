import { buildPaymentReadiness } from "../admin/payment-readiness";
import { isEmailWorkerEnabled } from "../email/worker-gate";
import { isHotelPublicationEnabled } from "./publication-gate";
import { hasCurrentHotelMarketplaceReleaseAuthorization } from "./marketplace-release-authorization";
import { createAdminClient } from "../supabase/admin";
import { hasCurrentLivePaymentAuthorization } from "../stripe/live-payment-authorization";
import {
  auditPriorityPmsProductionReadiness,
  type PriorityPmsLaunchEvidence,
  type PriorityPmsProviderId,
} from "../../services/hotel-suppliers/priority-readiness";
import { buildVerifiedSynxisReadiness, type SynxisVerifiedEvidence } from "../../services/hotel-suppliers/synxis";

type MarketplaceLaunchEvidence = {
  releaseAuthorizationValid: boolean;
  paymentAuthorizationValid: boolean;
  hotelCommerceStateAvailable: boolean;
  commercialHotelInventoryReady: boolean;
  supplierStateAvailable: boolean;
  priorityPmsEvidence: Partial<Record<PriorityPmsProviderId, PriorityPmsLaunchEvidence>>;
  synxisEvidence: SynxisVerifiedEvidence;
  operationsStateAvailable: boolean;
  emailBacklog: number;
  emailDeadLetters: number;
  deliveryFailures: number;
  payoutExceptions: number;
};

type MarketplaceLaunchAuthorizationOptions = {
  allowPayoutExceptionsForReconciliation?: boolean;
  allowUnavailableCommercialInventoryForPublication?: boolean;
};

export function evaluateHotelMarketplaceLaunchAuthorization(
  env: Record<string, string | undefined>,
  evidence: MarketplaceLaunchEvidence,
  options: MarketplaceLaunchAuthorizationOptions = {},
) {
  if (!isHotelPublicationEnabled(env) || !isEmailWorkerEnabled(env.EMAIL_WORKER_ENABLED)) return false;
  if (!evidence.releaseAuthorizationValid
    || !evidence.paymentAuthorizationValid
    || !evidence.supplierStateAvailable
    || !evidence.operationsStateAvailable) return false;
  if (!options.allowPayoutExceptionsForReconciliation && !evidence.hotelCommerceStateAvailable) return false;
  if (!options.allowPayoutExceptionsForReconciliation
    && !options.allowUnavailableCommercialInventoryForPublication
    && !evidence.commercialHotelInventoryReady) return false;
  if (!buildPaymentReadiness(env).productionConfiguration.ready) return false;
  if (evidence.emailBacklog !== 0
    || evidence.emailDeadLetters !== 0
    || evidence.deliveryFailures !== 0) return false;
  if (!options.allowPayoutExceptionsForReconciliation && evidence.payoutExceptions !== 0) return false;

  const priorityPmsLive = auditPriorityPmsProductionReadiness(env, evidence.priorityPmsEvidence)
    .some(({ status }) => status === "live");
  const synxisLive = buildVerifiedSynxisReadiness(env, evidence.synxisEvidence).status === "live";
  return priorityPmsLive || synxisLive;
}

async function verifyHotelMarketplaceLaunchAuthorization(
  env: Record<string, string | undefined>,
  options: MarketplaceLaunchAuthorizationOptions,
) {
  if (!isHotelPublicationEnabled(env)) return false;

  try {
    const admin = createAdminClient();
    const count = (table: string, column: string, values: string[]) => admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .in(column, values);
    const [releaseAuthorizationValid, paymentAuthorizationValid, commercialHotelInventory, supplierEvidence, synxisEvidence, emailBacklog, emailDeadLetters, deliveryFailures, payoutExceptions] = await Promise.all([
      hasCurrentHotelMarketplaceReleaseAuthorization(admin),
      hasCurrentLivePaymentAuthorization(admin),
      admin.rpc("has_current_commercial_hotel_inventory"),
      admin.from("priority_pms_launch_evidence").select("provider_id,vendor_approved,property_mapped,sandbox_validated,webhook_validated,production_smoke_validated,live_enabled,vendor_approval_reference,approved_environment,property_code,support_contact,verification_notes"),
      admin.from("synxis_crs_launch_evidence").select("vendor_approved,certification_environment_approved,property_mapped,sandbox_validated,production_smoke_validated,live_enabled,vendor_approval_reference,approved_environment,property_code,support_contact").eq("provider_id", "sabre-synxis").maybeSingle(),
      count("email_outbox", "status", ["pending", "failed", "processing"]),
      count("email_outbox", "status", ["dead_letter"]),
      count("email_delivery_events", "processing_status", ["failed"]),
      count("booking_financials", "stripe_transfer_status", ["pending", "failed"]),
    ]);

    const priorityPmsEvidence = Object.fromEntries((supplierEvidence.data ?? []).map((item) => [item.provider_id, {
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

    return evaluateHotelMarketplaceLaunchAuthorization(env, {
      releaseAuthorizationValid,
      paymentAuthorizationValid,
      hotelCommerceStateAvailable: !commercialHotelInventory.error
        && typeof commercialHotelInventory.data === "boolean",
      commercialHotelInventoryReady: commercialHotelInventory.data === true,
      supplierStateAvailable: !supplierEvidence.error && !synxisEvidence.error,
      priorityPmsEvidence,
      synxisEvidence: {
        vendorApproved: synxisEvidence.data?.vendor_approved ?? false,
        certificationEnvironmentApproved: synxisEvidence.data?.certification_environment_approved ?? false,
        propertyMapped: synxisEvidence.data?.property_mapped ?? false,
        sandboxValidated: synxisEvidence.data?.sandbox_validated ?? false,
        productionSmokeValidated: synxisEvidence.data?.production_smoke_validated ?? false,
        liveEnabled: synxisEvidence.data?.live_enabled ?? false,
        vendorApprovalReference: synxisEvidence.data?.vendor_approval_reference ?? "",
        approvedEnvironment: synxisEvidence.data?.approved_environment ?? "",
        propertyCode: synxisEvidence.data?.property_code ?? "",
        supportContact: synxisEvidence.data?.support_contact ?? "",
      },
      operationsStateAvailable: !emailBacklog.error
        && !emailDeadLetters.error
        && !deliveryFailures.error
        && !payoutExceptions.error
        && emailBacklog.count !== null
        && emailDeadLetters.count !== null
        && deliveryFailures.count !== null
        && payoutExceptions.count !== null,
      emailBacklog: emailBacklog.count ?? 0,
      emailDeadLetters: emailDeadLetters.count ?? 0,
      deliveryFailures: deliveryFailures.count ?? 0,
      payoutExceptions: payoutExceptions.count ?? 0,
    }, options);
  } catch {
    return false;
  }
}

export function isHotelMarketplaceLaunchAuthorized(
  env: Record<string, string | undefined> = process.env,
) {
  return verifyHotelMarketplaceLaunchAuthorization(env, {});
}

export function isHotelMarketplacePayoutReconciliationAuthorized(
  env: Record<string, string | undefined> = process.env,
) {
  return verifyHotelMarketplaceLaunchAuthorization(env, {
    allowPayoutExceptionsForReconciliation: true,
  });
}

export function isHotelMarketplacePublicationAuthorized(
  env: Record<string, string | undefined> = process.env,
) {
  return verifyHotelMarketplaceLaunchAuthorization(env, {
    allowUnavailableCommercialInventoryForPublication: true,
  });
}
