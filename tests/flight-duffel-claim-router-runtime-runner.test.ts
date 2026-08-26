import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const runnerPath = "scripts/verify-flight-duffel-claim-router-postgres.mjs";
const baseRunnerPath =
  "scripts/verify-flight-provider-request-attempts-postgres.mjs";
const runtimeSqlPath =
  "tests/postgres/flight-duffel-claim-router-runtime.sql";
const runner = readFileSync(runnerPath, "utf8");
const runtimeSql = readFileSync(runtimeSqlPath, "utf8");

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
    "64996",
    "--admin-role",
    "postgres",
    "--primary-db",
    "flight_gate_claim_router_static01",
    "--rollback-db",
    "flight_gate_claim_rollback_static01",
    "--cluster-guid",
    "d5f05d63eba94fc191591c5702b51e05",
    "--confirm-disposable",
    "APPLY_068_073_DUFFEL_CLAIM_LOCAL_ONLY",
  ];
}

describe("Duffel claim-router disposable PostgreSQL gate", () => {
  it("pins the exact 068 through 073 chain, base gate, and focused SQL", () => {
    const expected = new Map([
      [
        "supabase/migrations/202608230068_flight_commerce_foundation.sql",
        "29f8cb9a45f69e7da23bffdf185ff6eaab2a514a35a22da4aa4b8c91cf08ef7d",
      ],
      [
        "supabase/migrations/202608240069_flight_provider_request_attempts.sql",
        "7e966c4fa6f08a92692787dd82fadd4c0205af02826342a3902037438b1bd611",
      ],
      [
        "supabase/migrations/202608250070_flight_duffel_test_order_attempts.sql",
        "882c20f4643ca5ed02cb5e5423e7dc140b54b7524a46f53e9c66e9af574e37fe",
      ],
      [
        "supabase/migrations/202608250071_flight_duffel_preview_rpc_bridge.sql",
        "bb4f8d4287060d5301e1704073e2d2c15b6dcfa1309cb1a190da9efddefa375d",
      ],
      [
        "supabase/migrations/202608250072_flight_duffel_preview_runtime_assertions.sql",
        "b8e073508ebe45be717f6d07fe463eae33eaf7d5d168076a903ffc552f08ca0b",
      ],
      [
        "supabase/migrations/202608250073_flight_duffel_claim_terminal_return.sql",
        "b9f6a6a25cf9cd5f1ad46e27a93b572d8e555a37ae08294391f2f575bcd7e045",
      ],
      [
        baseRunnerPath,
        "cb3edfb0aec410a1c3fd8f647963f00b6d7b247105bdd75ad621885808d8a9c4",
      ],
      [
        runtimeSqlPath,
        "5ccccfa1ffe1bb3804fef0ee493894895085e37eb301f1c827fc01336ac5b6d9",
      ],
    ]);

    for (const [file, hash] of expected) {
      expect(sha256(file), file).toBe(hash);
      expect(runner, `${file} must be pinned by the runner`).toContain(hash);
    }
    expect(runner).toContain("validateFixedInputs");
    expect(runner).toContain("await runBaseGate(config)");
  });

  it("is loopback-only, disposable-only, and cannot read credentials or arbitrary SQL", () => {
    for (const evidence of [
      'parsed.host !== "127.0.0.1"',
      "port < 49152 || port > 65535",
      "DATABASE_PATTERN",
      "codex-flight-pg-${parsed.clusterGuid}",
      "Refusing to execute an unreviewed SQL file",
      "PGPASSFILE",
      'clean.PGSSLMODE = "disable"',
      "previewDatabaseTouched: false",
      "providerTraffic: false",
      "credentialsRead: false",
    ]) {
      expect(runner).toContain(evidence);
    }
    expect(runner).not.toContain("DUFFEL_TEST_ACCESS_TOKEN");
    expect(runner).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(runner).not.toContain("--database-url");
    expect(runner).not.toContain("--password");
    expect(runner).not.toMatch(/readFileSync\([^)]*["'][^"']*\.env["']/);
  });

  it("rejects a non-loopback host before filesystem or PostgreSQL access", () => {
    const args = baseArguments();
    args[args.indexOf("--host") + 1] = "localhost";
    const result = spawnSync(process.execPath, args, { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Host must be the exact IPv4 loopback address 127.0.0.1",
    );
  });

  it("publishes explicit safe help without attempting a connection", () => {
    const result = spawnSync(process.execPath, [runnerPath, "--help"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "APPLY_068_073_DUFFEL_CLAIM_LOCAL_ONLY",
    );
    expect(result.stdout).toContain("It never");
    expect(result.stdout).toContain(
      "accepts a URL, password, Preview database, credential, or arbitrary SQL path",
    );
  });

  it("proves one committed wrapper claim and an exact second-claim CAS refusal", () => {
    for (const evidence of [
      "prepare_flight_provider_attempt_rpc",
      "claim_flight_provider_attempt_rpc",
      "claim_flight_provider_order_attempt_for_dispatch",
      "first wrapper claim must commit exactly dispatching revision one",
      "Duffel test order dispatch CAS failed",
      "second claim failure must preserve exactly the committed dispatching revision-one row",
      "operation = 'create_order'",
      "revision = 1",
      "state = 'dispatching'",
      "terminal_http_status is null",
      "terminal_response_sha256 is null",
      "terminal_response_bytes is null",
      "not retry_authorized",
      "FLIGHT_DUFFEL_CLAIM_ROUTER_RUNTIME_PASS",
    ]) {
      expect(runtimeSql).toContain(evidence);
    }
    expect(runtimeSql).toMatch(
      /begin;\s*select \*\s+from public\.claim_flight_provider_attempt_rpc[\s\S]*?\\gset claimed_\s*commit;/,
    );
    expect(runtimeSql.indexOf("\\gset claimed_")).toBeLessThan(
      runtimeSql.lastIndexOf("expect_second_claim_cas"),
    );
    expect(runtimeSql).not.toContain("response_status");
    expect(runtimeSql).not.toContain("provider_request_id_sha256");
  });
});
