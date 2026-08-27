import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const evidencePath =
  "docs/evidence/FLIGHT_CONSUMER_STRIPE_TEST_EXECUTION_JOURNAL_POSTGRES_ACCEPTANCE_2026-08-26.json";
const rawEvidence = readFileSync(evidencePath, "utf8");
const evidence = JSON.parse(rawEvidence);

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("Flight Consumer Stripe TEST execution PostgreSQL acceptance evidence", () => {
  it("pins every reviewed artifact to the locally exercised bytes", () => {
    expect(evidence.reviewedArtifacts).toEqual({
      migration104: {
        path: "supabase/production-migrations/202608260104_flight_consumer_stripe_test_execution_journal.sql",
        sha256: "50dcca75f06111de027833ca138519dbe7f71e91bfd5ca9839fa9425699dfa1b",
      },
      rollback104: {
        path: "supabase/production-rollbacks/202608260104_flight_consumer_stripe_test_execution_journal.rollback.sql",
        sha256: "10d9095be8250a1f50247534aa98e8fc35f51a06211458b5f19f1df43d9d2328",
      },
      runtimeSql: {
        path: "tests/postgres/flight-consumer-stripe-test-execution-journal-runtime.sql",
        sha256: "f2a6ff95565689f719f7b74223e39fa8d545885db03789c63b034e56ffc6bf3e",
      },
      serverPersistenceContract: {
        path: "lib/flights/consumer-production/stripe-test-execution-persistence.server.ts",
        sha256: "874648092eeb3bdcf04d62af60eaa87fb053fd7e691d9dc4e64dfe37ca25961b",
      },
    });
    for (const artifact of Object.values(evidence.reviewedArtifacts) as Array<{
      path: string;
      sha256: string;
    }>) {
      expect(sha256(artifact.path)).toBe(artifact.sha256);
    }
  });

  it("records the exact disposable PostgreSQL behavior and cleanup receipts", () => {
    expect(evidence.runtime).toEqual({
      databaseProduct: "PostgreSQL",
      serverVersionNum: 170011,
      serverVersion: "17.11",
      networkScope: "ipv4_loopback_only",
      clusterType: "local_disposable_codex_cluster",
      supabaseAuthRoleFunction: "minimal_local_stub",
    });
    expect(evidence.verification).toMatchObject({
      freshMigrationApplies: 2,
      catalogShape: "passed",
      postgresOwnership: "passed",
      forcedRlsAndAclClosure: "passed",
      serviceRoleRpcBoundary: "passed",
      attemptCreateAndExactReplay: "passed",
      leaseClaimAndRevisionCas: "passed",
      hashedPaymentIntentBinding: "passed",
      retrieveObservationWithExactLease: "passed",
      asyncWebhookClaimSupersessionWithExactRevision: "passed",
      webhookDigestReplayAndConflictRefusal: "passed",
      captureAndRefundObservationPlaceholders: "passed",
      expiredLeaseRecovery: "passed_after_bounded_15_second_expiry",
      blindRetryAuthorized: false,
      appendPreservation: "passed",
      runtimeReceipt: "FLIGHT_STRIPE104_POSTGRES_GATE_PASS",
      emptyJournalRollback: "passed_with_zero_remaining_objects",
      evidenceBearingRollback:
        "refused_and_preserved_4_attempts_3_webhook_events_4_observations",
      cleanupReceipt: "zero_gate_databases_zero_gate_roles_server_stopped",
    });
  });

  it("does not overstate managed, provider, payment, launch, or Production activity", () => {
    expect(evidence.activity).toEqual({
      localDisposableDatabaseWritesPerformed: true,
      managedSupabaseWritesPerformed: false,
      previewDatabaseWritesPerformed: false,
      productionDatabaseWritesPerformed: false,
      deploymentPerformed: false,
      providerTraffic: false,
      stripeTraffic: false,
      duffelTraffic: false,
      providerPaymentActivity: false,
      providerCaptureActivity: false,
      providerRefundActivity: false,
      syntheticJournalRowsWritten: true,
      syntheticPaymentAttemptRowsWritten: 4,
      syntheticWebhookEventRowsWritten: 3,
      syntheticPaymentObservationRowsWritten: 4,
      bookingActivity: false,
      ticketingActivity: false,
      credentialsRead: false,
      rawIdentifiersStored: false,
      rawPayloadsStored: false,
      sensitivePaymentMethodDataStored: false,
    });
    expect(evidence.lineage).toEqual({
      version: "202608260104",
      status: "authored_unapplied",
      target: "stripe_test_only",
      productionApplyAuthority: "not_granted",
      productionMigration103Modified: false,
      previewCanonicalRangeModified: false,
      carReservedRangeModified: false,
    });
    expect(evidence.limitations).toEqual({
      managedSupabaseAcceptance: "not_run",
      providerDispatch: "not_implemented",
      stripeWebhookSignatureVerification: "not_implemented_by_journal",
      workflowIntegration: "not_implemented",
      captureOrRefundDispatch: "not_implemented",
      consumerRelease: "not_authorized",
      productionApply: "not_authorized",
    });
    expect(rawEvidence).not.toMatch(
      /access[_-]?token|secret[_-]?key|database[_-]?url|project[_-]?ref|password/i,
    );
  });
});
