export const REQUIRED_PREVIEW_BASELINE: string[];
export const APPROVED_PREVIEW_PENDING: string[];
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
  latestRepositoryMigration: string | undefined;
  applied?: boolean;
  pendingBefore?: string[];
  pendingAfter?: string[];
};
