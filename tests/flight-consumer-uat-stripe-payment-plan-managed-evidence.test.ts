import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const evidencePath =
  "docs/evidence/FLIGHT_CONSUMER_UAT_STRIPE_PAYMENT_PLAN_MANAGED_ACCEPTANCE_2026-08-26.json";
const rawEvidence = readFileSync(evidencePath, "utf8");
const evidence = JSON.parse(rawEvidence).evidence;
const lineage = JSON.parse(
  readFileSync("supabase/flight_migration_lineage_manifest.json", "utf8"),
);

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const expectedArtifacts = {
  preflightSql: {
    path: "scripts/flight-consumer-live-stripe-payment-plan-managed-uat-preflight.sql",
    sha256:
      "e5f6852d1a1a170b69b17d7002800801a9e96a0afa8546797511cbcbcb685bfa",
  },
  migration103: {
    path: "supabase/production-migrations/202608260103_flight_consumer_live_stripe_payment_intent_plan_journal.sql",
    sha256:
      "c4d5dec63faa07b37a2f57dc26a57faf94d698e09cf7f7e5be55a145a052d2cd",
  },
  verificationSql: {
    path: "scripts/flight-consumer-live-stripe-payment-plan-managed-uat-verification.sql",
    sha256:
      "f0bcd64d8f1c92466ff717c7ec8f3d35f38b12b6cac3b3f7475bc506726b2d0d",
  },
  rollback103: {
    path: "supabase/production-rollbacks/202608260103_flight_consumer_live_stripe_payment_intent_plan_journal.rollback.sql",
    sha256:
      "29f22e4a5d9de9aa767695ede19b0026c03f60e9a2c534ac63768e5026492ed3",
  },
};

describe("Flight Consumer Stripe payment-plan managed-UAT evidence", () => {
  it("pins every reviewed and executed repository artifact", () => {
    expect(evidence.reviewedArtifacts).toEqual(expectedArtifacts);
    for (const artifact of Object.values(expectedArtifacts)) {
      expect(artifact.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(sha256(artifact.path)).toBe(artifact.sha256);
    }
  });

  it("binds acceptance to the isolated PG17 UAT target", () => {
    expect(evidence).toMatchObject({
      version: "flight-consumer-stripe-payment-plan-managed-uat-acceptance-v1",
      environment: "isolated_managed_supabase_uat",
      scope: "migration_103_managed_uat_apply_and_zero_dispatch_acceptance",
      result: "PASS",
      secretsIncluded: false,
      providerRequestIdentifiersIncluded: false,
    });
    expect(evidence.target).toEqual({
      provider: "Supabase",
      projectRef: "exipwtvyjaihsvdhsbbt",
      projectName: "iratepilot-flight-payment-uat-20260827",
      intendedPurpose: "flight_payment_uat_only",
      consumerProduction: false,
      dashboardBranchLabel: "Production",
      dashboardBranchLabelMeaning:
        "supabase_primary_branch_label_only_not_iratepilot_consumer_production",
      region: "us-east-1",
      compute: "micro",
      postgresServiceVersion: "17.6.1.165",
      postgresServerVersionNum: 170006,
      dataApiEnabled: false,
    });
    expect(evidence.preApplyState).toEqual({
      projectStatus: "Healthy",
      automaticRlsSelectedAtProvisioning: true,
      publicApplicationObjects: "no_tables_or_views",
      standardMigrationLedger: "no_migrations",
      githubRepositoryConnected: false,
      databaseBranches: 0,
      targetObjectsAbsent: true,
      migration103LedgerEntryAbsent: true,
    });
  });

  it("records the guarded object apply without inventing a ledger receipt", () => {
    expect(evidence.authorization).toEqual({
      managedUatApplyAuthorizedAtActionTime: true,
      syntheticRollbackProbeAuthorizedAtActionTime: true,
      productionApplyAuthorized: false,
      providerTrafficAuthorized: false,
      paymentAuthorized: false,
      bookingAuthorized: false,
      ticketingAuthorized: false,
      consumerReleaseAuthorized: false,
    });
    expect(evidence.application).toEqual({
      method: "guarded_supabase_dashboard_sql_editor",
      collisionPreflight: "passed",
      sourceHashVerifiedImmediatelyBeforeEntry: true,
      cleanEditorExecutedFromReviewedSource: true,
      remoteEditorByteIdentityCryptographicallyAttested: false,
      dashboardTargetAttestation:
        "signed_in_project_url_and_project_header_verified",
      runtimeDatabaseProjectRefInvariantAvailable: false,
      sqlReceiptProjectRefSemantics:
        "declared_dashboard_target_label_not_runtime_database_invariant",
      sqlReceiptZeroCountSemantics:
        "synthetic_journal_assertions_not_global_provider_telemetry",
      transactionOutcome: "committed",
      initialMixedBufferAttempt: {
        outcome: "parse_rejected_before_migration_application",
        followUpCleanPreflight: "passed_with_target_objects_absent",
      },
      standardMigrationLedgerState: "object_applied_not_ledgered",
      standardMigrationLedgerContains103: false,
      retroactiveLedgerRepairPerformed: false,
    });
  });

  it("records the exact catalog, forced-RLS, ACL, and runtime proof", () => {
    expect(evidence.objectVerification).toEqual({
      status: "passed",
      ordinaryPostgresOwnedTable: true,
      columnCount: 36,
      jsonJsonbOrByteaColumnCount: 0,
      exactValidReadyIndexCount: 5,
      allConstraintsValidatedImmediate: true,
      rowLevelSecurityEnabled: true,
      rowLevelSecurityForced: true,
      policyCount: 0,
      nonInternalTriggerCount: 0,
      recorderCount: 1,
      recorderOwner: "postgres",
      recorderSecurityDefiner: true,
      recorderLanguage: "plpgsql",
      recorderSearchPath: "pg_catalog, public",
      recorderExactTableResult: true,
      publicDirectTablePrivileges: false,
      anonDirectTablePrivileges: false,
      authenticatedDirectTablePrivileges: false,
      serviceRoleDirectTablePrivileges: false,
      serviceRoleRecorderExecute: true,
      anonRecorderExecute: false,
      authenticatedRecorderExecute: false,
      shadowRecorderPresent: false,
      mutationLifecycleRpcPresent: false,
      permanentRowCount: 0,
    });
    expect(evidence.runtimeProof).toEqual({
      modernRequestJwtClaimsServiceRole: "passed",
      serviceRoleDirectTableRead: "refused",
      firstPlan: "created",
      exactReplay: "replayed_same_plan_id",
      oneFieldDrift: "refused",
      malformedEvidence: "refused",
      ambiguousIdentity: "refused",
      syntheticJournalAssertions: {
        rowsObservedInsideTransaction: 2,
        rowsAfterRollback: 0,
        providerRequestCount: 0,
        stripeRequestCount: 0,
        stripeMutationCount: 0,
        paymentIntentCount: 0,
        chargeCount: 0,
        refundCount: 0,
        orderAuthorizedRowCount: 0,
        ticketingAuthorizedRowCount: 0,
      },
    });
  });

  it("denies external commerce authority and keeps Production lineage frozen", () => {
    expect(evidence.disposition).toEqual({
      activityScope: "this_managed_uat_gate_only",
      managedUatWritesPerformed: true,
      previewDatabaseWritesPerformed: false,
      productionDatabaseWritesPerformed: false,
      stripeTraffic: false,
      duffelTraffic: false,
      providerTraffic: false,
      paymentActivity: false,
      bookingActivity: false,
      ticketingActivity: false,
      credentialsRead: false,
      rawIdentifiersStored: false,
      rawPayloadsStored: false,
      paymentDataStored: false,
    });

    const migration103 = lineage.production.authoredUnappliedVersions.find(
      (entry: { version: string }) => entry.version === "202608260103",
    );
    expect(migration103).toMatchObject({
      status: "authored_unapplied",
      objectVerification: "not_run",
      applyAuthority: "not_granted",
    });
    expect(evidence.lineageState).toEqual({
      productionMigration103Status: migration103.status,
      productionMigration103ObjectVerification: migration103.objectVerification,
      productionMigration103ApplyAuthority: migration103.applyAuthority,
      uatMigration103ObjectStatus:
        "object_applied_via_guarded_dashboard_sql_not_ledgered",
      uatMigration103ObjectVerification: "passed",
      canonicalPreviewRange: "202608260120-202608260137",
      canonicalPreviewTip: "202608260137",
      carReservedRangeUntouched: "202608260200-202608260207",
    });
    expect(lineage.preview.canonicalVersions.at(0)).toBe("202608260120");
    expect(lineage.preview.canonicalVersions.at(-1)).toBe("202608260137");
    expect(lineage.preview.canonicalTip).toBe("202608260137");
    expect(lineage.reservedExternalRanges).toEqual([
      {
        owner: "car_rental",
        firstVersion: "202608260200",
        lastVersion: "202608260207",
        flightUseAuthorized: false,
      },
    ]);
    expect(evidence.outcome).toBe(
      "isolated_managed_supabase_uat_acceptance_passed_production_103_remains_unapplied",
    );
    expect(evidence.remainingLaunchGates).toHaveLength(3);
  });

  it("keeps the receipt sanitized and free of credentials or query IDs", () => {
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
      "queryid",
      "secretkey",
      "sessionid",
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
      expect(value).not.toMatch(
        /(?:sk|rk)_(?:live|test)_[a-z0-9]+|duffel_(?:live|test)_[a-z0-9]+|postgres(?:ql)?:\/\/|bearer\s+[a-z0-9._~-]+/i,
      );
      expect(value).not.toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    }
    expect(rawEvidence).not.toContain('"password"');
  });
});
