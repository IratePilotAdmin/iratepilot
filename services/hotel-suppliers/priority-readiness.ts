export const priorityPmsProviderIds = [
  "oracle-opera",
  "hilton-pep",
  "hilton-onq",
  "marriott-fosse",
  "marriott-fs-pms",
  "hotelkey",
  "oracle-opera-5",
  "infor-hms",
  "agilysys-pms",
  "planet-protel",
  "hotelogix",
  "mews",
  "stayntouch",
  "cloudbeds",
  "sihot",
  "rms-cloud",
  "maestro-pms",
  "shiji-pms",
  "guestline",
  "ezee-absolute",
  "apaleo",
  "clock-pms-plus",
] as const;

export type PriorityPmsProviderId = typeof priorityPmsProviderIds[number];
export type PriorityPmsLaunchStatus =
  | "configuration_required"
  | "configuration_invalid"
  | "vendor_approval_required"
  | "activation_details_required"
  | "property_mapping_required"
  | "sandbox_validation_required"
  | "webhook_validation_required"
  | "production_smoke_required"
  | "activation_required"
  | "live";

export type PriorityPmsLaunchEvidence = {
  vendorApproved?: boolean;
  propertyMapped?: boolean;
  sandboxValidated?: boolean;
  webhookValidated?: boolean;
  productionSmokeValidated?: boolean;
  liveEnabled?: boolean;
  vendorApprovalReference?: string;
  approvedEnvironment?: string;
  propertyCode?: string;
  supportContact?: string;
  verificationNotes?: string;
};

export type PriorityPmsProductionManifest = {
  id: PriorityPmsProviderId;
  name: string;
  requiredEnvironmentKeys: readonly string[];
  optionalEnvironmentKeys: readonly string[];
};

const commonBookingSuffixes = [
  "BASE_URL",
  "API_CREDENTIAL",
  "AVAILABILITY_PATH",
  "CREATE_PATH",
  "GET_PATH",
  "MODIFY_PATH",
  "CANCEL_PATH",
  "VALIDATION_PATH",
  "WEBHOOK_SECRET",
] as const;

const commonOptionalSuffixes = [
  "CREDENTIAL_HEADER",
  "CREDENTIAL_SCHEME",
  "TIMEOUT_MS",
] as const;

function keys(prefix: string, suffixes: readonly string[]) {
  return suffixes.map((suffix) => `${prefix}_${suffix}`);
}

export const priorityPmsProductionManifest: readonly PriorityPmsProductionManifest[] = [
  {
    id: "oracle-opera",
    name: "Oracle OPERA / OPERA Cloud",
    requiredEnvironmentKeys: [
      "PMS_ORACLE_OPERA_BASE_URL",
      "PMS_ORACLE_OPERA_CLIENT_ID",
      "PMS_ORACLE_OPERA_CLIENT_SECRET",
      "PMS_ORACLE_OPERA_APP_KEY",
      "PMS_ORACLE_OPERA_HOTEL_ID",
      "PMS_ORACLE_OPERA_DISTRIBUTION_BASE_URL",
      "PMS_ORACLE_OPERA_DISTRIBUTION_TOKEN_URL",
      "PMS_ORACLE_OPERA_DISTRIBUTION_USERNAME",
      "PMS_ORACLE_OPERA_DISTRIBUTION_PASSWORD",
      "PMS_ORACLE_OPERA_DISTRIBUTION_APP_KEY",
      "PMS_ORACLE_OPERA_DISTRIBUTION_CHANNEL_CODE",
      "PMS_ORACLE_OPERA_WEBHOOK_SECRET",
    ],
    optionalEnvironmentKeys: [
      "PMS_ORACLE_OPERA_TOKEN_URL",
      "PMS_ORACLE_OPERA_TIMEOUT_MS",
      "PMS_ORACLE_OPERA_DISTRIBUTION_ORIGIN",
      "PMS_ORACLE_OPERA_DISTRIBUTION_TIMEOUT_MS",
    ],
  },
  ...([
    ["hilton-pep", "Hilton PEP", "PMS_HILTON_PEP"],
    ["hilton-onq", "Hilton OnQ", "PMS_HILTON_ONQ"],
    ["marriott-fosse", "Marriott FOSSE", "PMS_MARRIOTT_FOSSE"],
    ["marriott-fs-pms", "Marriott FS-PMS", "PMS_MARRIOTT_FS_PMS"],
    ["hotelkey", "HotelKey", "PMS_HOTELKEY"],
  ] as const).map(([id, name, prefix]) => ({
    id,
    name,
    requiredEnvironmentKeys: keys(prefix, commonBookingSuffixes),
    optionalEnvironmentKeys: keys(prefix, commonOptionalSuffixes),
  })),
  {
    id: "oracle-opera-5",
    name: "Oracle OPERA 5",
    requiredEnvironmentKeys: [
      "PMS_OPERA5_BASE_URL", "PMS_OPERA5_AVAILABILITY_PATH", "PMS_OPERA5_AVAILABILITY_SOAP_ACTION",
      "PMS_OPERA5_CREATE_RESERVATION_PATH", "PMS_OPERA5_CREATE_RESERVATION_SOAP_ACTION",
      "PMS_OPERA5_CANCEL_RESERVATION_PATH", "PMS_OPERA5_CANCEL_RESERVATION_SOAP_ACTION", "PMS_OPERA5_CURRENCY",
    ],
    optionalEnvironmentKeys: ["PMS_OPERA5_TIMEOUT_MS", "PMS_OPERA5_BOOKING_SOURCE_CODE"],
  },
  ...([
    ["infor-hms", "Infor HMS", "PMS_INFOR_HMS", "ACCESS_TOKEN"],
    ["agilysys-pms", "Agilysys PMS", "PMS_AGILYSYS", "API_CREDENTIAL"],
    ["planet-protel", "Planet Protel", "PMS_PLANET_PROTEL", "API_CREDENTIAL"],
    ["hotelogix", "Hotelogix", "PMS_HOTELOGIX", "API_KEY"],
  ] as const).map(([id, name, prefix, credential]) => ({
    id,
    name,
    requiredEnvironmentKeys: [
      `${prefix}_BASE_URL`, `${prefix}_${credential}`, `${prefix}_AVAILABILITY_PATH`,
      `${prefix}_CREATE_RESERVATION_PATH`, `${prefix}_CANCEL_RESERVATION_PATH`, `${prefix}_CURRENCY`,
    ],
    optionalEnvironmentKeys: [
      `${prefix}_AUTHORIZATION_HEADER`, `${prefix}_AUTHORIZATION_SCHEME`, `${prefix}_TIMEOUT_MS`,
      `${prefix}_AVAILABILITY_METHOD`, `${prefix}_CREATE_RESERVATION_METHOD`,
      `${prefix}_CANCEL_RESERVATION_METHOD`, `${prefix}_BOOKING_SOURCE_CODE`,
    ],
  })),
  {
    id: "mews",
    name: "Mews",
    requiredEnvironmentKeys: [
      "PMS_MEWS_CLIENT_TOKEN", "PMS_MEWS_ACCESS_TOKEN", "PMS_MEWS_CLIENT", "PMS_MEWS_SERVICE_ID",
      "PMS_MEWS_RESOURCE_CATEGORY_ID", "PMS_MEWS_RATE_ID", "PMS_MEWS_ADULT_AGE_CATEGORY_ID",
    ],
    optionalEnvironmentKeys: [
      "PMS_MEWS_BASE_URL", "PMS_MEWS_TIMEOUT_MS", "PMS_MEWS_CHILD_AGE_CATEGORY_ID",
      "PMS_MEWS_CHECK_IN_TIME", "PMS_MEWS_CHECK_OUT_TIME",
    ],
  },
  {
    id: "stayntouch",
    name: "Stayntouch",
    requiredEnvironmentKeys: ["PMS_STAYNTOUCH_ACCESS_TOKEN", "PMS_STAYNTOUCH_CURRENCY"],
    optionalEnvironmentKeys: [
      "PMS_STAYNTOUCH_BASE_URL", "PMS_STAYNTOUCH_API_VERSION", "PMS_STAYNTOUCH_TIMEOUT_MS",
      "PMS_STAYNTOUCH_BOOKING_ORIGIN_CODE", "PMS_STAYNTOUCH_RESERVATION_TYPE_CODE",
      "PMS_STAYNTOUCH_SOURCE_CODE", "PMS_STAYNTOUCH_MARKET_SEGMENT_CODE",
    ],
  },
  {
    id: "cloudbeds",
    name: "Cloudbeds",
    requiredEnvironmentKeys: ["PMS_CLOUDBEDS_API_KEY", "PMS_CLOUDBEDS_SOURCE_ID"],
    optionalEnvironmentKeys: ["PMS_CLOUDBEDS_BASE_URL", "PMS_CLOUDBEDS_TIMEOUT_MS", "PMS_CLOUDBEDS_PAYMENT_METHOD"],
  },
  {
    id: "sihot",
    name: "SIHOT",
    requiredEnvironmentKeys: [
      "PMS_SIHOT_BASE_URL", "PMS_SIHOT_SECURITY_ID", "PMS_SIHOT_CURRENCY", "PMS_SIHOT_CATEGORIES",
      "PMS_SIHOT_SERVICE_CODES", "PMS_SIHOT_ORDERER_OBJECT_ID", "PMS_SIHOT_RESERVATION_TYPE",
    ],
    optionalEnvironmentKeys: ["PMS_SIHOT_TIMEOUT_MS", "PMS_SIHOT_GUEST_TYPE", "PMS_SIHOT_CANCELLATION_REASON"],
  },
  {
    id: "rms-cloud",
    name: "RMS Cloud",
    requiredEnvironmentKeys: [
      "PMS_RMS_CLOUD_AUTH_TOKEN", "PMS_RMS_CLOUD_CURRENCY", "PMS_RMS_CLOUD_AGENT_ID",
      "PMS_RMS_CLOUD_CATEGORY_IDS", "PMS_RMS_CLOUD_BOOKING_SOURCE_ID", "PMS_RMS_CLOUD_RESERVATION_TYPE_ID",
    ],
    optionalEnvironmentKeys: ["PMS_RMS_CLOUD_BASE_URL", "PMS_RMS_CLOUD_TIMEOUT_MS"],
  },
  ...([
    ["maestro-pms", "Maestro PMS", "PMS_MAESTRO"],
    ["shiji-pms", "Shiji PMS", "PMS_SHIJI"],
    ["guestline", "Guestline", "PMS_GUESTLINE"],
    ["ezee-absolute", "eZee Absolute", "PMS_EZEE_ABSOLUTE"],
  ] as const).map(([id, name, prefix]) => ({
    id,
    name,
    requiredEnvironmentKeys: [
      `${prefix}_BASE_URL`, `${prefix}_ACCESS_TOKEN`, `${prefix}_AVAILABILITY_PATH`,
      `${prefix}_CREATE_RESERVATION_PATH`, `${prefix}_CANCEL_RESERVATION_PATH`, `${prefix}_CURRENCY`,
    ],
    optionalEnvironmentKeys: [
      `${prefix}_TIMEOUT_MS`, `${prefix}_AVAILABILITY_METHOD`, `${prefix}_CREATE_RESERVATION_METHOD`,
      `${prefix}_CANCEL_RESERVATION_METHOD`, `${prefix}_BOOKING_SOURCE_CODE`,
    ],
  })),
  {
    id: "apaleo",
    name: "Apaleo",
    requiredEnvironmentKeys: ["PMS_APALEO_CLIENT_ID", "PMS_APALEO_CLIENT_SECRET"],
    optionalEnvironmentKeys: ["PMS_APALEO_BASE_URL", "PMS_APALEO_IDENTITY_URL", "PMS_APALEO_TIMEOUT_MS"],
  },
  {
    id: "clock-pms-plus",
    name: "Clock PMS+",
    requiredEnvironmentKeys: [
      "PMS_CLOCK_BASE_URL", "PMS_CLOCK_API_USER", "PMS_CLOCK_API_KEY", "PMS_CLOCK_AVAILABILITY_PATH",
      "PMS_CLOCK_CREATE_RESERVATION_PATH", "PMS_CLOCK_CANCEL_RESERVATION_PATH", "PMS_CLOCK_CURRENCY",
    ],
    optionalEnvironmentKeys: [
      "PMS_CLOCK_TIMEOUT_MS", "PMS_CLOCK_AVAILABILITY_METHOD", "PMS_CLOCK_CREATE_RESERVATION_METHOD",
      "PMS_CLOCK_CANCEL_RESERVATION_METHOD", "PMS_CLOCK_BOOKING_SOURCE_CODE",
    ],
  },
];

type Environment = Record<string, string | undefined>;
type EvidenceByProvider = Partial<Record<PriorityPmsProviderId, PriorityPmsLaunchEvidence>>;

const placeholderEvidencePattern = /(?:^|\b)(?:test hotel|example|placeholder|tbd|unknown|n\/a)(?:\b|$)/i;

export function isVerifiedActivationDetail(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 1 && !placeholderEvidencePattern.test(normalized);
}


const operationPathPattern = /_(?:AVAILABILITY|CREATE_RESERVATION|GET_RESERVATION|MODIFY_RESERVATION|CANCEL_RESERVATION|CREATE|GET|MODIFY|CANCEL|VALIDATION)_PATH$/;

function isSecureUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isPositiveNumber(value: string) {
  const result = Number(value);
  return Number.isFinite(result) && result > 0;
}

function isSameOriginOperationPath(
  environment: Environment,
  key: string,
  value: string,
) {
  const baseUrlKey = key.replace(operationPathPattern, "_BASE_URL");
  const baseUrlValue = environment[baseUrlKey]?.trim();
  if (!baseUrlValue) return false;

  try {
    const baseUrl = new URL(baseUrlValue);
    return new URL(value, baseUrl).origin === baseUrl.origin;
  } catch {
    return false;
  }
}

function isValidConfiguredValue(
  environment: Environment,
  key: string,
  value: string,
) {
  if (key.endsWith("_BASE_URL") || key.endsWith("_TOKEN_URL") || key.endsWith("_IDENTITY_URL")) {
    return isSecureUrl(value);
  }
  if (key.endsWith("_TIMEOUT_MS")) return isPositiveNumber(value);
  if (operationPathPattern.test(key)) {
    return isSameOriginOperationPath(environment, key, value);
  }
  return true;
}

export function auditPriorityPmsProductionReadiness(
  environment: Environment,
  evidence: EvidenceByProvider = {},
) {
  return priorityPmsProductionManifest.map((provider) => {
    const missingEnvironmentKeys = provider.requiredEnvironmentKeys.filter(
      (key) => !environment[key]?.trim(),
    );
    const configuredKeys = [
      ...provider.requiredEnvironmentKeys,
      ...provider.optionalEnvironmentKeys,
    ].filter((key) => Boolean(environment[key]?.trim()));
    const invalidEnvironmentKeys = configuredKeys.filter((key) => {
      const value = environment[key]?.trim();
      return value ? !isValidConfiguredValue(environment, key, value) : false;
    });
    const providerEvidence = evidence[provider.id] ?? {};
    const activationChecklist = {
      productionConfigurationValid: missingEnvironmentKeys.length === 0 && invalidEnvironmentKeys.length === 0,
      vendorApprovalDocumented: providerEvidence.vendorApproved === true
        && isVerifiedActivationDetail(providerEvidence.vendorApprovalReference),
      approvedEnvironmentDocumented: isVerifiedActivationDetail(providerEvidence.approvedEnvironment),
      realPropertyCodeDocumented: isVerifiedActivationDetail(providerEvidence.propertyCode),
      supportContactDocumented: isVerifiedActivationDetail(providerEvidence.supportContact),
      propertyMappingConfirmed: providerEvidence.propertyMapped === true,
      sandboxValidationPassed: providerEvidence.sandboxValidated === true,
      webhookValidationPassed: providerEvidence.webhookValidated === true,
      productionSmokePassed: providerEvidence.productionSmokeValidated === true,
      liveTrafficEnabled: providerEvidence.liveEnabled === true,
    };
    const activationDetailsComplete = activationChecklist.vendorApprovalDocumented
      && activationChecklist.approvedEnvironmentDocumented
      && activationChecklist.realPropertyCodeDocumented
      && activationChecklist.supportContactDocumented;
    const readyForRealPropertyActivation = activationChecklist.productionConfigurationValid
      && activationDetailsComplete
      && activationChecklist.propertyMappingConfirmed
      && activationChecklist.sandboxValidationPassed
      && activationChecklist.webhookValidationPassed
      && activationChecklist.productionSmokePassed;
    const status: PriorityPmsLaunchStatus = missingEnvironmentKeys.length > 0
      ? "configuration_required"
      : invalidEnvironmentKeys.length > 0
        ? "configuration_invalid"
        : !providerEvidence.vendorApproved
          ? "vendor_approval_required"
          : !activationDetailsComplete
            ? "activation_details_required"
          : !providerEvidence.propertyMapped
            ? "property_mapping_required"
            : !providerEvidence.sandboxValidated
              ? "sandbox_validation_required"
              : !providerEvidence.webhookValidated
                ? "webhook_validation_required"
                : !providerEvidence.productionSmokeValidated
                  ? "production_smoke_required"
                  : !providerEvidence.liveEnabled
                    ? "activation_required"
                    : "live";

    return {
      id: provider.id,
      name: provider.name,
      status,
      configuredEnvironmentKeys: provider.requiredEnvironmentKeys.filter(
        (key) => Boolean(environment[key]?.trim()),
      ),
      missingEnvironmentKeys,
      invalidEnvironmentKeys,
      activationChecklist,
      readyForRealPropertyActivation,
      evidence: {
        vendorApproved: providerEvidence.vendorApproved === true,
        propertyMapped: providerEvidence.propertyMapped === true,
        sandboxValidated: providerEvidence.sandboxValidated === true,
        webhookValidated: providerEvidence.webhookValidated === true,
        productionSmokeValidated: providerEvidence.productionSmokeValidated === true,
        liveEnabled: providerEvidence.liveEnabled === true,
        vendorApprovalReference: providerEvidence.vendorApprovalReference ?? "",
        approvedEnvironment: providerEvidence.approvedEnvironment ?? "",
        propertyCode: providerEvidence.propertyCode ?? "",
        supportContact: providerEvidence.supportContact ?? "",
        verificationNotes: providerEvidence.verificationNotes ?? "",
      },
    };
  });
}

