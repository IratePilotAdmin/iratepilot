import { createHmac } from "node:crypto";

export type ExpediaRapidProductionEvidence = {
  sandboxSearchValidated?: boolean;
  bookingPayloadContractValidated?: boolean;
  siteReviewComplete?: boolean;
  partnerApproved?: boolean;
  paymentLaunchReady?: boolean;
  productionSmokeValidated?: boolean;
  liveEnabled?: boolean;
};

export type ExpediaRapidLaunchGate =
  | "sandbox_credentials"
  | "sandbox_search"
  | "booking_payload_contract"
  | "site_review"
  | "partner_approval"
  | "production_credentials"
  | "payment_readiness"
  | "production_smoke"
  | "live_activation"
  | "live";

type Environment = Record<string, string | undefined>;

function configured(environment: Environment, key: string, minimumLength: number) {
  const value = environment[key]?.trim() ?? "";
  return value.length >= minimumLength
    && !/^(?:changeme|example|placeholder|test|todo|unknown)$/i.test(value);
}

export function expediaRapidProductionConfigurationFingerprint(environment: Environment) {
  if (!configured(environment, "HOTEL_INVENTORY_EXPEDIA_RAPID_PRODUCTION_API_KEY", 3)
    || !configured(environment, "HOTEL_INVENTORY_EXPEDIA_RAPID_PRODUCTION_SHARED_SECRET", 8)) return null;
  return createHmac(
    "sha256",
    environment.HOTEL_INVENTORY_EXPEDIA_RAPID_PRODUCTION_SHARED_SECRET!.trim(),
  ).update(environment.HOTEL_INVENTORY_EXPEDIA_RAPID_PRODUCTION_API_KEY!.trim()).digest("hex");
}

export function evaluateExpediaRapidProductionReadiness(
  environment: Environment,
  evidence: ExpediaRapidProductionEvidence = {},
) {
  const sandboxApiKey = environment.HOTEL_INVENTORY_EXPEDIA_RAPID_API_KEY?.trim() ?? "";
  const sandboxSecret = environment.HOTEL_INVENTORY_EXPEDIA_RAPID_SHARED_SECRET?.trim() ?? "";
  const productionApiKey = environment.HOTEL_INVENTORY_EXPEDIA_RAPID_PRODUCTION_API_KEY?.trim() ?? "";
  const productionSecret = environment.HOTEL_INVENTORY_EXPEDIA_RAPID_PRODUCTION_SHARED_SECRET?.trim() ?? "";
  const sandboxCredentialsReady = configured(environment, "HOTEL_INVENTORY_EXPEDIA_RAPID_API_KEY", 3)
    && configured(environment, "HOTEL_INVENTORY_EXPEDIA_RAPID_SHARED_SECRET", 8)
    && environment.HOTEL_INVENTORY_EXPEDIA_RAPID_SANDBOX_ENABLED?.trim().toLowerCase() === "true";
  const productionCredentialsReady = configured(
    environment,
    "HOTEL_INVENTORY_EXPEDIA_RAPID_PRODUCTION_API_KEY",
    3,
  ) && configured(environment, "HOTEL_INVENTORY_EXPEDIA_RAPID_PRODUCTION_SHARED_SECRET", 8)
    && (productionApiKey !== sandboxApiKey || productionSecret !== sandboxSecret);

  const orderedGates: readonly [ExpediaRapidLaunchGate, boolean][] = [
    ["sandbox_credentials", sandboxCredentialsReady],
    ["sandbox_search", evidence.sandboxSearchValidated === true],
    ["booking_payload_contract", evidence.bookingPayloadContractValidated === true],
    ["site_review", evidence.siteReviewComplete === true],
    ["partner_approval", evidence.partnerApproved === true],
    ["production_credentials", productionCredentialsReady],
    ["payment_readiness", evidence.paymentLaunchReady === true],
    ["production_smoke", evidence.productionSmokeValidated === true],
    ["live_activation", evidence.liveEnabled === true],
  ];
  const nextGate = orderedGates.find(([, passed]) => !passed)?.[0] ?? "live";

  return {
    nextGate,
    readyForLiveBooking: nextGate === "live",
    sandboxCredentialsReady,
    productionCredentialsReady,
    gates: Object.fromEntries(orderedGates),
  };
}

