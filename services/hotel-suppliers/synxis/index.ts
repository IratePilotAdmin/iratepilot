import {
  isVerifiedPropertyCode,
  isVerifiedProviderEnvironment,
  isVerifiedSupportContact,
  isVerifiedVendorApprovalReference,
} from "../activation-evidence";

export const synxisCrsProvider = {
  id: "sabre-synxis",
  name: "Sabre SynXis Central Reservation System",
  category: "crs",
  capabilities: [
    "product_catalog",
    "rate_push",
    "inventory_push",
    "reservation_delivery",
  ],
} as const;

export const synxisRequiredEnvironmentKeys = [
  "CRS_SYNXIS_BASE_URL",
  "CRS_SYNXIS_USERNAME",
  "CRS_SYNXIS_PASSWORD",
  "CRS_SYNXIS_HOTEL_ID",
  "CRS_SYNXIS_RATE_SOAP_ACTION",
  "CRS_SYNXIS_INVENTORY_SOAP_ACTION",
] as const;

export const synxisOptionalEnvironmentKeys = [
  "CRS_SYNXIS_ENDPOINT_PATH",
  "CRS_SYNXIS_TIMEOUT_MS",
] as const;

export type SynxisReadinessStatus =
  | "configuration_required"
  | "configuration_invalid"
  | "vendor_approval_required"
  | "certification_required"
  | "property_mapping_required"
  | "sandbox_validation_required"
  | "production_smoke_required"
  | "activation_required"
  | "live";

export type SynxisActivationEvidence = {
  vendorApproved?: boolean;
  certificationEnvironmentApproved?: boolean;
  propertyMapped?: boolean;
  sandboxValidated?: boolean;
  productionSmokeValidated?: boolean;
  liveEnabled?: boolean;
};

export type SynxisVerifiedEvidence = SynxisActivationEvidence & {
  vendorApprovalReference?: string;
  approvedEnvironment?: string;
  propertyCode?: string;
  supportContact?: string;
};

export type SynxisReadiness = {
  id: typeof synxisCrsProvider.id;
  category: typeof synxisCrsProvider.category;
  status: SynxisReadinessStatus;
  missingEnvironmentKeys: string[];
  invalidEnvironmentKeys: string[];
  liveTrafficAllowed: boolean;
};

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isPositiveTimeout(value: string) {
  const timeout = Number(value);
  return Number.isInteger(timeout) && timeout >= 1_000 && timeout <= 120_000;
}

function isRelativeEndpoint(value: string) {
  if (!value.startsWith("/")) return false;
  try {
    return new URL(value, "https://synxis.invalid").origin === "https://synxis.invalid";
  } catch {
    return false;
  }
}

export function buildSynxisReadiness(
  environment: Record<string, string | undefined>,
  evidence: SynxisActivationEvidence = {},
): SynxisReadiness {
  const missingEnvironmentKeys = synxisRequiredEnvironmentKeys.filter(
    (key) => !environment[key]?.trim(),
  );
  const invalidEnvironmentKeys: string[] = [];

  const baseUrl = environment.CRS_SYNXIS_BASE_URL?.trim();
  if (baseUrl && !isHttpsUrl(baseUrl)) invalidEnvironmentKeys.push("CRS_SYNXIS_BASE_URL");

  const endpointPath = environment.CRS_SYNXIS_ENDPOINT_PATH?.trim();
  if (endpointPath && !isRelativeEndpoint(endpointPath)) {
    invalidEnvironmentKeys.push("CRS_SYNXIS_ENDPOINT_PATH");
  }

  const timeout = environment.CRS_SYNXIS_TIMEOUT_MS?.trim();
  if (timeout && !isPositiveTimeout(timeout)) {
    invalidEnvironmentKeys.push("CRS_SYNXIS_TIMEOUT_MS");
  }

  let status: SynxisReadinessStatus;
  if (missingEnvironmentKeys.length > 0) status = "configuration_required";
  else if (invalidEnvironmentKeys.length > 0) status = "configuration_invalid";
  else if (!evidence.vendorApproved) status = "vendor_approval_required";
  else if (!evidence.certificationEnvironmentApproved) status = "certification_required";
  else if (!evidence.propertyMapped) status = "property_mapping_required";
  else if (!evidence.sandboxValidated) status = "sandbox_validation_required";
  else if (!evidence.productionSmokeValidated) status = "production_smoke_required";
  else if (!evidence.liveEnabled) status = "activation_required";
  else status = "live";

  return {
    id: synxisCrsProvider.id,
    category: synxisCrsProvider.category,
    status,
    missingEnvironmentKeys: [...missingEnvironmentKeys],
    invalidEnvironmentKeys,
    liveTrafficAllowed: status === "live",
  };
}

export function buildVerifiedSynxisGates(
  environment: Record<string, string | undefined>,
  evidence: SynxisVerifiedEvidence = {},
) {
  const readiness = buildSynxisReadiness(environment, evidence);
  const vendorApproved = evidence.vendorApproved === true
    && isVerifiedVendorApprovalReference(evidence.vendorApprovalReference);
  const certificationEnvironmentApproved = vendorApproved
    && evidence.certificationEnvironmentApproved === true
    && isVerifiedProviderEnvironment(evidence.approvedEnvironment);
  const propertyMapped = certificationEnvironmentApproved
    && evidence.propertyMapped === true
    && isVerifiedPropertyCode(evidence.propertyCode)
    && isVerifiedSupportContact(evidence.supportContact);
  const sandboxValidated = propertyMapped && evidence.sandboxValidated === true;
  const productionConfigurationValid = readiness.missingEnvironmentKeys.length === 0
    && readiness.invalidEnvironmentKeys.length === 0;
  return {
    vendorApproved,
    certificationEnvironmentApproved,
    propertyMapped,
    sandboxValidated,
    productionSmokeValidated: productionConfigurationValid
      && sandboxValidated
      && evidence.productionSmokeValidated === true,
  };
}

export function buildVerifiedSynxisReadiness(
  environment: Record<string, string | undefined>,
  evidence: SynxisVerifiedEvidence = {},
) {
  const verifiedGates = buildVerifiedSynxisGates(environment, evidence);
  return buildSynxisReadiness(environment, {
    ...verifiedGates,
    liveEnabled: verifiedGates.productionSmokeValidated && evidence.liveEnabled === true,
  });
}

export { buildSynxisInventoryXml, buildSynxisRateAmountXml } from "./ari";
export { SynxisSoapTransport, SynxisTransportError } from "./transport";
export type { SynxisInventoryInput, SynxisRateAmountInput } from "./ari";
export type {
  SynxisAriOperation,
  SynxisAuthenticationProfile,
  SynxisCredentials,
  SynxisEnvironment,
  SynxisExecutionJournal,
  SynxisFetch,
  SynxisSoapVersion,
  SynxisTransportConfig,
  SynxisTransportRequest,
  SynxisTrafficAuthorizer,
  SynxisTrafficMode,
} from "./transport";

export { assertSynxisTrafficAuthorized } from "./runtime-gate";
export type { SynxisRuntimeEvidence } from "./runtime-gate";

export { SynxisRequestJournal } from "./request-journal";
export type {
  SynxisAttemptReceipt,
  SynxisJournalRpcClient,
} from "./request-journal";

export {
  parseSynxisAcknowledgement,
  SynxisCertificationClient,
  SynxisRateLimiter,
  synxisOperationIsAri,
} from "./certification";
export type {
  SynxisAcknowledgement,
  SynxisAriTransport,
  SynxisCertificationClientConfig,
  SynxisOperationLimiter,
  SynxisResponseIssue,
} from "./certification";

export {
  createSynxisDistributedRateLimiter,
  SynxisDistributedRateLimiter,
} from "./distributed-rate-limit";
export type { SynxisRateLimitRpcClient } from "./distributed-rate-limit";
