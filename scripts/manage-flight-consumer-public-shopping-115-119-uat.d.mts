export type Managed115119Target = Readonly<{
  kind: "isolated_uat";
  projectRef: "exipwtvyjaihsvdhsbbt";
  projectName: "iratepilot-flight-payment-uat-20260827";
}>;

export const SOURCE_COMMIT: string;
export const APPLY_RANGE: string;
export const CANONICAL_REPOSITORY_TIP: string;
export const TARGETS: Readonly<{ isolated_uat: Managed115119Target }>;
export const MIGRATIONS: ReadonlyArray<Readonly<{
  version: string;
  path: string;
  sha256: string;
  forwardOnly?: boolean;
}>>;
export const ROLLBACKS: ReadonlyArray<Readonly<{
  version: string;
  path: string;
  sha256: string;
  forwardOnly?: boolean;
}>>;
export const ARTIFACTS: Readonly<Record<
  "preflight" | "verification", Readonly<{ path: string; sha256: string }>
>>;

export function parseArgs(argv: string[]): Readonly<{
  operation: "preflight" | "verify" | "apply-verify";
  target: Managed115119Target;
  psql: string;
}>;
export function validateConnectionEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  target: Managed115119Target,
): Readonly<Record<string, string>>;
export function readAndAssertArtifacts(options?: Readonly<{
  repositoryRoot?: string;
  readBytes?: (path: string) => Buffer;
}>): Readonly<Record<string, Buffer>>;
export function buildTargetBoundSql(
  bytes: Buffer,
  target: Managed115119Target,
  expectedLedger?: Readonly<{ count: number; sha256: string }> | null,
): Buffer;
export function buildSqlEditorTargetBoundSql(
  bytes: Buffer,
  target: Managed115119Target,
): Buffer;
export function parseReceipt(output: string, expectedGate: string): unknown;
export function runManagedGate(options: Readonly<{
  config: Readonly<{ operation: string; target: Managed115119Target; psql: string }>;
  environment: Readonly<Record<string, string | undefined>>;
  spawn?: (
    executable: string,
    args: string[],
    options: Readonly<{ input: Buffer; env: Record<string, string> }>,
  ) => Readonly<{ status: number | null; stdout: string; stderr: string }>;
}>): Readonly<Record<string, unknown>>;
