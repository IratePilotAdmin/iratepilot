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

export function auditPriorityPmsProductionReadiness(
  environment: Environment,
  evidence: EvidenceByProvider = {},
) {
  return priorityPmsProductionManifest.map((provider) => {
    const missingEnvironmentKeys = provider.requiredEnvironmentKeys.filter(
      (key) => !environment[key]?.trim(),
    );
    const providerEvidence = evidence[provider.id] ?? {};
    const status: PriorityPmsLaunchStatus = missingEnvironmentKeys.length > 0
      ? "configuration_required"
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
      evidence: {
        vendorApproved: providerEvidence.vendorApproved === true,
        propertyMapped: providerEvidence.propertyMapped === true,
        sandboxValidated: providerEvidence.sandboxValidated === true,
      },
    };
  });
}
