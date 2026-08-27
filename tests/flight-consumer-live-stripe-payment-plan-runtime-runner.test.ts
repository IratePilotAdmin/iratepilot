import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const runnerPath =
  "scripts/verify-flight-consumer-live-stripe-payment-plan-postgres.mjs";
const runtimeSqlPath =
  "tests/postgres/flight-consumer-live-stripe-payment-plan-runtime.sql";
const migrationPath =
  "supabase/production-migrations/202608260103_flight_consumer_live_stripe_payment_intent_plan_journal.sql";
const rollbackPath =
  "supabase/production-rollbacks/202608260103_flight_consumer_live_stripe_payment_intent_plan_journal.rollback.sql";

const runner = readFileSync(runnerPath, "utf8");
const runtimeSql = readFileSync(runtimeSqlPath, "utf8");

function sha256(filePath: string) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function baseArguments() {
  return [
    runnerPath,
    "--psql",
    "C:\\definitely-not-present\\psql.exe",
    "--host",
    "127.0.0.1",
    "--port",
    "64996",
    "--admin-role",
    "postgres",
    "--behavior-db",
    "flight_stripe_gate_behavior_static01",
    "--rollback-db",
    "flight_stripe_gate_rollback_static01",
    "--cluster-guid",
    "d5f05d63eba94fc191591c5702b51e05",
    "--confirm-disposable",
    "APPLY_103_LOCAL_ONLY",
  ];
}

describe("Flight Consumer Live Stripe PostgreSQL acceptance runner", () => {
  it("pins the exact reviewed migration, rollback, and runtime SQL bytes", () => {
    expect(sha256(migrationPath)).toBe(
      "c4d5dec63faa07b37a2f57dc26a57faf94d698e09cf7f7e5be55a145a052d2cd",
    );
    expect(sha256(rollbackPath)).toBe(
      "29f22e4a5d9de9aa767695ede19b0026c03f60e9a2c534ac63768e5026492ed3",
    );
    expect(sha256(runtimeSqlPath)).toBe(
      "a5555a33a350ef9ff27710b3637e0d94c0cf43b94b2094eba468e68f4c50307e",
    );
    for (const digest of [
      sha256(migrationPath),
      sha256(rollbackPath),
      sha256(runtimeSqlPath),
    ]) {
      expect(runner).toContain(digest);
    }
    expect(runner).toContain("FIXED_FILES");
    expect(runner).toContain("Refusing to execute an unreviewed SQL file");
  });

  it("is loopback-only and accepts no URL, password, env file, or arbitrary SQL path", () => {
    expect(runner).toContain('parsed.host !== "127.0.0.1"');
    expect(runner).toContain("port < 49152 || port > 65535");
    expect(runner).toContain("Number(versionNumber) < 170000");
    expect(runner).toContain("Number(versionNumber) >= 180000");
    expect(runner).toContain('listenAddresses !== "127.0.0.1"');
    expect(runner).toContain('ssl !== "off"');
    expect(runner).toContain("DATABASE_PATTERN");
    expect(runner).toContain("codex-flight-pg-${parsed.clusterGuid}");
    expect(runner).toContain('`codex-flight-pg-${config.clusterGuid}`');
    expect(runner).toContain('"data"');
    expect(runner).toContain("PGPASSFILE");
    expect(runner).toContain('clean.PGSSLMODE = "disable"');
    expect(runner).not.toContain("Object.entries(process.env)");
    expect(runner).not.toMatch(/(?:from|import)\s+["']dotenv["']/);
    expect(runner).not.toMatch(/readFileSync\([^)]*["'][^"']*\.env["']/);
    expect(runner).not.toContain("--database-url");
    expect(runner).not.toContain('"--password"');
    expect(runner).not.toMatch(/https?:\/\//);
  });

  it("attests the exact local server process before the first PostgreSQL connection", () => {
    expect(runner).toContain('"postmaster.pid"');
    expect(runner).toContain("process.kill(pid, 0)");
    expect(runner).toContain("processExecutablePath(pid)");
    expect(runner).toContain("sameCanonicalPath(processExecutablePath(pid), postgres)");
    expect(runner).toContain('spawnSync(netstat, ["-ano", "-p", "TCP"]');
    expect(runner).toContain("Number(listeners[0].at(-1)) !== pid");
    expect(runner).toContain("validateLoopbackListenerOwner(config, pid)");
    expect(runner).toContain('lines[5] !== "127.0.0.1"');
    expect(runner).toContain('lines[7].trim() !== "ready"');
    expect(runner.indexOf("validatePreconnectServer(config);")).toBeLessThan(
      runner.indexOf("const probe = await scalar("),
    );
  });

  it("executes the exact buffers that passed SHA-256 review", () => {
    expect(runner).toContain("function loadFixedInputs()");
    expect(runner).toContain("config.fixedInputs.get(file)");
    expect(runner).toContain('args.push(file === undefined ? "--command" : "--file=-")');
    expect(runner).toContain("child.stdin.end(fixedBytes)");
    expect(runner).not.toContain('`--file=${file}`');
  });

  it("holds one atomic cluster-root run lock through cleanup", () => {
    expect(runner).toContain('openSync(lockPath, "wx", 0o600)');
    expect(runner).toContain("randomUUID()");
    expect(runner).toContain("recordedToken !== lock.token");
    expect(runner).toContain("const lock = acquireExclusiveRunLock(config)");
    expect(runner).toContain("releaseExclusiveRunLock(lock)");
    expect(runner).toContain("exclusiveClusterRunLockHeldThroughCleanup = true");
    expect(runner.indexOf("const lock = acquireExclusiveRunLock(config)")).toBeLessThan(
      runner.indexOf("const existingTargets = await scalar("),
    );
    expect(runner.indexOf("await cleanupDisposableState(config)")).toBeLessThan(
      runner.lastIndexOf("releaseExclusiveRunLock(lock)"),
    );
  });

  it("rejects a remote host before inspecting psql or connecting", () => {
    const args = baseArguments();
    args[args.indexOf("--host") + 1] = "db.example.invalid";
    const result = spawnSync(process.execPath, args, { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Host must be the exact IPv4 loopback address 127.0.0.1",
    );
  });

  it("rejects a database URL option before touching PostgreSQL", () => {
    const result = spawnSync(
      process.execPath,
      [runnerPath, "--database-url", "postgres://example.invalid/db"],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unknown or prohibited option: --database-url");
  });

  it("publishes safe help without attempting any connection", () => {
    const result = spawnSync(process.execPath, [runnerPath, "--help"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("APPLY_103_LOCAL_ONLY");
    expect(result.stdout).toContain("loopback-only");
    expect(result.stdout).toContain("never\naccepts a connection URL, password");
  });

  it("covers exact catalog shape, forced RLS, ACLs, and the zero-dispatch row", () => {
    for (const assertion of [
      "to_regclass(",
      "to_regprocedure(",
      "relrowsecurity",
      "relforcerowsecurity",
      "has_table_privilege",
      "has_function_privilege",
      "aclexplode",
      "pg_policy",
      "pg_trigger",
      "count(*) = 36",
      "count(*) = 5",
      "prosecdef",
      "rolsuper or owner_role.rolbypassrls",
      "search_path=pg_catalog, public",
      "permission denied for table flight_consumer_live_stripe_payment_intent_plans",
      "provider_request_count = 0",
      "stripe_mutation_count = 0",
      "not payment_authorized",
      "not consumer_release_enabled",
    ]) {
      expect(runtimeSql).toContain(assertion);
    }
    expect(runtimeSql).toContain(
      "migration 103 must expose no Stripe mutation lifecycle RPC",
    );
  });

  it("proves create, exact replay, every 12-field drift, malformed input, and ambiguity", () => {
    const comparedFields = [
      "execution_scope_sha256",
      "payment_binding_sha256",
      "order_reference_sha256",
      "customer_reference_sha256",
      "payment_attempt_reference_sha256",
      "metadata_sha256",
      "request_body_sha256",
      "request_envelope_sha256",
      "idempotency_request_sha256",
      "idempotency_key_sha256",
      "plan_sha256",
      "amount_cents",
    ];
    expect(runtimeSql).toContain("'created'");
    expect(runtimeSql).toContain("'replay'");
    for (const field of comparedFields) {
      expect(runtimeSql).toContain(`p_${field} =>`);
    }
    expect(runtimeSql.match(/payment plan idempotency collision/g)).toHaveLength(12);
    expect(runtimeSql.match(/payment plan evidence is invalid/g)).toHaveLength(3);
    expect(runtimeSql).toContain("payment plan identity is ambiguous");
    expect(runtimeSql).toContain("FLIGHT_STRIPE_PLAN_POSTGRES_GATE_PASS");
  });

  it("forces the real unique-violation race and both rollback branches", () => {
    expect(runner).toContain("pg_advisory_xact_lock(${ADVISORY_LOCK_KEY})");
    expect(runner).toContain("select pg_sleep(4)");
    expect(runner).toContain("winner's uncommitted-row advisory lock");
    expect(runner).toContain("waiting_lock.locktype = 'transactionid'");
    expect(runner).toContain("not waiting_lock.granted");
    expect(runner).toContain("exact loser never blocked on the winner's transaction ID");
    expect(runner).toContain("drift loser never blocked on the winner's transaction ID");
    expect(runner).toContain("payment plan concurrency collision");
    expect(runner).toContain('exactWinner: concurrency.exact.winner.decision');
    expect(runner).toContain('exactLoser: concurrency.exact.loser.decision');
    expect(runner).toContain('driftLoser: concurrency.drift.loser');
    expect(runner).toContain("Refusing rollback: Flight Consumer Live Stripe payment evidence exists");
    expect(runner).toContain('evidenceRollback: "refused_and_preserved"');
    expect(runner).toContain('emptyRollback: "succeeded"');
    expect(runner).toContain("behaviorRowsPreserved: 4");
    expect(runner).toContain("providerTraffic: false");
    expect(runner).toContain("credentialsRead: false");
    expect(runner).toContain("postgresVersion: cluster.versionText");
    expect(runner).toContain("serverVersionNumber: cluster.versionNumber");
    expect(runner).toContain("fixedSqlBytesPipedFromReviewedBuffers: true");
    expect(runner).toContain("disposableDatabasesDropped = true");
  });
});
