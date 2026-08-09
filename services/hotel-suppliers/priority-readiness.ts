export const priorityPmsProviderIds = [
  "oracle-opera",
  "hilton-pep",
  "hilton-onq",
  "marriott-fosse",
  "marriott-fs-pms",
  "hotelkey",
] as const;

export type PriorityPmsProviderId = typeof priorityPmsProviderIds[number];
export type PriorityPmsLaunchStatus =
  | "configuration_required"
  | "configuration_invalid"
  | "vendor_approval_required"
  | "property_mapping_required"
  | "sandbox_validation_required"
  | "ready_for_live";

export type PriorityPmsLaunchEvidence = {
  vendorApproved?: boolean;
  propertyMapped?: boolean;
  sandboxValidated?: boolean;
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
];

type Environment = Record<string, string | undefined>;
type EvidenceByProvider = Partial<Record<PriorityPmsProviderId, PriorityPmsLaunchEvidence>>;


const operationPathPattern = /_(?:AVAILABILITY|CREATE|GET|MODIFY|CANCEL|VALIDATION)_PATH$/;

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
  if (key.endsWith("_BASE_URL") || key.endsWith("_TOKEN_URL")) {
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
    const status: PriorityPmsLaunchStatus = missingEnvironmentKeys.length > 0
      ? "configuration_required"
      : invalidEnvironmentKeys.length > 0
        ? "configuration_invalid"
        : !providerEvidence.vendorApproved
          ? "vendor_approval_required"
          : !providerEvidence.propertyMapped
            ? "property_mapping_required"
            : !providerEvidence.sandboxValidated
              ? "sandbox_validation_required"
              : "ready_for_live";

    return {
      id: provider.id,
      name: provider.name,
      status,
      configuredEnvironmentKeys: provider.requiredEnvironmentKeys.filter(
        (key) => Boolean(environment[key]?.trim()),
      ),
      missingEnvironmentKeys,
      invalidEnvironmentKeys,
      evidence: {
        vendorApproved: providerEvidence.vendorApproved === true,
        propertyMapped: providerEvidence.propertyMapped === true,
        sandboxValidated: providerEvidence.sandboxValidated === true,
      },
    };
  });
}
