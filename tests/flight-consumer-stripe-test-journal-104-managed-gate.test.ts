import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  ARTIFACTS,
  FORWARD_SHA256,
  ROLLBACK_SHA256,
  TARGETS,
  buildTargetBoundSql,
  parseArgs,
  readAndAssertArtifacts,
  runManagedGate,
  validateConnectionEnvironment,
} from "../scripts/manage-flight-consumer-stripe-test-journal-104.mjs";
import {
  parseRenderArgs,
  renderManagedSql,
} from "../scripts/render-flight-consumer-stripe-test-journal-104-managed-sql.mjs";

const preflight = readFileSync(ARTIFACTS.preflight.path, "utf8");
const verification = readFileSync(ARTIFACTS.verification.path, "utf8");
const migration = readFileSync(ARTIFACTS.migration.path);
const rollback = readFileSync(ARTIFACTS.rollback.path);
const productionObservation = readFileSync(
  "scripts/flight-consumer-stripe-test-journal-104-production-observation.sql",
  "utf8",
);
const previewManagedEvidence = JSON.parse(readFileSync(
  "docs/evidence/FLIGHT_CONSUMER_STRIPE_TEST_JOURNAL_104_PREVIEW_MANAGED_QUALIFICATION_2026-08-27.json",
  "utf8",
)).evidence;

function sha256(bytes: Buffer | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

function environmentFor(
  target: keyof typeof TARGETS,
  kind: "direct" | "pooler" = "direct",
) {
  const projectRef = TARGETS[target].projectRef;
  return {
    PATH: "C:\\Windows\\System32",
    SHOULD_NOT_REACH_CHILD: "private-parent-value",
    FLIGHT_MANAGED_104_DB_HOST: kind === "direct"
      ? `db.${projectRef}.supabase.co`
      : "aws-0-us-east-1.pooler.supabase.com",
    FLIGHT_MANAGED_104_DB_PORT: "5432",
    FLIGHT_MANAGED_104_DB_NAME: "postgres",
    FLIGHT_MANAGED_104_DB_USER: kind === "direct"
      ? "postgres"
      : `postgres.${projectRef}`,
    FLIGHT_MANAGED_104_DB_PASSWORD: "test-only-password-not-a-real-secret",
  };
}

describe("Flight Consumer managed migration 104 gate", () => {
  let tempDirectory: string;
  let fakePsql: string;

  beforeAll(() => {
    tempDirectory = mkdtempSync(path.join(tmpdir(), "flight-managed-104-"));
    fakePsql = path.join(tempDirectory, process.platform === "win32"
      ? "psql.exe"
      : "psql");
    writeFileSync(fakePsql, "test stub");
    chmodSync(fakePsql, 0o700);
  });

  afterAll(() => {
    rmSync(tempDirectory, { recursive: true, force: true });
  });

  it("pins unchanged forward and rollback bytes plus both operator SQL files", () => {
    expect(FORWARD_SHA256).toBe(
      "50dcca75f06111de027833ca138519dbe7f71e91bfd5ca9839fa9425699dfa1b",
    );
    expect(ROLLBACK_SHA256).toBe(
      "10d9095be8250a1f50247534aa98e8fc35f51a06211458b5f19f1df43d9d2328",
    );
    expect(sha256(migration)).toBe(FORWARD_SHA256);
    expect(sha256(rollback)).toBe(ROLLBACK_SHA256);
    expect(sha256(preflight)).toBe(ARTIFACTS.preflight.sha256);
    expect(sha256(verification)).toBe(ARTIFACTS.verification.sha256);
    expect(() => readAndAssertArtifacts()).not.toThrow();
  });

  it("records the locked Preview verify-only receipt without rewriting Production state", () => {
    expect(previewManagedEvidence).toMatchObject({
      environment: "managed_supabase_preview_runtime_locked",
      result: "PASS",
      target: {
        projectRef: "eiqmdldjnedqgbtoozqa",
        targetKind: "preview_runtime",
        consumerProduction: false,
        runtimeLockedAtVerification: true,
      },
      preflight: {
        mode: "read_only",
        result: "STOPPED_EXPECTED_OBJECT_COLLISION",
        writesPerformed: false,
        blindApplyAttempted: false,
        forwardMigrationAppliedThisRun: false,
      },
      observedPreexistingState: {
        expectedJournalTablesPresent: 3,
        expectedRecorderAndProtectionFunctionsPresent: 6,
        migration104LedgerEntryPresent: false,
        disposition: "object_applied_not_ledgered_in_preview",
      },
      productionCatalogObservation: {
        observedAt: "2026-08-27T03:12:31-05:00",
        mode: "read_only",
        result: "PASS",
        projectRef: "allliumarkejinplrggl",
        database: "postgres",
        databaseUser: "postgres",
        postgresServerVersionNum: 170006,
        matchingRelationCount: 0,
        matchingRelationNames: [],
        matchingFunctionCount: 0,
        matchingFunctionNames: [],
        migration104LedgerEntryPresent: false,
        writesPerformed: false,
        objectState: "absent",
      },
      verificationReceipt: {
        result: "PASS",
        syntheticRowsAfterSavepointRollback: 0,
        verificationHarnessObjects: 0,
        migration104LedgerEntryPresent: false,
        providerRequests: 0,
        stripeRequests: 0,
        charges: 0,
        orders: 0,
        tickets: 0,
      },
      disposition: {
        previewDatabasePermanentWritesPerformed: false,
        migrationLedgerMutationPerformed: false,
        stripeTraffic: false,
        duffelTraffic: false,
        productionDatabaseReadPerformed: true,
        productionDatabaseWritesPerformed: false,
        productionRuntimeChanged: false,
        publicReleaseChanged: false,
      },
      lineageState: {
        productionMigration104RepositoryClassification: "authored_unapplied",
        productionMigration104ObjectState: "read_only_verified_absent",
        productionMigration104LedgerEntryPresent: false,
        productionApplyAuthority: "not_granted",
        previewMigration104ObjectState: "object_applied_not_ledgered",
        carReservedRangeUntouched: "202608260200-202608260207",
      },
    });
    expect(previewManagedEvidence.reviewedArtifacts).toEqual({
      forwardMigration: {
        path: ARTIFACTS.migration.path,
        sha256: FORWARD_SHA256,
      },
      rollbackMigration: {
        path: ARTIFACTS.rollback.path,
        sha256: ROLLBACK_SHA256,
      },
      managedPreflightSql: {
        path: ARTIFACTS.preflight.path,
        sha256: ARTIFACTS.preflight.sha256,
      },
      managedVerificationSql: {
        path: ARTIFACTS.verification.path,
        sha256: ARTIFACTS.verification.sha256,
      },
      productionObservationSql: {
        path: "scripts/flight-consumer-stripe-test-journal-104-production-observation.sql",
        sha256: sha256(productionObservation),
      },
    });
  });

  it("keeps the Production observation artifact read only and target bound", () => {
    expect(productionObservation).toContain("begin read only;");
    expect(productionObservation).toContain("commit;");
    expect(productionObservation).toContain("allliumarkejinplrggl");
    expect(productionObservation).toContain("202608260104");
    expect(productionObservation).not.toMatch(
      /\b(?:insert|update|delete|merge|create|alter|drop|truncate|grant|revoke)\b\s+/i,
    );
  });

  it("has no default operation or target and requires exact target confirmations", () => {
    expect(() => parseArgs([])).toThrow("explicit approved operation");
    expect(() => parseArgs([
      "--operation=preflight",
      `--psql=${fakePsql}`,
    ])).toThrow("explicit approved managed target");
    expect(() => parseArgs([
      "--operation=apply-verify",
      "--target=isolated_uat",
      `--psql=${fakePsql}`,
      "--apply-confirmation=APPLY_104_OBJECTS_ONLY_eiqmdldjnedqgbtoozqa_NO_LEDGER",
    ])).toThrow("exact target-specific apply confirmation");
    expect(() => parseArgs([
      "--operation=verify",
      "--target=preview_runtime",
      `--psql=${fakePsql}`,
    ])).toThrow("exact target-specific verify confirmation");

    expect(parseArgs([
      "--operation=apply-verify",
      "--target=isolated_uat",
      `--psql=${fakePsql}`,
      "--apply-confirmation=APPLY_104_OBJECTS_ONLY_exipwtvyjaihsvdhsbbt_NO_LEDGER",
    ])).toMatchObject({
      operation: "apply-verify",
      target: TARGETS.isolated_uat,
    });
    expect(parseArgs([
      "--operation=verify",
      "--target=preview_runtime",
      `--psql=${fakePsql}`,
      "--verify-confirmation=VERIFY_104_SAVEPOINT_ONLY_eiqmdldjnedqgbtoozqa_ZERO_RESIDUE",
    ])).toMatchObject({
      operation: "verify",
      target: TARGETS.preview_runtime,
    });
  });

  it("binds direct and pooler connections to the selected managed project", () => {
    expect(validateConnectionEnvironment(
      environmentFor("isolated_uat"),
      TARGETS.isolated_uat,
    )).toMatchObject({
      host: "db.exipwtvyjaihsvdhsbbt.supabase.co",
      user: "postgres",
      database: "postgres",
      port: "5432",
    });
    expect(validateConnectionEnvironment(
      environmentFor("preview_runtime", "pooler"),
      TARGETS.preview_runtime,
    )).toMatchObject({
      host: "aws-0-us-east-1.pooler.supabase.com",
      user: "postgres.eiqmdldjnedqgbtoozqa",
    });
    expect(() => validateConnectionEnvironment(
      environmentFor("isolated_uat"),
      TARGETS.preview_runtime,
    )).toThrow("do not cryptographically label");
    expect(() => validateConnectionEnvironment({
      ...environmentFor("isolated_uat"),
      FLIGHT_MANAGED_104_DB_HOST: "localhost",
    }, TARGETS.isolated_uat)).toThrow();
  });

  it("keeps preflight read-only, collision-failing, and target-specific", () => {
    expect(preflight).toContain("begin read only;");
    expect(preflight).toContain("isolated_uat");
    expect(preflight).toContain("exipwtvyjaihsvdhsbbt");
    expect(preflight).toContain("preview_runtime");
    expect(preflight).toContain("eiqmdldjnedqgbtoozqa");
    expect(preflight).toContain("isolated UAT predecessor 103 is absent");
    expect(preflight).toContain("locked Preview runtime predecessor is absent");
    expect(preflight).toContain("control.execution_kill_switch_engaged");
    expect(preflight).toContain("not control.production_release_enabled");
    expect(preflight).toContain("target relation or index collides");
    expect(preflight).toContain("migration ledger already contains 104");
    expect(preflight).toContain("'writes_performed', false");
    expect(preflight).not.toMatch(
      /^\s*(?:create|alter|drop|truncate|insert|update|delete|merge|copy|grant|revoke)\b/im,
    );
  });

  it("contains synthetic verification in one savepoint with zero residue", () => {
    expect(verification.match(
      /^savepoint flight_stripe_test_104_synthetic_rows;$/gim,
    )).toHaveLength(1);
    expect(verification.match(
      /^rollback to savepoint flight_stripe_test_104_synthetic_rows;$/gim,
    )).toHaveLength(1);
    expect(verification).toContain("synthetic rows survived savepoint rollback");
    expect(verification).toContain("verification harness object survived");
    expect(verification).not.toMatch(
      /create\s+(?:schema|table|function).*harness/i,
    );
    expect(verification).not.toMatch(
      /\b(?:dblink|http_get|http_post|pg_notify|lo_import|lo_export)\b|\bnet\./i,
    );
    expect(verification).not.toMatch(
      /insert\s+into\s+supabase_migrations\.schema_migrations/i,
    );
    expect(verification).toContain("migration 104 was unexpectedly ledgered");
  });

  it("orders preflight, exact apply, and verification without leaking parent env", () => {
    const calls: Array<{
      args: string[];
      options: { env: Record<string, string>; input: Buffer };
    }> = [];
    const spawn = vi.fn((
      _executable: string,
      args: string[],
      options: { env: Record<string, string>; input: Buffer },
    ) => {
      calls.push({ args, options });
      return { status: 0, stdout: "gate receipt\n", stderr: "" };
    });
    const result = runManagedGate({
      config: {
        operation: "apply-verify",
        target: TARGETS.preview_runtime,
        psql: fakePsql,
      },
      environment: environmentFor("preview_runtime", "pooler"),
      spawn,
    });

    expect(result).toMatchObject({
      operation: "apply-verify",
      projectRef: "eiqmdldjnedqgbtoozqa",
      forwardSha256: FORWARD_SHA256,
      rollbackSha256: ROLLBACK_SHA256,
      migrationLedgerMutation: false,
    });
    expect(calls).toHaveLength(3);
    expect(calls[0].options.input.toString("utf8")).toContain(
      "app.flight_managed_104_target_kind', 'preview_runtime'",
    );
    expect(sha256(calls[1].options.input)).toBe(FORWARD_SHA256);
    expect(calls[2].options.input.toString("utf8")).toContain(
      "rollback to savepoint flight_stripe_test_104_synthetic_rows;",
    );
    for (const call of calls) {
      expect(call.args).toEqual([
        "--no-psqlrc",
        "--set",
        "ON_ERROR_STOP=1",
        "--file",
        "-",
      ]);
      expect(call.options.env).not.toHaveProperty("SHOULD_NOT_REACH_CHILD");
      expect(call.options.env).not.toHaveProperty("DATABASE_URL");
      expect(call.options.env).toMatchObject({
        PGSSLMODE: "verify-full",
        PGDATABASE: "postgres",
        PGUSER: "postgres.eiqmdldjnedqgbtoozqa",
      });
    }
  });

  it("injects only reviewed constant target bindings", () => {
    const bound = buildTargetBoundSql(
      Buffer.from("begin read only; commit;"),
      TARGETS.isolated_uat,
    ).toString("utf8");
    expect(bound).toContain("'isolated_uat'");
    expect(bound).toContain("'exipwtvyjaihsvdhsbbt'");
    expect(bound).not.toContain("eiqmdldjnedqgbtoozqa");
  });

  it("renders only target-bound preflight/verification SQL for SQL Editor", () => {
    expect(() => parseRenderArgs([])).toThrow("explicit approved managed target");
    expect(() => parseRenderArgs([
      "--target=preview_runtime",
      "--phase=apply",
    ])).toThrow("explicit non-apply render phase");
    const renderedPreflight = renderManagedSql(parseRenderArgs([
      "--target=preview_runtime",
      "--phase=preflight",
    ])).toString("utf8");
    const renderedVerification = renderManagedSql(parseRenderArgs([
      "--target=isolated_uat",
      "--phase=verification",
    ])).toString("utf8");
    expect(renderedPreflight).toContain("'preview_runtime'");
    expect(renderedPreflight).toContain("'eiqmdldjnedqgbtoozqa'");
    expect(renderedPreflight).toContain("begin read only;");
    expect(renderedVerification).toContain("'isolated_uat'");
    expect(renderedVerification).toContain("'exipwtvyjaihsvdhsbbt'");
    expect(renderedVerification).toContain(
      "rollback to savepoint flight_stripe_test_104_synthetic_rows;",
    );
    expect(renderedPreflight).not.toMatch(/^\\/m);
    expect(renderedVerification).not.toMatch(/^\\/m);
    expect(renderedPreflight).not.toContain("\\set ON_ERROR_STOP");
    expect(renderedVerification).not.toContain("\\set VERBOSITY");
    expect(renderedPreflight).not.toContain(FORWARD_SHA256);
  });
});
