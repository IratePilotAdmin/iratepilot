import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const evidencePath =
  "docs/evidence/FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_MANAGED_DARK_ACCEPTANCE_2026-08-26.json";
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
    path: "scripts/flight-consumer-live-stripe-payment-plan-production-preflight.sql",
    sha256:
      "ed4c556e082b86e145d83192c07d40a96da5e75eb3c26f7cd921fa8ad8b1ddaa",
  },
  migration103: {
    path: "supabase/production-migrations/202608260103_flight_consumer_live_stripe_payment_intent_plan_journal.sql",
    sha256:
      "c4d5dec63faa07b37a2f57dc26a57faf94d698e09cf7f7e5be55a145a052d2cd",
  },
  verificationSql: {
    path: "scripts/flight-consumer-live-stripe-payment-plan-production-verification.sql",
    sha256:
      "6279f1d462130ed8328ae673262a796c5e4ead497a145346c6afb52e65533035",
  },
  rollback103: {
    path: "supabase/production-rollbacks/202608260103_flight_consumer_live_stripe_payment_intent_plan_journal.rollback.sql",
    sha256:
      "29f22e4a5d9de9aa767695ede19b0026c03f60e9a2c534ac63768e5026492ed3",
  },
};

describe("Flight Consumer Production Stripe payment-plan managed dark evidence", () => {
  it("pins every reviewed and executed repository artifact", () => {
    expect(evidence.reviewedArtifacts).toEqual(expectedArtifacts);
    for (const artifact of Object.values(expectedArtifacts)) {
      expect(sha256(artifact.path)).toBe(artifact.sha256);
    }
  });

  it("binds the receipt to the exact signed-in Production dashboard target", () => {
    expect(evidence).toMatchObject({
      version:
        "flight-consumer-stripe-payment-plan-production-dark-acceptance-v1",
      environment: "managed_supabase_consumer_production_dark",
      scope:
        "migration_103_production_object_apply_and_zero_dispatch_acceptance",
      result: "PASS",
      secretsIncluded: false,
      providerRequestIdentifiersIncluded: false,
    });
    expect(evidence.target).toEqual({
      provider: "Supabase",
      projectRef: "allliumarkejinplrggl",
      projectName: "iRatePilot Project",
      organizationName: "iRatePilot Group, LLC",
      intendedPurpose: "consumer_production_dark_payment_journal",
      consumerProduction: true,
      dashboardBranchLabel: "Production",
      region: "us-east-1",
      compute: "nano",
      postgresServiceVersion: "17.6.1.147",
      postgresServerVersionNum: 170006,
    });
    expect(evidence.preApplyState).toEqual({
      projectStatus: "Healthy",
      signedInDashboardProjectUrlAndHeaderVerified: true,
      migrationLedgerPresent: true,
      migrationLedgerLatestVersion: "202608220063",
      objectOnlyVersionsAbsentFromLedger: [
        "202608260099",
        "202608260101",
        "202608260102",
        "202608260103",
      ],
      targetObjectsAbsent: true,
      migration103LedgerEntryAbsent: true,
    });
  });

  it("records a guarded object-only apply without inventing a ledger receipt", () => {
    expect(evidence.authorization).toEqual({
      productionDarkObjectApplyAuthorizedAtActionTime: true,
      syntheticRollbackProbeAuthorizedAtActionTime: true,
      retroactiveLedgerRepairAuthorized: false,
      rollbackAuthorized: false,
      providerTrafficAuthorized: false,
      paymentAuthorized: false,
      bookingAuthorized: false,
      ticketingAuthorized: false,
      consumerReleaseAuthorized: false,
    });
    expect(evidence.application).toEqual({
      method: "guarded_supabase_dashboard_sql_editor",
      collisionAndLedgerPreflight: "passed",
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
      dashboardRlsHeuristicDisposition:
        "ran_exact_reviewed_source_without_dashboard_rewrite_migration_itself_enabled_and_forced_rls",
      transactionOutcome: "committed",
      standardMigrationLedgerState: "object_applied_not_ledgered",
      standardMigrationLedgerContains103: false,
      retroactiveLedgerRepairPerformed: false,
    });
  });

  it("records exact catalog, forced-RLS, ACL, runtime, and rollback proofs", () => {
    expect(evidence.objectVerification).toMatchObject({
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
      serviceRoleRecorderExecute: true,
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

  it("proves zero commerce traffic and advances only the object lineage", () => {
    expect(evidence.disposition).toEqual({
      activityScope: "production_migration_103_dark_gate_only",
      managedUatWritesPerformed: false,
      previewDatabaseWritesPerformed: false,
      productionDatabaseWritesPerformed: true,
      migrationJournalObjectsCreated: true,
      syntheticRowsRolledBack: true,
      permanentJournalRows: 0,
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
    const migration103 = lineage.production.versions.find(
      (entry: { version: string }) => entry.version === "202608260103",
    );
    expect(migration103).toMatchObject({
      forwardSha256: expectedArtifacts.migration103.sha256,
      rollbackSha256: expectedArtifacts.rollback103.sha256,
      status: "object_applied_via_guarded_dashboard_sql_not_ledgered",
      objectVerification: "passed",
    });
    expect(lineage.production.authoredUnappliedVersions.map(
      (entry: { version: string }) => entry.version,
    )).toEqual(["202608260104"]);
    expect(lineage.production.ledgerLatestObservedVersion).toBe("202608220063");
    expect(lineage.production.retroactiveLedgerRepairAuthorized).toBe(false);
    expect(lineage.preview.canonicalTip).toBe("202608260137");
    expect(lineage.reservedExternalRanges).toEqual([
      {
        owner: "car_rental",
        firstVersion: "202608260200",
        lastVersion: "202608260207",
        flightUseAuthorized: false,
      },
    ]);
    expect(evidence.lineageState).toEqual({
      productionMigration103Status:
        "object_applied_via_guarded_dashboard_sql_not_ledgered",
      productionMigration103ObjectVerification: "passed",
      productionMigration103LedgerEntryPresent: false,
      productionLedgerLatestObservedVersion: "202608220063",
      retroactiveLedgerRepairAuthorized: false,
      intentionalProductionVersionGap: "202608260100",
      canonicalPreviewRange: "202608260120-202608260137",
      canonicalPreviewTip: "202608260137",
      carReservedRangeUntouched: "202608260200-202608260207",
    });
    expect(evidence.outcome).toBe(
      "production_dark_payment_plan_journal_applied_verified_zero_dispatch",
    );
    expect(evidence.remainingLaunchGates).toHaveLength(9);
  });

  it("keeps Production SQL target-specific, transport-free, and rollback-safe", () => {
    const preflight = readFileSync(expectedArtifacts.preflightSql.path, "utf8");
    const verification = readFileSync(
      expectedArtifacts.verificationSql.path,
      "utf8",
    );
    for (const sql of [preflight, verification]) {
      expect(sql).toContain("allliumarkejinplrggl");
      expect(sql).toContain("202608220063");
      for (const version of [
        "202608260099",
        "202608260101",
        "202608260102",
        "202608260103",
      ]) {
        expect(sql).toContain(version);
      }
      expect(sql).not.toContain("exipwtvyjaihsvdhsbbt");
      expect(sql).not.toMatch(/FLIGHT_STRIPE_UAT/);
      expect(sql).not.toMatch(/https?:\/\//i);
      expect(sql).not.toMatch(
        /\b(?:dblink|http_get|http_post|pg_notify|lo_import|lo_export)\b|\bnet\./i,
      );
    }
    expect((preflight.match(/^begin;$/gim) ?? [])).toHaveLength(1);
    expect((preflight.match(/^commit;$/gim) ?? [])).toHaveLength(1);
    expect(preflight).not.toMatch(/^rollback;$/gim);
    expect(preflight).not.toMatch(
      /^\s*(?:create|alter|drop|truncate|insert|update|delete|merge|grant|revoke|comment)\b/gim,
    );
    expect((verification.match(/^begin;$/gim) ?? [])).toHaveLength(1);
    expect((verification.match(/^rollback;$/gim) ?? [])).toHaveLength(1);
    expect(verification).not.toMatch(/^commit;$/gim);
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
