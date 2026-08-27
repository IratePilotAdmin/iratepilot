export type Managed104TargetKind = "isolated_uat" | "preview_runtime";
export type Managed104Operation = "preflight" | "verify" | "apply-verify";

export interface Managed104Target {
  readonly kind: Managed104TargetKind;
  readonly projectRef: string;
  readonly projectName: string;
}

export interface Managed104Config {
  readonly operation: Managed104Operation;
  readonly target: Managed104Target;
  readonly psql: string;
}

export const MIGRATION_VERSION: string;
export const FORWARD_SHA256: string;
export const ROLLBACK_SHA256: string;
export const TARGETS: Readonly<Record<Managed104TargetKind, Managed104Target>>;
export const ARTIFACTS: Readonly<Record<
  "preflight" | "migration" | "verification" | "rollback",
  Readonly<{ path: string; sha256: string }>
>>;

export function parseArgs(argv: string[]): Managed104Config;

export function validateConnectionEnvironment(
  environment: Record<string, string | undefined>,
  target: Managed104Target,
): Readonly<{
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
}>;

export function readAndAssertArtifacts(options?: {
  repositoryRoot?: string;
  readBytes?: (artifactPath: string) => Buffer;
}): Readonly<Record<
  "preflight" | "migration" | "verification" | "rollback",
  Buffer
>>;

export function buildTargetBoundSql(
  sqlBytes: Buffer,
  target: Managed104Target,
): Buffer;

export function buildSqlEditorTargetBoundSql(
  sqlBytes: Buffer,
  target: Managed104Target,
): Buffer;

export function executePsql(options: {
  psql: string;
  input: Buffer;
  childEnvironment: Record<string, string>;
  spawn?: (...args: any[]) => any;
}): string;

export function runManagedGate(options: {
  config: Managed104Config;
  environment?: Record<string, string | undefined>;
  artifacts?: Readonly<Record<
    "preflight" | "migration" | "verification" | "rollback",
    Buffer
  >>;
  spawn?: (...args: any[]) => any;
}): Readonly<{
  operation: Managed104Operation;
  targetKind: Managed104TargetKind;
  projectRef: string;
  migrationVersion: string;
  forwardSha256: string;
  rollbackSha256: string;
  migrationLedgerMutation: false;
  receipts: string[];
}>;

export function main(
  argv?: string[],
  environment?: Record<string, string | undefined>,
): void;
