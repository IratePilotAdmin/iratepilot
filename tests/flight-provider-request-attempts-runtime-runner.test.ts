import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const runnerPath = "scripts/verify-flight-provider-request-attempts-postgres.mjs";
const runtimeSqlPath = "tests/postgres/flight-provider-request-attempts-runtime.sql";
const migration068Path = "supabase/migrations/202608230068_flight_commerce_foundation.sql";
const rollback068Path =
  "supabase/rollbacks/202608230068_flight_commerce_foundation.rollback.sql";

const runner = readFileSync(runnerPath, "utf8");
const runtimeSql = readFileSync(runtimeSqlPath, "utf8");
const migration068 = readFileSync(migration068Path, "utf8");
const rollback068 = readFileSync(rollback068Path, "utf8");

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function baseArguments(): string[] {
  return [
    runnerPath,
    "--psql",
    "C:\\definitely-not-present\\psql.exe",
    "--host",
    "127.0.0.1",
    "--port",
    "64997",
    "--admin-role",
    "postgres",
    "--primary-db",
    "flight_gate_behavior_static01",
    "--rollback-db",
    "flight_gate_rollback_static01",
    "--cluster-guid",
    "d5f05d63eba94fc191591c5702b51e05",
    "--confirm-disposable",
    "APPLY_068_069_LOCAL_ONLY",
  ];
}

describe("flight PostgreSQL runtime acceptance runner", () => {
  it("pins the exact reviewed migrations and rollbacks", () => {
    expect(sha256(runtimeSqlPath)).toBe(
      "3f1893cd92b3f896eb2ed76347dc0b9f5280387bc6be64386061e5da5ec18edb",
    );
    expect(sha256(migration068Path)).toBe(
      "29f8cb9a45f69e7da23bffdf185ff6eaab2a514a35a22da4aa4b8c91cf08ef7d",
    );
    expect(sha256("supabase/migrations/202608240069_flight_provider_request_attempts.sql"))
      .toBe("7e966c4fa6f08a92692787dd82fadd4c0205af02826342a3902037438b1bd611");
    expect(sha256(rollback068Path)).toBe(
      "7013118e4f5a42b8f883f75aaa06abaeb68c51dd489be4844cd86a9cc3a6b1ae",
    );
    expect(sha256(
      "supabase/rollbacks/202608240069_flight_provider_request_attempts.rollback.sql",
    )).toBe("16fee4c1e7b4fdcf14a68a06f3e09b43947d7dde4643b5ed6b30d43f8c6ba30d");
    expect(runner).toContain("FIXED_FILES");
    expect(runner).toContain("Refusing to execute an unreviewed SQL file");
  });

  it("locks in the corrected 068 CASE grouping and rollback dependency order", () => {
    expect(migration068).toContain(
      "if new.resource_type is distinct from (case new.scope",
    );
    expect(migration068).toContain("end) then");
    expect(migration068).not.toContain(
      "if new.resource_type is distinct from case new.scope",
    );
    expect(rollback068).toContain(
      "Refusing rollback: flight provider request-attempt migration 069 is still installed",
    );
    expect(rollback068.indexOf("migration 069 is still installed")).toBeLessThan(
      rollback068.indexOf("lock table"),
    );
    expect(runner).toContain("dependency-order rollback refusal");
  });

  it("is explicit loopback-only and cannot accept URLs, passwords, or arbitrary SQL paths", () => {
    expect(runner).toContain('parsed.host !== "127.0.0.1"');
    expect(runner).toContain("port < 49152 || port > 65535");
    expect(runner).toContain("DATABASE_PATTERN");
    expect(runner).toContain("Refusing to execute an unreviewed SQL file");
    expect(runner).toContain("psql must be the executable inside the confirmed Codex disposable cluster runtime");
    expect(runner).toContain("codex-flight-pg-${parsed.clusterGuid}");
    expect(runner).toContain("PGPASSFILE");
    expect(runner).toContain('PGSSLMODE = "disable"');
    expect(runner).not.toContain("Object.entries(process.env)");
    expect(runner).not.toContain("clean.PATH");
    expect(runner).not.toMatch(/clean\[(?:name|\w+)\]\s*=\s*value[\s\S]*Object\.entries\(process\.env\)/);
    expect(runner).not.toMatch(/(?:from|import)\s+["']dotenv["']/);
    expect(runner).not.toMatch(/readFileSync\([^)]*["'][^"']*\.env["']/);
    expect(runner).not.toContain("--database-url");
    expect(runner).not.toContain("--password");
  });

  it("rejects a non-loopback host before touching the filesystem or PostgreSQL", () => {
    const args = baseArguments();
    args[args.indexOf("--host") + 1] = "localhost";
    const result = spawnSync(process.execPath, args, { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Host must be the exact IPv4 loopback address 127.0.0.1",
    );
  });

  it("publishes safe help without attempting a connection", () => {
    const result = spawnSync(process.execPath, [runnerPath, "--help"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("APPLY_068_069_LOCAL_ONLY");
    expect(result.stdout).toContain("never accepts a connection URL");
  });

  it("covers runtime authority, lifecycles, concurrency fixture, ACLs, and rollback evidence", () => {
    for (const evidence of [
      "execution_kill_switch_engaged",
      "provider_sandbox_traffic_enabled",
      "production_release_enabled",
      "relforcerowsecurity",
      "has_table_privilege",
      "has_function_privilege",
      "create_order",
      "succeeded",
      "failed",
      "ambiguous",
      "blocked",
      "retry is not authorized",
      "permission denied for table flight_provider_request_attempts",
      "FLIGHT_GATE_RUNTIME_SQL_PASS",
    ]) {
      expect(runtimeSql).toContain(evidence);
    }
    expect(runner).toContain("pg_advisory_xact_lock(688069)");
    expect(runner).toContain("winner's post-claim transaction lock");
    expect(runner).toContain("loserResult.elapsedMs < 500");
    expect(runner).toContain("Refusing rollback: flight provider request-attempt evidence exists");
    expect(runner).toContain("p.proname like '%flight%'");
  });
});
