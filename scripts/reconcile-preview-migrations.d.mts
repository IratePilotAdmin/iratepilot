export const REQUIRED_PREVIEW_BASELINE: string[];
export const APPROVED_PREVIEW_PENDING: string[];
export const PMS_CATALOG_EXPANSION_PENDING: string[];
export const PMS_VENDOR_REFERENCE_PENDING: string[];
export const PMS_CATALOG_AND_VENDOR_REFERENCE_PENDING: string[];
export const APALEO_WEBHOOK_RECEIPT_PENDING: string[];
export const APALEO_RESERVATION_RECONCILIATION_PENDING: string[];
export const APALEO_WEBHOOK_AND_RECONCILIATION_PENDING: string[];
export const DATA_API_GRANTS_PENDING: string[];
export const ANAND_SYSTEMS_PMS_PENDING: string[];
export const RATEHAWK_VALIDATION_EVIDENCE_PENDING: string[];
export const RATEHAWK_PREBOOK_EVIDENCE_PENDING: string[];
export const RATEHAWK_CERTIFICATION_OPERATIONS_RECEIPTS_PENDING: string[];
export const EXPEDIA_RAPID_VALIDATION_EVIDENCE_PENDING: string[];
export const BOOKING_CHILD_AGES_PENDING: string[];
export const EXPEDIA_B2C_SITE_REVIEW_EVIDENCE_PENDING: string[];
export const DEFAULT_PREVIEW_ALLOWED_PENDING_SETS: string[][];
export const PMS_PILOT_PREFLIGHT_PENDING: string[];
export const PMS_PILOT_WITH_VENDOR_REFERENCE_PENDING: string[];
export const PMS_PILOT_ALLOWED_PENDING_SETS: string[][];
export const PMS_PILOT_PREVIEW_PROJECT_REF: string;
export const PRODUCTION_PROJECT_REF: string;

export function listMigrationVersions(directoryUrl?: URL): string[];

export function assertPreviewMigrationTarget(
  env: Record<string, string | undefined>,
  migrationVersions?: string[],
): {
  databaseUrl: string;
  projectRef: string;
  migrationVersions: string[];
};

export function parseMigrationListOutput(output: string): {
  localVersions: string[];
  remoteVersions: string[];
};

export function assertPreviewRemoteMigrationState(
  output: string,
  migrationVersions?: string[],
  allowedPendingSets?: string[][],
): {
  localVersions: string[];
  remoteVersions: string[];
  pendingVersions: string[];
};

export function assertPreviewDryRun(
  output: string,
  pendingVersions: string[],
  migrationVersions?: string[],
): string[];

export function reconcilePreviewMigrations(
  env?: Record<string, string | undefined>,
  argv?: string[],
  runner?: (
    command: string,
    args: string[],
    env: Record<string, string | undefined>,
    options?: { capture?: boolean },
  ) => string,
): {
  projectRef: string;
  requiredBaseline: string[];
  approvedPendingVersions: string[];
  approvedPendingSets: string[][];
  latestRepositoryMigration: string | undefined;
  applied?: boolean;
  pendingBefore?: string[];
  pendingAfter?: string[];
  pendingVersions?: string[];
  dryRunOnly?: boolean;
};
