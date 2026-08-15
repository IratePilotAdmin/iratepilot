export const REQUIRED_PREVIEW_BASELINE: string[];
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

export function reconcilePreviewMigrations(
  env?: Record<string, string | undefined>,
  argv?: string[],
): {
  projectRef: string;
  requiredBaseline: string[];
  latestRepositoryMigration: string | undefined;
};
