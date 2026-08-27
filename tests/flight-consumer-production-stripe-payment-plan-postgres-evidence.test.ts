import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const evidencePath =
  "docs/evidence/FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_POSTGRES_ACCEPTANCE_2026-08-26.json";
const rawEvidence = readFileSync(evidencePath, "utf8");
const evidence = JSON.parse(rawEvidence).evidence;
const lineage = JSON.parse(
  readFileSync("supabase/flight_migration_lineage_manifest.json", "utf8"),
);

function sha256(filePath: string) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

const expectedArtifacts = {
  migration103: {
    path: "supabase/production-migrations/202608260103_flight_consumer_live_stripe_payment_intent_plan_journal.sql",
    sha256: "c4d5dec63faa07b37a2f57dc26a57faf94d698e09cf7f7e5be55a145a052d2cd",
  },
  rollback103: {
    path: "supabase/production-rollbacks/202608260103_flight_consumer_live_stripe_payment_intent_plan_journal.rollback.sql",
    sha256: "29f22e4a5d9de9aa767695ede19b0026c03f60e9a2c534ac63768e5026492ed3",
  },
  runner: {
    path: "scripts/verify-flight-consumer-live-stripe-payment-plan-postgres.mjs",
    sha256: "a19a202f246810d8eb6e10e51bf1b9b422ba83f5ffde1864de9335b1fb71c780",
  },
  runtimeSql: {
    path: "tests/postgres/flight-consumer-live-stripe-payment-plan-runtime.sql",
    sha256: "a5555a33a350ef9ff27710b3637e0d94c0cf43b94b2094eba468e68f4c50307e",
  },
};

const expectedPreviewVersions = [
  "202608260120",
  "202608260121",
  "202608260122",
  "202608260123",
  "202608260124",
  "202608260125",
  "202608260126",
  "202608260127",
  "202608260128",
  "202608260129",
  "202608260130",
  "202608260131",
  "202608260132",
  "202608260133",
  "202608260134",
  "202608260135",
  "202608260136",
  "202608260137",
];

const expectedRemainingLaunchGates = [
  "Provision a dedicated flight-owned managed UAT target and separately authorize the exact migration-103 apply and object verification.",
  "Separately authorize and apply migration 103 to Production only after managed-UAT acceptance and a fresh collision preflight.",
  "Implement and verify the server-only Stripe PaymentIntent, webhook, reconciliation, refund, and failure-recovery workflow in Stripe test mode before any live charge.",
  "Run separately approved booking, payment, ticketing, servicing, monitoring, and consumer-release canaries before public launch.",
];

describe("Flight Consumer Production Stripe payment-plan PostgreSQL evidence", () => {
  it("pins every executed or reviewed repository artifact to its current bytes", () => {
    expect(evidence.reviewedArtifacts).toEqual(expectedArtifacts);
    for (const artifact of Object.values(expectedArtifacts) as Array<{
      path: string;
      sha256: string;
    }>) {
      expect(artifact.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(sha256(artifact.path)).toBe(artifact.sha256);
    }
    expect(evidence.postgresql.distribution).toEqual({
      landingPage: "https://www.postgresql.org/download/windows/",
      archiveUrl:
        "https://get.enterprisedb.com/postgresql/postgresql-17.11-1-windows-x64-binaries.zip",
      archiveSha256:
        "6eabdf00d2893713b75db4336a23c3fdf505f056e217ec6e2e95d901750cfea3",
      archiveBytes: 340719294,
    });
  });

  it("records strict PostgreSQL 17 loopback acceptance", () => {
    expect(evidence).toMatchObject({
      version:
        "flight-consumer-production-stripe-payment-plan-postgresql-17-acceptance-v1",
      environment: "local_disposable_postgresql_17",
      scope:
        "production_migration_103_local_runtime_acceptance_without_managed_database_or_provider_traffic",
      result: "PASS",
      secretsIncluded: false,
      providerReferencesIncluded: false,
    });
    expect(evidence.postgresql).toMatchObject({
      serverVersion: "17.11",
      serverVersionNum: 170011,
      network: "loopback_only",
      listenAddresses: "127.0.0.1",
      ssl: "off",
      serverProcessAttestedBeforeConnect: true,
      loopbackListenerOwnerAttestedBeforeConnect: true,
      fixedSqlBytesPipedFromReviewedBuffers: true,
      exclusiveClusterRunLockHeldThroughCleanup: true,
    });
    expect(evidence.postgresql.serverVersionNum).toBeGreaterThanOrEqual(170000);
    expect(evidence.postgresql.serverVersionNum).toBeLessThan(180000);
  });

  it("records deterministic replay, refusal, concurrency, and rollback proofs", () => {
    expect(evidence.runtimeProof).toMatchObject({
      freshDisposableDatabases: 2,
      catalogShapeAndConstraintPosture: "passed",
      forcedRlsAndExactAclClosure: "passed",
      zeroDispatchContract: "passed",
      exactReplay: "created_then_replay",
      sequentialDriftRefusals: 12,
      malformedInputRefusals: 3,
      identityAmbiguityRefused: true,
      exactConcurrency: {
        winner: "created",
        loser: "replay",
        transactionIdWaitObserved: true,
      },
      driftConcurrency: {
        winner: "created",
        loser: "concurrency_collision_refused",
        transactionIdWaitObserved: true,
      },
      evidenceRollback: "refused_and_transactionally_preserved",
      emptyRollback: "succeeded",
      behaviorRowsObservedBeforeCleanup: 4,
    });
  });

  it("proves local cleanup while denying managed and commerce authority", () => {
    expect(evidence.disposition).toMatchObject({
      localDisposableDatabaseWritesPerformed: true,
      disposableDatabasesDropped: true,
      disposableRolesDropped: true,
      temporaryServerStopped: true,
      temporaryRuntimeRootRemoved: false,
      managedDatabaseWritesPerformed: false,
      previewDatabaseWritesPerformed: false,
      productionDatabaseWritesPerformed: false,
      providerTraffic: false,
      stripeTraffic: false,
      duffelTraffic: false,
      credentialsRead: false,
    });
    expect(evidence.authority).toEqual({
      productionApplyAuthorized: false,
      paymentAuthorized: false,
      bookingAuthorized: false,
      ticketingAuthorized: false,
      consumerReleaseAuthorized: false,
    });
    expect(evidence.disposition.temporaryRuntimeRetentionReason).toBe(
      "host_recursive_delete_policy_blocked_removal_after_verified_stop",
    );
    expect(evidence.verification).toEqual({
      focusedRuntimeTestFilesPassed: 2,
      focusedRuntimeTestsPassed: 18,
      runnerStaticTestPath:
        "tests/flight-consumer-live-stripe-payment-plan-runtime-runner.test.ts",
      postgresqlRuntimeGate: "passed",
      failureCleanupReceipt: "zero_gate_databases_and_zero_gate_roles",
      successCleanupReceipt: "zero_gate_databases_and_zero_gate_roles",
    });
  });

  it("preserves the historical unapplied receipt while the live lineage advances", () => {
    const migration103 = lineage.production.versions.find(
      (entry: { version: string }) => entry.version === "202608260103",
    );
    expect(migration103).toMatchObject({
      version: "202608260103",
      forwardSha256: evidence.reviewedArtifacts.migration103.sha256,
      rollbackSha256: evidence.reviewedArtifacts.rollback103.sha256,
      status: "object_applied_via_guarded_dashboard_sql_not_ledgered",
      objectVerification: "passed",
    });
    expect(lineage.production.authoredUnappliedVersions).toEqual([]);
    expect(lineage.preview.canonicalVersions).toEqual(expectedPreviewVersions);
    expect(lineage.preview.canonicalTip).toBe("202608260137");
    expect(lineage.reservedExternalRanges).toEqual([
      {
        owner: "car_rental",
        firstVersion: "202608260200",
        lastVersion: "202608260207",
        flightUseAuthorized: false,
      },
    ]);
    expect(evidence.migrationState).toEqual({
      version: "202608260103",
      status: "authored_unapplied",
      objectVerification: "not_run",
      applyAuthority: "not_granted",
      canonicalPreviewRange: "202608260120-202608260137",
      canonicalPreviewTip: "202608260137",
      carReservedRangeUntouched: "202608260200-202608260207",
    });
    expect(evidence.outcome).toBe(
      "local_postgresql_17_runtime_acceptance_passed_103_remains_unapplied",
    );
    expect(evidence.remainingLaunchGates).toEqual(expectedRemainingLaunchGates);
  });

  it("keeps the evidence sanitized and free of local identifiers", () => {
    const prohibitedNormalizedKeys = new Set([
      "accesstoken",
      "apikey",
      "clientsecret",
      "connectionstring",
      "databaseurl",
      "duffeltoken",
      "password",
      "passphrase",
      "privatekey",
      "secretkey",
      "stripekey",
      "token",
    ]);
    const strings: string[] = [];
    const visit = (value: unknown): void => {
      if (typeof value === "string") {
        strings.push(value);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
          expect(prohibitedNormalizedKeys.has(normalizedKey)).toBe(false);
          visit(child);
        }
      }
    };
    visit(evidence);

    for (const value of strings) {
      expect(value).not.toMatch(/^[a-z]:[\\/]/i);
      expect(value).not.toMatch(/^(?:\\\\|\/\/)[^/\\]+[\\/]/);
      expect(value).not.toMatch(/^\/(?:users|home|tmp|private\/tmp|var\/tmp)(?:\/|$)/i);
      expect(value).not.toMatch(/codex-flight-pg-[0-9a-f]{16,}/i);
      expect(value).not.toMatch(/flight_stripe_gate_[a-z0-9_]+/i);
      expect(value).not.toMatch(
        /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
      );
      expect(value).not.toMatch(
        /(?:sk|rk)_(?:live|test)_[a-z0-9]+|duffel_(?:live|test)_[a-z0-9]+|postgres(?:ql)?:\/\/|bearer\s+[a-z0-9._~-]+/i,
      );
    }
    expect(rawEvidence).not.toContain('"password"');
  });
});
