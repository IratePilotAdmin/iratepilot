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
  APPLY_RANGE,
  ARTIFACTS,
  CANONICAL_REPOSITORY_TIP,
  MIGRATIONS,
  ROLLBACKS,
  SOURCE_COMMIT,
  TARGETS,
  buildTargetBoundSql,
  parseArgs,
  readAndAssertArtifacts,
  runManagedGate,
  validateConnectionEnvironment,
} from "../scripts/manage-flight-consumer-public-shopping-115-119-uat.mjs";
import {
  parseRenderArgs,
  renderManagedSql,
} from "../scripts/render-flight-consumer-public-shopping-115-119-managed-uat-sql.mjs";

const preflight = readFileSync(ARTIFACTS.preflight.path, "utf8");
const verification = readFileSync(ARTIFACTS.verification.path, "utf8");
const evidence = JSON.parse(readFileSync(
  "docs/evidence/FLIGHT_CONSUMER_PUBLIC_SHOPPING_UAT_115_119_TEMPLATE.json",
  "utf8",
));

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function environment(kind: "direct" | "pooler" = "direct") {
  const ref = TARGETS.isolated_uat.projectRef;
  return {
    PATH: "C:\\Windows\\System32",
    SHOULD_NOT_REACH_CHILD: "parent-private-value",
    STRIPE_SECRET_KEY: "must-not-reach-child",
    DUFFEL_ACCESS_TOKEN: "must-not-reach-child",
    FLIGHT_MANAGED_115_119_DB_HOST: kind === "direct"
      ? `db.${ref}.supabase.co`
      : "aws-0-us-east-1.pooler.supabase.com",
    FLIGHT_MANAGED_115_119_DB_PORT: "5432",
    FLIGHT_MANAGED_115_119_DB_NAME: "postgres",
    FLIGHT_MANAGED_115_119_DB_USER: kind === "direct"
      ? "postgres"
      : `postgres.${ref}`,
    FLIGHT_MANAGED_115_119_DB_PASSWORD: "test-only-not-a-real-secret",
  };
}

describe("Flight Consumer managed UAT Gates 115-119", () => {
  let directory: string;
  let fakePsql: string;

  beforeAll(() => {
    directory = mkdtempSync(path.join(tmpdir(), "flight-managed-115-119-"));
    fakePsql = path.join(directory, process.platform === "win32" ? "psql.exe" : "psql");
    writeFileSync(fakePsql, "test stub");
    chmodSync(fakePsql, 0o700);
  });
  afterAll(() => rmSync(directory, { recursive: true, force: true }));

  it("pins exact canonical source, bounded range, diagnostics, forwards, and rollbacks", () => {
    expect(SOURCE_COMMIT).toBe("54b49dc3d4249d4358233a2b102cf12416396eb2");
    expect(APPLY_RANGE).toBe("202608260115-202608260119");
    expect(CANONICAL_REPOSITORY_TIP).toBe("202608260140");
    expect(MIGRATIONS.map((item) => item.version)).toEqual([
      "202608260115", "202608260116", "202608260117",
      "202608260118", "202608260119",
    ]);
    expect(MIGRATIONS.some((item) => /2026082601(?:39|40)/.test(item.path))).toBe(false);
    for (const item of [...MIGRATIONS, ...ROLLBACKS]) {
      expect(sha256(readFileSync(item.path))).toBe(item.sha256);
    }
    expect(sha256(preflight)).toBe(ARTIFACTS.preflight.sha256);
    expect(sha256(verification)).toBe(ARTIFACTS.verification.sha256);
    expect(evidence.reviewedArtifacts.managedPreflightSql.sha256)
      .toBe(ARTIFACTS.preflight.sha256);
    expect(evidence.reviewedArtifacts.managedVerificationSql.sha256)
      .toBe(ARTIFACTS.verification.sha256);
    expect(evidence.reviewedArtifacts.managedRunner.sha256)
      .toBe(sha256(readFileSync(
        "scripts/manage-flight-consumer-public-shopping-115-119-uat.mjs",
      )));
    expect(evidence.reviewedArtifacts.sqlEditorRenderer.sha256)
      .toBe(sha256(readFileSync(
        "scripts/render-flight-consumer-public-shopping-115-119-managed-uat-sql.mjs",
      )));
    expect(evidence.reviewedArtifacts.offlineBehavioralVerifier.sha256)
      .toBe(sha256(readFileSync(
        "scripts/verify-flight-consumer-public-shopping-115-119-managed-uat-pglite.mjs",
      )));
    expect(() => readAndAssertArtifacts()).not.toThrow();
    expect(ROLLBACKS.find((item) => item.version === "202608260118"))
      .toMatchObject({ forwardOnly: true });
  });

  it("has no default or alternate target and requires both apply authorities", () => {
    expect(() => parseArgs([])).toThrow("explicit approved operation");
    expect(() => parseArgs([
      "--operation=preflight", "--target=preview_runtime", `--psql=${fakePsql}`,
    ])).toThrow("exact isolated UAT target");
    expect(() => parseArgs([
      "--operation=apply-verify", "--target=isolated_uat", `--psql=${fakePsql}`,
      "--apply-confirmation=APPLY_115_119_OBJECTS_ONLY_exipwtvyjaihsvdhsbbt_NO_LEDGER",
    ])).toThrow("Gate 118 forward-only confirmation");
    expect(parseArgs([
      "--operation=apply-verify", "--target=isolated_uat", `--psql=${fakePsql}`,
      "--apply-confirmation=APPLY_115_119_OBJECTS_ONLY_exipwtvyjaihsvdhsbbt_NO_LEDGER",
      "--forward-only-confirmation=ACCEPT_118_FORWARD_ONLY_exipwtvyjaihsvdhsbbt_NO_ROLLBACK",
    ])).toMatchObject({ operation: "apply-verify", target: TARGETS.isolated_uat });
    expect(parseArgs([
      "--operation=verify", "--target=isolated_uat", `--psql=${fakePsql}`,
      "--verify-confirmation=VERIFY_115_119_SAVEPOINT_ONLY_exipwtvyjaihsvdhsbbt_ZERO_RESIDUE",
    ])).toMatchObject({ operation: "verify" });
  });

  it("cryptographically labels only the isolated direct/pooler connection", () => {
    expect(validateConnectionEnvironment(
      environment(), TARGETS.isolated_uat,
    )).toMatchObject({
      host: "db.exipwtvyjaihsvdhsbbt.supabase.co",
      user: "postgres",
      port: "5432",
      database: "postgres",
    });
    expect(validateConnectionEnvironment(
      environment("pooler"), TARGETS.isolated_uat,
    )).toMatchObject({ user: "postgres.exipwtvyjaihsvdhsbbt" });
    expect(() => validateConnectionEnvironment({
      ...environment(),
      FLIGHT_MANAGED_115_119_DB_HOST: "db.allliumarkejinplrggl.supabase.co",
    }, TARGETS.isolated_uat)).toThrow("exact isolated UAT project");
  });

  it("keeps preflight read-only, zero-row, target-bound, and ledger-observing", () => {
    expect(preflight).toContain("begin read only;");
    expect(preflight).toContain("exipwtvyjaihsvdhsbbt");
    expect(preflight).toContain("accepted predecessor through Gate 114");
    expect(preflight).toContain("predecessor relation % is not empty");
    expect(preflight).toContain("ledger_versions_sha256");
    expect(preflight).toContain("Gate 115-119 target relation/index already exists");
    expect(preflight).not.toMatch(
      /^\s*(?:create|alter|drop|truncate|insert|update|delete|merge|copy|grant|revoke)\b/im,
    );
  });

  it("contains one zero-residue synthetic verifier and no external transport", () => {
    expect(verification.match(
      /^savepoint flight_public_shopping_115_119_synthetic_rows;$/gim,
    )).toHaveLength(1);
    expect(verification.match(
      /^rollback to savepoint flight_public_shopping_115_119_synthetic_rows;$/gim,
    )).toHaveLength(1);
    const savepointIndex = verification.indexOf(
      "savepoint flight_public_shopping_115_119_synthetic_rows;",
    );
    const fixtureGrantIndex = verification.indexOf(
      "grant execute on function\n"
      + "  public.canonical_flight_consumer_public_offer_json_v1(jsonb)",
    );
    const rollbackIndex = verification.indexOf(
      "rollback to savepoint flight_public_shopping_115_119_synthetic_rows;",
    );
    expect(fixtureGrantIndex).toBeGreaterThan(savepointIndex);
    expect(rollbackIndex).toBeGreaterThan(fixtureGrantIndex);
    expect(verification).toContain("synthetic canonicalizer grant survived");
    for (const fragment of [
      "zero source header changed",
      "non-empty source accounting changed",
      "dispatch collision was accepted",
      "populated purge contract changed",
      "synthetic row survived",
      "out-of-range Gate 139/140 object is present",
      "migration ledger changed after preflight",
    ]) expect(verification).toContain(fragment);
    expect(verification).not.toMatch(
      /\b(?:dblink|http_get|http_post|pg_notify|lo_import|lo_export)\b|\bnet\./i,
    );
    expect(verification).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+supabase_migrations\.schema_migrations/i,
    );
  });

  it("runs preflight, five exact transactions, and verification in order without secret inheritance", () => {
    const calls: Array<{ args: string[]; input: Buffer; env: Record<string, string> }> = [];
    const spawn = vi.fn((
      _executable: string,
      args: string[],
      options: { input: Buffer; env: Record<string, string> },
    ) => {
      const sql = options.input.toString("utf8");
      calls.push({ args, input: options.input, env: options.env });
      if (sql.includes("managed_uat_preflight_receipt")) {
        return { status: 0, stderr: "", stdout: `${JSON.stringify({
          gate: "flight_consumer_public_shopping_115_119_managed_uat_preflight",
          result: "PASS",
          ledger_version_count: 114,
          ledger_versions_sha256: "a".repeat(64),
        })}\n` };
      }
      if (sql.includes("managed_uat_verification_receipt")) {
        return { status: 0, stderr: "", stdout: `${JSON.stringify({
          gate: "flight_consumer_public_shopping_115_119_managed_uat_verification",
          result: "PASS",
        })}\n` };
      }
      return { status: 0, stderr: "", stdout: "" };
    });
    const result = runManagedGate({
      config: { operation: "apply-verify", target: TARGETS.isolated_uat, psql: fakePsql },
      environment: environment("pooler"),
      spawn,
    });
    expect(result).toMatchObject({
      applyRange: APPLY_RANGE,
      canonicalRepositoryTip: "202608260140",
      migrationLedgerMutation: false,
      productionAccessed: false,
    });
    expect(calls).toHaveLength(7);
    expect(calls[0].input.toString("utf8")).toContain("begin read only;");
    MIGRATIONS.forEach((item, index) => {
      expect(sha256(calls[index + 1].input)).toBe(item.sha256);
    });
    expect(calls[6].input.toString("utf8")).toContain(
      "app.flight_managed_115_119_expected_ledger_sha256', '"
      + "a".repeat(64),
    );
    for (const call of calls) {
      expect(call.env).not.toHaveProperty("SHOULD_NOT_REACH_CHILD");
      expect(call.env).not.toHaveProperty("STRIPE_SECRET_KEY");
      expect(call.env).not.toHaveProperty("DUFFEL_ACCESS_TOKEN");
      expect(call.env).toMatchObject({
        PGSSLMODE: "verify-full",
        PGDATABASE: "postgres",
        PGUSER: "postgres.exipwtvyjaihsvdhsbbt",
      });
    }
  });

  it("renders diagnostics only and keeps the evidence file explicitly unexecuted", () => {
    expect(() => parseRenderArgs([
      "--target=isolated_uat", "--phase=apply",
    ])).toThrow("non-apply render phase");
    const rendered = renderManagedSql(parseRenderArgs([
      "--target=isolated_uat", "--phase=preflight",
    ])).toString("utf8");
    expect(rendered).toContain("'exipwtvyjaihsvdhsbbt'");
    expect(rendered).toContain("begin read only;");
    expect(rendered).not.toContain("\\set ON_ERROR_STOP");
    expect(evidence.templateState).toBe("UNEXECUTED_TEMPLATE");
    expect(evidence.result).toBeNull();
    expect(evidence.outcome).toBeNull();
  });

  it("injects only reviewed constant target bindings", () => {
    const sql = buildTargetBoundSql(
      Buffer.from("begin read only; commit;"), TARGETS.isolated_uat,
    ).toString("utf8");
    expect(sql).toContain("'isolated_uat'");
    expect(sql).toContain("'exipwtvyjaihsvdhsbbt'");
    expect(sql).not.toContain("allliumarkejinplrggl");
  });
});
