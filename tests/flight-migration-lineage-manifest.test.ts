import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_FLIGHT_MIGRATION_VERSIONS,
  RETIRED_FLIGHT_MIGRATION_VERSIONS,
  SHARED_HOTEL_MIGRATION,
// @ts-expect-error -- The migration gate is an executable .mjs module without a declaration file.
} from "../scripts/apply-flight-preview-migrations.mjs";

const manifestPath = "supabase/flight_migration_lineage_manifest.json";
const rawManifest = readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(rawManifest);

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("flight migration lineage freeze manifest", () => {
  it("freezes the retired-to-canonical Preview mapping and tip", () => {
    expect(manifest.preview.requiredRemoteFlightBaselineTip).toBe("202608250080");
    expect(manifest.preview.canonicalVersions).toEqual(CANONICAL_FLIGHT_MIGRATION_VERSIONS);
    expect(manifest.preview.canonicalTip).toBe("202608260138");
    expect(manifest.preview.canonicalRange).toBe("202608260120-202608260138");
    expect(manifest.preview.retiredVersionMap.map(
      ({ retired }: { retired: string }) => retired,
    )).toEqual(RETIRED_FLIGHT_MIGRATION_VERSIONS);
    expect(manifest.preview.retiredVersionMap.map(
      ({ canonical }: { canonical: string }) => canonical,
    )).toEqual(CANONICAL_FLIGHT_MIGRATION_VERSIONS.slice(0, -1));
    expect(manifest.preview.canonicalTipArtifact).toEqual({
      version: "202608260138",
      filename: "202608260138_flight_ticket_document_identity_scope_repair.sql",
      forwardSha256: "8c9852a6d27c23512bfecfc589321109c0c3b0944bbe0a27aa519e6ef46704e7",
      rollbackFilename:
        "202608260138_flight_ticket_document_identity_scope_repair.rollback.sql",
      rollbackSha256:
        "7265425bea2497961f4ca64199f9cabce4a05a149cc59a4bc4d9cbca237cca37",
      status: "applied_via_authenticated_preview_sql_and_ledgered",
      targetEnvironment: "preview_test_only",
      appliedOn: "2026-08-27",
      managedPreviewProjectRef: "eiqmdldjnedqgbtoozqa",
      applyMethod: "authenticated_supabase_preview_sql_editor",
      physicalVerification: {
        legacyExecutionScopeConstraintPresent: false,
        replacementConstraint: "UNIQUE (order_id, document_ref_sha256)",
        runtimeLockedAtApply: true,
      },
      ledgerReceipt: {
        version: "202608260138",
        name: "flight_ticket_document_identity_scope_repair",
        forwardSha256:
          "8c9852a6d27c23512bfecfc589321109c0c3b0944bbe0a27aa519e6ef46704e7",
        verified: true,
      },
    });
    expect(sha256(
      `supabase/migrations/${manifest.preview.canonicalTipArtifact.filename}`,
    )).toBe(manifest.preview.canonicalTipArtifact.forwardSha256);
    expect(sha256(
      `supabase/rollbacks/${manifest.preview.canonicalTipArtifact.rollbackFilename}`,
    )).toBe(manifest.preview.canonicalTipArtifact.rollbackSha256);
    expect(manifest.preview.ledgerVerification).toEqual({
      status: "verified_mixed_legacy_lineage_blocked",
      verifiedOn: "2026-08-27",
      managedPreviewProjectRef: "eiqmdldjnedqgbtoozqa",
      observedCanonicalTipReceipt: "202608260138",
      observedRetiredFlightRange: "202608250081-202608250098",
      observedVersion082Owner: "legacy_flight_consumer_activation_cas_qualification",
      expectedVersion082Owner: "hotel_commercial_agreement_evidence",
      canonicalInstallerApplyReady: false,
      retroactiveLedgerRepairAuthorized: false,
      blockers: [
        "retired_flight_identifiers_081_through_098_are_present",
        "hotel_owned_202608250082_is_not_ledgered",
      ],
    });
    expect(manifest.preview.stripeTestJournal104Qualification).toEqual({
      status: "preexisting_objects_verified_not_ledgered",
      verifiedOn: "2026-08-27",
      managedPreviewProjectRef: "eiqmdldjnedqgbtoozqa",
      applicationProvenance: "unknown_preexisting_managed_state",
      forwardMigrationAppliedThisRun: false,
      migrationLedgerEntryPresent: false,
      syntheticRowsAfterSavepointRollback: 0,
      providerRequests: 0,
      stripeRequests: 0,
      charges: 0,
      orders: 0,
      tickets: 0,
      productionRepositoryClassification: "authored_unapplied",
      productionObjectState: "read_only_verified_absent",
      productionLedgerEntryPresent: false,
      productionObservedProjectRef: "allliumarkejinplrggl",
      productionObservedOn: "2026-08-27",
      acceptanceEvidence:
        "docs/evidence/FLIGHT_CONSUMER_STRIPE_TEST_JOURNAL_104_PREVIEW_MANAGED_QUALIFICATION_2026-08-27.json",
      acceptanceEvidenceSha256:
        "0a1be1faab058c870f9c3be6e7b6dfbab505fe2cb055df516b6dfb502c08f09f",
    });
    expect(sha256(
      manifest.preview.stripeTestJournal104Qualification.acceptanceEvidence,
    )).toBe(
      manifest.preview.stripeTestJournal104Qualification.acceptanceEvidenceSha256,
    );
  });

  it("keeps every retired flight artifact absent and every canonical pair present", () => {
    const migrationNames = readdirSync("supabase/migrations");
    const rollbackNames = readdirSync("supabase/rollbacks");
    for (const version of RETIRED_FLIGHT_MIGRATION_VERSIONS) {
      expect(migrationNames.some((name) => name.startsWith(`${version}_flight_`))).toBe(false);
      expect(rollbackNames.some((name) => name.startsWith(`${version}_flight_`))).toBe(false);
    }
    for (const version of CANONICAL_FLIGHT_MIGRATION_VERSIONS) {
      expect(migrationNames.filter((name) => name.startsWith(`${version}_flight_`))).toHaveLength(1);
      expect(rollbackNames.filter((name) => name.startsWith(`${version}_flight_`))).toHaveLength(1);
    }
  });

  it("records hotel ownership without granting it to the flight gate", () => {
    expect(manifest.sharedHotelOwnership).toEqual({
      version: SHARED_HOTEL_MIGRATION.version,
      filename: SHARED_HOTEL_MIGRATION.filename,
      forwardSha256: SHARED_HOTEL_MIGRATION.sha256,
      rollbackSha256: SHARED_HOTEL_MIGRATION.rollbackSha256,
      status: "published_deferred_unapplied",
      requiredAsAppliedExternalPredecessorBeforeFlightApply: true,
      flightGateApplyAuthority: "never_authorized",
    });
    expect(sha256(`supabase/migrations/${SHARED_HOTEL_MIGRATION.filename}`))
      .toBe(SHARED_HOTEL_MIGRATION.sha256);
    expect(sha256(`supabase/rollbacks/${SHARED_HOTEL_MIGRATION.rollbackFilename}`))
      .toBe(SHARED_HOTEL_MIGRATION.rollbackSha256);
  });

  it("pins Production object-applied artifacts while preserving the intentional 100 gap", () => {
    expect(manifest.production.ledgerLatestObservedVersion).toBe("202608220063");
    expect(manifest.production.retroactiveLedgerRepairAuthorized).toBe(false);
    expect(manifest.production.intentionallyUnused).toEqual({
      version: "202608260100",
      status: "never_created_never_applied_intentionally_unused",
    });
    expect(manifest.production.versions.map(
      ({ version }: { version: string }) => version,
    )).toEqual([
      "202608260099",
      "202608260101",
      "202608260102",
      "202608260103",
    ]);
    expect(existsSync("supabase/production-migrations/202608260100_flight.sql")).toBe(false);
    expect(readdirSync("supabase/production-migrations").some(
      (name) => name.startsWith("202608260100_"),
    )).toBe(false);
    expect(readdirSync("supabase/production-rollbacks").some(
      (name) => name.startsWith("202608260100_"),
    )).toBe(false);

    for (const entry of manifest.production.versions) {
      const forwardPath = `supabase/production-migrations/${entry.filename}`;
      const rollbackPath = `supabase/production-rollbacks/${entry.filename.replace(/\.sql$/, ".rollback.sql")}`;
      expect(entry.status).toBe("object_applied_via_guarded_dashboard_sql_not_ledgered");
      expect(entry.objectVerification).toBe("passed");
      expect(sha256(forwardPath)).toBe(entry.forwardSha256);
      expect(sha256(rollbackPath)).toBe(entry.rollbackSha256);
    }
  });

  it("hash-pins the verified Production Stripe plan journal as object-applied", () => {
    const entry = manifest.production.versions.find(
      ({ version }: { version: string }) => version === "202608260103",
    );
    expect(entry).toEqual({
      version: "202608260103",
      filename: "202608260103_flight_consumer_live_stripe_payment_intent_plan_journal.sql",
      forwardSha256: "c4d5dec63faa07b37a2f57dc26a57faf94d698e09cf7f7e5be55a145a052d2cd",
      rollbackSha256: "29f22e4a5d9de9aa767695ede19b0026c03f60e9a2c534ac63768e5026492ed3",
      status: "object_applied_via_guarded_dashboard_sql_not_ledgered",
      objectVerification: "passed",
    });
    if (!entry) {
      throw new Error("Production migration 103 is missing from the lineage manifest");
    }
    expect(manifest.production.authoredUnappliedVersions.map(
      ({ version }: { version: string }) => version,
    )).toEqual([
      "202608260104",
      "202608260105",
      "202608260106",
      "202608260107",
      "202608260108",
      "202608260109",
      "202608260110",
      "202608260111",
      "202608260112",
      "202608260113",
      "202608260114",
      "202608260115",
      "202608260116",
      "202608260117",
      "202608260118",
      "202608260119",
      "202608260139",
    ]);

    const rollbackFilename = entry.filename.replace(/\.sql$/, ".rollback.sql");
    expect(sha256(`supabase/production-migrations/${entry.filename}`))
      .toBe(entry.forwardSha256);
    expect(sha256(`supabase/production-rollbacks/${rollbackFilename}`))
      .toBe(entry.rollbackSha256);
    expect(existsSync(`supabase/migrations/${entry.filename}`)).toBe(false);
    expect(existsSync(`supabase/rollbacks/${rollbackFilename}`)).toBe(false);
    expect(readdirSync("supabase/migrations").some(
      (filename) => filename.startsWith("202608260103_"),
    )).toBe(false);
    expect(readdirSync("supabase/rollbacks").some(
      (filename) => filename.startsWith("202608260103_"),
    )).toBe(false);
    expect(entry.version < "202608260200").toBe(true);
    const appliedVersions = new Set(manifest.production.versions.map(
      ({ version }: { version: string }) => version,
    ));
    const authoredVersions = manifest.production.authoredUnappliedVersions.map(
      ({ version }: { version: string }) => version,
    );
    expect(authoredVersions).toEqual([
      "202608260104",
      "202608260105",
      "202608260106",
      "202608260107",
      "202608260108",
      "202608260109",
      "202608260110",
      "202608260111",
      "202608260112",
      "202608260113",
      "202608260114",
      "202608260115",
      "202608260116",
      "202608260117",
      "202608260118",
      "202608260119",
      "202608260139",
    ]);
    expect(authoredVersions.some((version: string) => appliedVersions.has(version)))
      .toBe(false);

    const expectedForward = [
      ...manifest.production.versions,
      ...manifest.production.authoredUnappliedVersions,
    ].map(({ filename }: { filename: string }) => filename).sort();
    const expectedRollback = expectedForward.map(
      (filename: string) => filename.replace(/\.sql$/, ".rollback.sql"),
    ).sort();
    expect(readdirSync("supabase/production-migrations").sort()).toEqual(expectedForward);
    expect(readdirSync("supabase/production-rollbacks").sort()).toEqual(expectedRollback);
  });

  it("hash-pins the Stripe TEST execution journal as authored and unapplied", () => {
    const entry = manifest.production.authoredUnappliedVersions.find(
      ({ version }: { version: string }) => version === "202608260104",
    );
    expect(entry).toEqual({
      version: "202608260104",
      filename: "202608260104_flight_consumer_stripe_test_execution_journal.sql",
      forwardSha256: "50dcca75f06111de027833ca138519dbe7f71e91bfd5ca9839fa9425699dfa1b",
      rollbackSha256: "10d9095be8250a1f50247534aa98e8fc35f51a06211458b5f19f1df43d9d2328",
      status: "authored_unapplied",
      targetEnvironment: "stripe_test_only",
      objectVerification: "not_run_managed",
      localPostgresqlVerification: "passed_postgresql_17_11",
      acceptanceEvidence:
        "docs/evidence/FLIGHT_CONSUMER_STRIPE_TEST_EXECUTION_JOURNAL_POSTGRES_ACCEPTANCE_2026-08-26.json",
      acceptanceEvidenceSha256:
        "72e79220dd96050ef9dce9c0c809dc3ea4a720dc481c85c11a88eb20c13f37bc",
      applyAuthority: "not_granted",
      productionApplyAuthority: "not_granted",
    });

    if (!entry) throw new Error("Production-local migration 104 is missing");
    const rollbackFilename = entry.filename.replace(/\.sql$/, ".rollback.sql");
    expect(sha256(`supabase/production-migrations/${entry.filename}`))
      .toBe(entry.forwardSha256);
    expect(sha256(`supabase/production-rollbacks/${rollbackFilename}`))
      .toBe(entry.rollbackSha256);
    expect(sha256(entry.acceptanceEvidence)).toBe(entry.acceptanceEvidenceSha256);
    expect(existsSync(`supabase/migrations/${entry.filename}`)).toBe(false);
    expect(existsSync(`supabase/rollbacks/${rollbackFilename}`)).toBe(false);
    expect(entry.version).toBe("202608260104");
    expect(entry.version < "202608260120").toBe(true);
    expect(entry.version < "202608260200").toBe(true);
    expect(manifest.production.versions.some(
      ({ version }: { version: string }) => version === entry.version,
    )).toBe(false);
  });

  it("hash-pins Duffel live-offer refresh journal 105 as authored and unapplied", () => {
    const entry = manifest.production.authoredUnappliedVersions.find(
      ({ version }: { version: string }) => version === "202608260105",
    );
    expect(entry).toEqual({
      version: "202608260105",
      filename:
        "202608260105_flight_consumer_live_duffel_offer_refresh_journal.sql",
      forwardSha256:
        "c10757ec05ab4c1f55b9da881e37c74679cc8a44c6e0afe3298ae1d7da8249b9",
      rollbackSha256:
        "35c911dd6c7d8370ec612fa6306796bc02232d600e4f4a403a7125b7269259b0",
      status: "authored_unapplied",
      targetEnvironment: "production_dark_only",
      objectVerification: "not_run_managed",
      localPostgresqlVerification: "not_run",
      providerRequests: 0,
      applyAuthority: "not_granted",
      productionApplyAuthority: "not_granted",
    });
    if (!entry) throw new Error("Production-local migration 105 is missing");

    const rollbackFilename = entry.filename.replace(/\.sql$/, ".rollback.sql");
    expect(sha256(`supabase/production-migrations/${entry.filename}`))
      .toBe(entry.forwardSha256);
    expect(sha256(`supabase/production-rollbacks/${rollbackFilename}`))
      .toBe(entry.rollbackSha256);
    expect(existsSync(`supabase/migrations/${entry.filename}`)).toBe(false);
    expect(existsSync(`supabase/rollbacks/${rollbackFilename}`)).toBe(false);
    expect(entry.version < "202608260120").toBe(true);
    expect(entry.version < "202608260200").toBe(true);
    expect(manifest.production.versions.some(
      ({ version }: { version: string }) => version === entry.version,
    )).toBe(false);
  });

  it("hash-pins Stripe live execution journal 106 as authored and unapplied", () => {
    const entry = manifest.production.authoredUnappliedVersions.find(
      ({ version }: { version: string }) => version === "202608260106",
    );
    expect(entry).toEqual({
      version: "202608260106",
      filename:
        "202608260106_flight_consumer_live_stripe_payment_execution_journal.sql",
      forwardSha256:
        "f2f5a076765cd58236add5ecebc7b2baff448d5c4685c0552766228f137c4da2",
      rollbackSha256:
        "73c4a0654a3310341b3403fe7589b06b06b7df754ced02d84b045d7febf29d33",
      status: "authored_unapplied",
      targetEnvironment: "production_dark_only",
      objectVerification: "not_run_managed",
      localPostgresqlVerification: "passed_pglite_0_5_7_postgresql_18_3",
      implementationArtifact:
        "lib/flights/consumer-production/stripe-live-payment-execution-persistence.server.ts",
      implementationArtifactSha256:
        "ab56dd8e69d8ef43a6a66cb7236f5723c53e54f3cb46a9de201b6c10874a1da2",
      stripeCreateOrchestratorArtifact:
        "lib/flights/consumer-production/stripe-live-payment-intent-create-orchestrator.server.ts",
      stripeCreateOrchestratorArtifactSha256:
        "c7c1f1cd9f81ae93b3de368253ffb63c9a86661fe11c7811493c866a4be9c36f",
      stripeRequests: 0,
      routeExposed: false,
      stripeCreateOrchestratorImplemented: true,
      stripeTransportImplemented: false,
      applyAuthority: "not_granted",
      productionApplyAuthority: "not_granted",
    });
    if (!entry) throw new Error("Production-local migration 106 is missing");

    const rollbackFilename = entry.filename.replace(/\.sql$/, ".rollback.sql");
    expect(sha256(`supabase/production-migrations/${entry.filename}`))
      .toBe(entry.forwardSha256);
    expect(sha256(`supabase/production-rollbacks/${rollbackFilename}`))
      .toBe(entry.rollbackSha256);
    expect(sha256(entry.implementationArtifact))
      .toBe(entry.implementationArtifactSha256);
    expect(sha256(entry.stripeCreateOrchestratorArtifact))
      .toBe(entry.stripeCreateOrchestratorArtifactSha256);
    expect(existsSync(`supabase/migrations/${entry.filename}`)).toBe(false);
    expect(existsSync(`supabase/rollbacks/${rollbackFilename}`)).toBe(false);
    expect(entry.version < "202608260120").toBe(true);
    expect(entry.version < "202608260200").toBe(true);
    expect(manifest.production.versions.some(
      ({ version }: { version: string }) => version === entry.version,
    )).toBe(false);
  });

  it("hash-pins checkout evidence aggregate 107 as authored and unapplied", () => {
    const entry = manifest.production.authoredUnappliedVersions.find(
      ({ version }: { version: string }) => version === "202608260107",
    );
    expect(entry).toEqual({
      version: "202608260107",
      filename:
        "202608260107_flight_consumer_live_checkout_evidence_aggregate.sql",
      forwardSha256:
        "29dc826842d675d96e0649e87c474d900621085ef09b730f616fb2f230cc6f94",
      rollbackSha256:
        "e18efdbeb3d7518dc8c544f435863a7c71053c4c705d6830063127cf3565581e",
      status: "authored_unapplied",
      targetEnvironment: "production_dark_only",
      objectVerification: "not_run_managed",
      localPostgresqlVerification: "not_run",
      implementationArtifact:
        "lib/flights/consumer-production/checkout-evidence-persistence.server.ts",
      implementationArtifactSha256:
        "6c7229785b8e79ec9266f6fc04c8e349fbe33666ee0dd1af50fd204c0eeaf300",
      providerRequests: 0,
      stripeRequests: 0,
      routeExposed: false,
      duffelTransportImplemented: false,
      stripeTransportImplemented: false,
      applyAuthority: "not_granted",
      productionApplyAuthority: "not_granted",
    });
    if (!entry) throw new Error("Production-local migration 107 is missing");

    const rollbackFilename = entry.filename.replace(/\.sql$/, ".rollback.sql");
    expect(sha256(`supabase/production-migrations/${entry.filename}`))
      .toBe(entry.forwardSha256);
    expect(sha256(`supabase/production-rollbacks/${rollbackFilename}`))
      .toBe(entry.rollbackSha256);
    expect(sha256(entry.implementationArtifact))
      .toBe(entry.implementationArtifactSha256);
    expect(existsSync(`supabase/migrations/${entry.filename}`)).toBe(false);
    expect(existsSync(`supabase/rollbacks/${rollbackFilename}`)).toBe(false);
    expect(entry.version < "202608260120").toBe(true);
    expect(entry.version < "202608260200").toBe(true);
    expect(manifest.production.versions.some(
      ({ version }: { version: string }) => version === entry.version,
    )).toBe(false);
  });

  it("hash-pins Duffel live order execution 108 as authored and unapplied", () => {
    const entry = manifest.production.authoredUnappliedVersions.find(
      ({ version }: { version: string }) => version === "202608260108",
    );
    expect(entry).toEqual({
      version: "202608260108",
      filename:
        "202608260108_flight_consumer_live_duffel_order_execution_journal.sql",
      forwardSha256:
        "51688027dd052781981c12aa9e36c0bf66621e3937ac32e4b749faec12fa2093",
      rollbackSha256:
        "1ebeb2be3fda61f641e8c22af014bc367a1da56d6ad0483489c4170ab7919dee",
      status: "authored_unapplied",
      targetEnvironment: "production_dark_only",
      objectVerification: "not_run_managed",
      localPostgresqlVerification: "passed_pglite_0_5_7_postgresql_18_3",
      implementationArtifact:
        "lib/flights/consumer-production/duffel-live-order-execution-persistence.server.ts",
      implementationArtifactSha256:
        "f13b75d1b5b571026d4b439bd0a432ea78b4a5a4871219d7bbf0316d983c75bf",
      orderCreateOrchestratorArtifact:
        "lib/flights/consumer-production/duffel-live-order-create-orchestrator.server.ts",
      orderCreateOrchestratorArtifactSha256:
        "01375a9b318206b5881fb2e4c8671a68cc5353e9efe8e73afa47ed53679033ae",
      providerRequests: 0,
      orderRequests: 0,
      routeExposed: false,
      duffelTransportImplemented: false,
      claimGrantsDispatchAuthority: false,
      futurePaymentAuthorizationPrerequisiteVersion: "202608260109",
      applyAuthority: "not_granted",
      productionApplyAuthority: "not_granted",
    });
    if (!entry) throw new Error("Production-local migration 108 is missing");

    const rollbackFilename = entry.filename.replace(/\.sql$/, ".rollback.sql");
    expect(sha256(`supabase/production-migrations/${entry.filename}`))
      .toBe(entry.forwardSha256);
    expect(sha256(`supabase/production-rollbacks/${rollbackFilename}`))
      .toBe(entry.rollbackSha256);
    expect(sha256(entry.implementationArtifact))
      .toBe(entry.implementationArtifactSha256);
    expect(sha256(entry.orderCreateOrchestratorArtifact))
      .toBe(entry.orderCreateOrchestratorArtifactSha256);
    expect(entry.version < "202608260120").toBe(true);
    expect(entry.version < "202608260200").toBe(true);
    expect(manifest.production.versions.some(
      ({ version }: { version: string }) => version === entry.version,
    )).toBe(false);
  });

  it("hash-pins Stripe live confirmation journal 109 as authored and unapplied", () => {
    const entry = manifest.production.authoredUnappliedVersions.find(
      ({ version }: { version: string }) => version === "202608260109",
    );
    expect(entry).toEqual({
      version: "202608260109",
      filename:
        "202608260109_flight_consumer_live_stripe_confirmation_journal.sql",
      forwardSha256:
        "60acdb04b44e980b778de1f997791d6ab773d656efc54a64231d6c8f635e9d68",
      rollbackSha256:
        "4b43fe4b617cdb9694b9f8562a923b46b7bf16dfc244c44765216c55897723c9",
      status: "authored_unapplied",
      targetEnvironment: "production_dark_only",
      objectVerification: "not_run_managed",
      localPostgresqlVerification: "passed_pglite_0_5_7_postgresql_18_3",
      implementationArtifact:
        "lib/flights/consumer-production/stripe-confirmation-evidence-persistence.server.ts",
      implementationArtifactSha256:
        "239a6e6c23b681886b7c8ed0e71770a6ccb7102e604a294ca94a5c94f93f58ff",
      stripeConfirmationOrchestratorArtifact:
        "lib/flights/consumer-production/stripe-live-payment-intent-confirmation-orchestrator.server.ts",
      stripeConfirmationOrchestratorArtifactSha256:
        "9c89d3c022430d99d143fa2d75900d3c917d9da22302354b8601866941e0387f",
      confirmationReleaseBoundaryArtifact:
        "docs/FLIGHT_CONSUMER_PRODUCTION_STRIPE_CONFIRMATION_DARK_GATE.md",
      confirmationReleaseBoundaryArtifactSha256:
        "bd601d7739add7ef983cc85d2f44a57217ed7fde252b5af73d85589873611258",
      providerRequests: 0,
      stripeConfirmationRequests: 0,
      routeExposed: false,
      browserHandoffRouteExposed: false,
      terminalObservationRouteExposed: false,
      reconciliationRouteExposed: false,
      stripeTransportImplemented: false,
      lateAuthorizationCancellationImplemented: false,
      lateAuthorizationReaperImplemented: false,
      consumerReady: false,
      captureAuthorized: false,
      orderAuthorized: false,
      futureCheckoutFinalizationPrerequisiteVersion: "202608260110",
      applyAuthority: "not_granted",
      productionApplyAuthority: "not_granted",
    });
    if (!entry) throw new Error("Production-local migration 109 is missing");

    const rollbackFilename = entry.filename.replace(/\.sql$/, ".rollback.sql");
    expect(sha256(`supabase/production-migrations/${entry.filename}`))
      .toBe(entry.forwardSha256);
    expect(sha256(`supabase/production-rollbacks/${rollbackFilename}`))
      .toBe(entry.rollbackSha256);
    expect(sha256(entry.implementationArtifact))
      .toBe(entry.implementationArtifactSha256);
    expect(sha256(entry.stripeConfirmationOrchestratorArtifact))
      .toBe(entry.stripeConfirmationOrchestratorArtifactSha256);
    expect(sha256(entry.confirmationReleaseBoundaryArtifact))
      .toBe(entry.confirmationReleaseBoundaryArtifactSha256);
    expect(entry.version < "202608260120").toBe(true);
    expect(entry.version < "202608260200").toBe(true);
    expect(manifest.production.versions.some(
      ({ version }: { version: string }) => version === entry.version,
    )).toBe(false);
  });

  it("hash-pins dark payment gates 110 through 114 and their managed UAT receipt", () => {
    const expected = [
      {
        version: "202608260110",
        filename:
          "202608260110_flight_consumer_checkout_authorization_bridge.sql",
        forwardSha256:
          "c2c31d71640b95e5d3be59b266c5ca04ee0467188248345db4c7280935c9c309",
        rollbackSha256:
          "4cf6227518719546a6c90c1306831584e2540f34d90ea73db3245fddeb8a32b1",
        verificationArtifact:
          "scripts/verify-flight-consumer-checkout-authorization-bridge-pglite.mjs",
        verificationArtifactSha256:
          "2d12b77cac4f6ad281fd7afd6ff7ce3a6d4abb914104c0a62c4bc9012b27b3fb",
      },
      {
        version: "202608260111",
        filename:
          "202608260111_flight_consumer_live_stripe_capture_execution_journal.sql",
        forwardSha256:
          "26a4c123c0a9e4858f085ee7b86adb02f4ebae1699459cb6575e056775e82524",
        rollbackSha256:
          "0a676e9ae775b138070ff72c7660e01b3d4022816367458a06a7ac8747c984cd",
        verificationArtifact: "scripts/verify-flight-consumer-stripe-capture-pglite.mjs",
        verificationArtifactSha256:
          "acc8d7fc0f88fdc7bb7f8ad04574ccb83e7a536ccbd00b4049506768e78cd53d",
      },
      {
        version: "202608260112",
        filename:
          "202608260112_flight_consumer_live_duffel_support_identity.sql",
        forwardSha256:
          "60a12f1024d91232b2c2e4c86b5b044e29039f4a6c2f0c6697b6c2b18918c2e7",
        rollbackSha256:
          "58df3b73396692e6c8dfab486fbe0d6f03406273428bb757770515c45c9ac862",
        verificationArtifact:
          "scripts/verify-flight-consumer-duffel-support-identity-pglite.mjs",
        verificationArtifactSha256:
          "6f1e20d27470341e400e5f478d04c260a5088c08c6d8436756c82204967470f2",
      },
      {
        version: "202608260113",
        filename:
          "202608260113_flight_consumer_live_booking_settlement_evidence.sql",
        forwardSha256:
          "2a9ebcea56c561be61ed50b895a46d7507ca06f6a20e7ff469bec7fc87da81f2",
        rollbackSha256:
          "43af76f346984b2182ef56fe40167305cc83e316a18da5f115fb0213d42731c4",
        verificationArtifact:
          "scripts/verify-flight-consumer-booking-settlement-pglite.mjs",
        verificationArtifactSha256:
          "4472fb9d546ac9ec15167253a892b1292251cd20d423501c5a8cebedc57579cc",
      },
      {
        version: "202608260114",
        filename:
          "202608260114_flight_consumer_live_stripe_capture_support_identity.sql",
        forwardSha256:
          "6e267b277d2190d5953e3fd91016e651e2ba8e1ef80b602e9bbce946b8ca1158",
        rollbackSha256:
          "e9e887f20bdd5cd7f93bbb4f6bc1698f9e696add6fcbdd026945086e775c3821",
        verificationArtifact:
          "scripts/verify-flight-consumer-stripe-capture-support-identity-pglite.mjs",
        verificationArtifactSha256:
          "c7eabd03bda0dbe28d5a3ccd2b8aa664355fef089a225d7ccd8ec80a4b840ba3",
      },
    ];

    for (const expectedEntry of expected) {
      const entry = manifest.production.authoredUnappliedVersions.find(
        ({ version }: { version: string }) => version === expectedEntry.version,
      );
      expect(entry).toMatchObject({
        ...expectedEntry,
        status: "authored_unapplied",
        targetEnvironment: "production_dark_only",
        objectVerification: "not_run_production",
        managedUatVerification:
          "passed_exact_bytes_postgresql_17_6_zero_transaction",
        localPostgresqlVerification:
          "passed_pglite_0_5_7_postgresql_18_3",
        routeExposed: false,
        applyAuthority: "not_granted",
        productionApplyAuthority: "not_granted",
      });
      if (!entry) throw new Error(`Production-local migration ${expectedEntry.version} is missing`);
      expect(sha256(`supabase/production-migrations/${entry.filename}`))
        .toBe(entry.forwardSha256);
      expect(sha256(
        `supabase/production-rollbacks/${entry.filename.replace(/\.sql$/, ".rollback.sql")}`,
      )).toBe(entry.rollbackSha256);
      expect(sha256(entry.verificationArtifact))
        .toBe(entry.verificationArtifactSha256);
      expect(entry.version < "202608260120").toBe(true);
      expect(entry.version < "202608260200").toBe(true);
    }

    const entry111 = manifest.production.authoredUnappliedVersions.find(
      ({ version }: { version: string }) => version === "202608260111",
    );
    const entry112 = manifest.production.authoredUnappliedVersions.find(
      ({ version }: { version: string }) => version === "202608260112",
    );
    const entry113 = manifest.production.authoredUnappliedVersions.find(
      ({ version }: { version: string }) => version === "202608260113",
    );
    const entry114 = manifest.production.authoredUnappliedVersions.find(
      ({ version }: { version: string }) => version === "202608260114",
    );
    for (const entry of [entry111, entry112, entry113, entry114]) {
      expect(sha256(entry.implementationArtifact))
        .toBe(entry.implementationArtifactSha256);
    }
    for (const entry of [entry111, entry114]) {
      expect(sha256(entry.stripeCaptureOrchestratorArtifact))
        .toBe(entry.stripeCaptureOrchestratorArtifactSha256);
    }
    expect(sha256(entry112.orderCreateOrchestratorArtifact))
      .toBe(entry112.orderCreateOrchestratorArtifactSha256);

    expect(manifest.production.isolatedManagedUatAcceptance).toEqual({
      status: "passed_exact_bytes_through_114_zero_transaction",
      verifiedOn: "2026-08-27",
      managedUatProjectRef: "exipwtvyjaihsvdhsbbt",
      branchName: "iratepilot-flight-payment-uat-20260827",
      postgresServerVersionNum: 170006,
      production: false,
      latestAppliedVersion: "202608260114",
      acceptedVersions: [
        "202608260101", "202608260102", "202608260103",
        "202608260105", "202608260106", "202608260107",
        "202608260108", "202608260109", "202608260110",
        "202608260111", "202608260112", "202608260113",
        "202608260114",
      ],
      forcedRlsVerified: true,
      directTableSelectDeniedToAnonAuthenticatedAndServiceRole: true,
      providerRequests: 0,
      duffelOrderRequests: 0,
      stripeCaptureRequests: 0,
      stripeMutations: 0,
      bookingSettlements: 0,
      orders: 0,
      charges: 0,
      tickets: 0,
      productionDatabaseAccessed: false,
      acceptanceEvidence:
        "docs/evidence/FLIGHT_CONSUMER_LIVE_PAYMENT_UAT_101_114_2026-08-27.json",
      acceptanceEvidenceSha256:
        "ba04f38e0aa702d247f9d704ee344f109b22897d4c1a3f509d69bd21df781342",
    });
    expect(sha256(
      manifest.production.isolatedManagedUatAcceptance.acceptanceEvidence,
    )).toBe(
      manifest.production.isolatedManagedUatAcceptance.acceptanceEvidenceSha256,
    );
  });

  it("hash-pins non-dispatching public-shopping admission gate 115", () => {
    const entry = manifest.production.authoredUnappliedVersions.find(
      ({ version }: { version: string }) => version === "202608260115",
    );
    expect(entry).toEqual({
      version: "202608260115",
      filename:
        "202608260115_flight_consumer_live_public_shopping_admission.sql",
      forwardSha256:
        "06f956ac88cba042d34ae7ac1c8a628dcdee2ea76936ada1cf7d7577c863cd63",
      rollbackSha256:
        "f1687425757d5856638a2f97d61d06c31cc77980e35113cbc0fa1ab7c8efc911",
      status: "authored_unapplied",
      targetEnvironment: "production_dark_only",
      objectVerification: "not_run_production",
      managedUatVerification: "not_run",
      localPostgresqlVerification:
        "passed_pglite_0_5_7_postgresql_18_3",
      implementationArtifact:
        "lib/flights/consumer-production/public-shopping-admission.server.ts",
      implementationArtifactSha256:
        "1fe0e5d1cb7eedd9f77b1f1f5ec1c12c5d1fc7c50d7c1d67ddfecad591b32e6a",
      contractArtifact:
        "lib/flights/consumer-production/public-shopping-contract.ts",
      contractArtifactSha256:
        "cb48e105a90f185d893e19623064842d0e5de7df3813f9750826f70b0d5564d5",
      verificationArtifact:
        "scripts/verify-flight-consumer-public-shopping-admission-pglite.mjs",
      verificationArtifactSha256:
        "f6cb390c70958e134ad14eb12a40011aa812412c914b5f6419c05e4c20fccaf4",
      documentationArtifact:
        "docs/FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_ADMISSION.md",
      documentationArtifactSha256:
        "40096e152eb71eb000b8d3dba96f34e5aa922aa69c72f977d69edf7db6266f76",
      providerRequests: 0,
      stripeRequests: 0,
      routeExposed: false,
      publicConsumerExposure: false,
      providerTransportImplemented: false,
      trustedIdentityCapabilityRequired: true,
      preRpcAuthenticatedLimiterRequired: true,
      refusalEvidenceCoalesced: true,
      trustedClockAssignedAfterSerializationLock: true,
      captureAuthorized: false,
      refundAuthorized: false,
      consumerReleaseEnabled: false,
      blindRetryAuthorized: false,
      budgetReservationCapability: "default_off_non_dispatching",
      claimGrantsDispatchAuthority: false,
      applyAuthority: "not_granted",
      productionApplyAuthority: "not_granted",
    });
    if (!entry) throw new Error("Production-local migration 115 is missing");
    const rollbackFilename = entry.filename.replace(/\.sql$/, ".rollback.sql");
    expect(sha256(`supabase/production-migrations/${entry.filename}`))
      .toBe(entry.forwardSha256);
    expect(sha256(`supabase/production-rollbacks/${rollbackFilename}`))
      .toBe(entry.rollbackSha256);
    for (const [artifact, expectedSha256] of [
      [entry.implementationArtifact, entry.implementationArtifactSha256],
      [entry.contractArtifact, entry.contractArtifactSha256],
      [entry.verificationArtifact, entry.verificationArtifactSha256],
      [entry.documentationArtifact, entry.documentationArtifactSha256],
    ] as const) {
      expect(sha256(artifact)).toBe(expectedSha256);
    }
    expect(entry.version < "202608260120").toBe(true);
    expect(entry.version < "202608260200").toBe(true);
    expect(manifest.production.versions.some(
      ({ version }: { version: string }) => version === entry.version,
    )).toBe(false);
    expect(manifest.production.isolatedManagedUatAcceptance.acceptedVersions)
      .not.toContain(entry.version);
  });

  it("hash-pins route-free public offer projection gates 116 through 118", () => {
    const expected = [
      {
        version: "202608260116",
        filename:
          "202608260116_flight_consumer_live_public_offer_projection.sql",
        forwardSha256:
          "64237bd6afc967349940805876a1e432c78d21801ac520f6990f2f14053423d0",
        rollbackSha256:
          "03640a468e17bd8213006a2f726dab40c740a7b6bd5855773e0a808acc90c232",
        artifacts: [
          [
            "lib/flights/consumer-production/duffel-live-public-offer-projection.server.ts",
            "18bd2bc7268124585d468ca9da02c7073f945ae24023e247710ae65877ad3ea9",
          ],
          [
            "lib/flights/consumer-production/public-offer-projection-contract.ts",
            "2b342ef8dcc47862e17116b00c877d012f0cce5d167c103328ee3f3b09104732",
          ],
          [
            "lib/flights/consumer-production/public-offer-projection-persistence.server.ts",
            "1aef94774cc22f0bee5774bd4fb230866443a9c35265dc6b9f5e930ec3d4bbd5",
          ],
          [
            "lib/flights/consumer-production/public-offer-reference-encryption-port.server.ts",
            "dd9145768e30022efcc5fd30c8e5df4fcc2153612e28abd0f3ceb9a9b92b135a",
          ],
          [
            "scripts/verify-flight-consumer-public-offer-projection-pglite.mjs",
            "2d1afb7ac6412cbe2ff3d80f199b83e61c8d3baa88bee985894c1b88e8b508c2",
          ],
          [
            "docs/FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_PROJECTION_GATE.md",
            "1b3d0fd401fe79a2e7a151e3079eb61b0839e23fe4f6aa44e661ba7b6c7fdbb0",
          ],
        ],
      },
      {
        version: "202608260117",
        filename:
          "202608260117_flight_consumer_live_public_offer_reference_retention.sql",
        forwardSha256:
          "1881c1e02e43a8e17129090ff41deb44f1f80feb4277905d40bd349131f727df",
        rollbackSha256:
          "7e763fbf14350a78d731793bc545c82186f0c6d9f45326062a6aec81bab6d77e",
        artifacts: [
          [
            "lib/flights/consumer-production/duffel-live-public-offer-reference-encryption.server.ts",
            "00ca100ee0e9bdc56e1d4fcdd0187dace928929eac0a797cef0092210e0e2532",
          ],
          [
            "lib/flights/consumer-production/public-offer-reference-retention.server.ts",
            "3facb6805eada5ca5de4f6f26cf3426395f16cb5f37c24dd0a9a6a87aedbe723",
          ],
          [
            "scripts/verify-flight-consumer-public-offer-reference-retention-pglite.mjs",
            "c298d2b8932e5ecbc8a9e874365bc3634f3f9e8d761340d87370dc8fa80e6ee0",
          ],
          [
            "docs/FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_RETENTION_GATE.md",
            "f414c5a5b5c011e83552f0a979f0f27fd880d0c299b1247d77a50e0ccdb686cf",
          ],
        ],
      },
      {
        version: "202608260118",
        filename:
          "202608260118_flight_consumer_live_duffel_offer_source_conflict_repair.sql",
        forwardSha256:
          "7bc225346c6b55c8a0c8f7b150a44c20c746bed092ac3a6e4791d89dddeda84f",
        rollbackSha256:
          "ca145d0d4e0559a3c983fbc0a7b702986d3caaf175292b23d0df5ebf7f8df102",
        artifacts: [
          [
            "scripts/verify-flight-consumer-duffel-offer-source-repair-pglite.mjs",
            "271fc80e5b9269963e1dee697e65b54780bcc81ce6c830b4477476f11ac5dd32",
          ],
          [
            "docs/FLIGHT_CONSUMER_PRODUCTION_DUFFEL_OFFER_SOURCE_REPAIR_GATE_118.md",
            "34e36fa60736ec625d338a0fbf384f0edbf7d79ba799f3931c4b9d81a32679d0",
          ],
          [
            "tests/flight-consumer-live-duffel-offer-source-conflict-repair-migration.test.ts",
            "023d9eaf13cb7d0b57c1b8a1e1b30d4c2ccdf5f7eceb4993b1b9813a98712281",
          ],
        ],
      },
    ] as const;

    for (const gate of expected) {
      const entry = manifest.production.authoredUnappliedVersions.find(
        ({ version }: { version: string }) => version === gate.version,
      );
      if (!entry) throw new Error(`Production-local migration ${gate.version} is missing`);
      expect(entry).toMatchObject({
        version: gate.version,
        filename: gate.filename,
        forwardSha256: gate.forwardSha256,
        rollbackSha256: gate.rollbackSha256,
        status: "authored_unapplied",
        targetEnvironment: "production_dark_only",
        objectVerification: "not_run_production",
        managedUatVerification: "not_run",
        providerRequests: 0,
        stripeRequests: 0,
        routeExposed: false,
        publicConsumerExposure: false,
        captureAuthorized: false,
        refundAuthorized: false,
        consumerReleaseEnabled: false,
        applyAuthority: "not_granted",
        productionApplyAuthority: "not_granted",
      });
      expect(sha256(`supabase/production-migrations/${gate.filename}`))
        .toBe(gate.forwardSha256);
      expect(sha256(
        `supabase/production-rollbacks/${gate.filename.replace(/\.sql$/, ".rollback.sql")}`,
      )).toBe(gate.rollbackSha256);
      for (const [artifact, expectedSha256] of gate.artifacts) {
        expect(sha256(artifact)).toBe(expectedSha256);
      }
      expect(entry.version < "202608260120").toBe(true);
      expect(entry.version < "202608260200").toBe(true);
      expect(manifest.production.versions.some(
        ({ version }: { version: string }) => version === entry.version,
      )).toBe(false);
      expect(manifest.production.isolatedManagedUatAcceptance.acceptedVersions)
        .not.toContain(entry.version);
    }

    const gate116 = manifest.production.authoredUnappliedVersions.find(
      ({ version }: { version: string }) => version === "202608260116",
    );
    expect(gate116).toMatchObject({
      strictProviderNormalization: true,
      batchDigestRecomputedByDatabase: true,
      scopeResponseAndSourceAccountingBound: true,
      topologyAndTravelDatesBound: true,
      zeroOfferBindingPrerequisiteVersion: "202608260118",
      plaintextProviderOfferIdPersisted: false,
    });
    const gate117 = manifest.production.authoredUnappliedVersions.find(
      ({ version }: { version: string }) => version === "202608260117",
    );
    expect(gate117).toMatchObject({
      envKeyAdapterImplemented: true,
      kmsKeyringImplemented: false,
      decryptPathImplemented: false,
      keyRotationImplemented: false,
      purgeSchedulerImplemented: false,
      backupCryptoShredImplemented: false,
      plaintextProviderOfferIdPersisted: false,
    });
    const gate118 = manifest.production.authoredUnappliedVersions.find(
      ({ version }: { version: string }) => version === "202608260118",
    );
    expect(gate118).toMatchObject({
      preservedGate105ForwardSha256:
        "c10757ec05ab4c1f55b9da881e37c74679cc8a44c6e0afe3298ae1d7da8249b9",
      gate105AmbiguityRepairedByStableConstraint: true,
      immutableZeroAndNonzeroResponseHeader: true,
      completionGuardRequiresExactHeader: true,
      sourceListingRequiresExactHeader: true,
      crossResponseOrphanRefused: true,
      crossScopeOrphanRefused: true,
    });
  });

  it("hash-pins route-free public-shopping dispatch gate 119", () => {
    const entry = manifest.production.authoredUnappliedVersions.find(
      ({ version }: { version: string }) => version === "202608260119",
    );
    expect(entry).toEqual({
      version: "202608260119",
      filename:
        "202608260119_flight_consumer_live_public_shopping_dispatch.sql",
      forwardSha256:
        "51329d4d4d95d5b8c0e7a90d239c760c0ce432e8766e3319ae3c02f31cf2269c",
      rollbackSha256:
        "66be858df46aa4495bfef405ec17013598daa57a70bde55d92ae8e480e03f14d",
      status: "authored_unapplied",
      targetEnvironment: "production_dark_only",
      objectVerification: "not_run_production",
      managedUatVerification: "not_run",
      localPostgresqlVerification:
        "passed_exact_stack_pglite_0_5_7_postgresql_18_3",
      implementationArtifact:
        "lib/flights/consumer-production/public-shopping-dispatch.server.ts",
      implementationArtifactSha256:
        "1bac77f6f001ded146340d9b1c81bb0ee3c3ebe4350521bb804907ed75fd0b08",
      persistenceArtifact:
        "lib/flights/consumer-production/public-shopping-dispatch-persistence.server.ts",
      persistenceArtifactSha256:
        "e8fe8708f6c67f6ab4e121287ba813a5dff2af2579efe0e2bae92611f4b54852",
      verificationArtifact:
        "scripts/verify-flight-consumer-public-shopping-dispatch-pglite.mjs",
      verificationArtifactSha256:
        "8be1574ed607dc4125a3a7f98a685e0c9fb64cfb058c173bdcfca51f1113b623",
      documentationArtifact:
        "docs/FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_DISPATCH_GATE_119.md",
      documentationArtifactSha256:
        "eb8c52afa99c019ccd53cc1e66916088ba3db2a44475f579c9298e1c40691acc",
      runtimeTestArtifact:
        "tests/flight-consumer-production-public-shopping-dispatch.test.ts",
      runtimeTestArtifactSha256:
        "9b4570ac260b9f3bc7898ad2179366accd564be19f61e059a41868f5bbb71c8d",
      migrationTestArtifact:
        "tests/flight-consumer-live-public-shopping-dispatch-migration.test.ts",
      migrationTestArtifactSha256:
        "b3e7b1140516528b2ea67d09a5940cd9ad140a51c32032c434a4956a7166e7c1",
      providerRequests: 0,
      stripeRequests: 0,
      routeExposed: false,
      publicConsumerExposure: false,
      providerTransportImplemented: true,
      defaultDependencyComposerImplemented: false,
      trustedCredentialAndAccountBoundRuntime: true,
      exactGate115AdmissionAndSearchBound: true,
      atomicAdmissionAttemptDispatchReceipt: true,
      exactSucceededReplayWithoutRedispatch: true,
      boundedTimedIdentityResponseRequired: true,
      zeroAndNonzeroExactStackVerified: true,
      staleDispatchReaperImplemented: false,
      lateResultReconciliationImplemented: false,
      blindRetryAuthorized: false,
      orderAuthorized: false,
      paymentAuthorized: false,
      captureAuthorized: false,
      refundAuthorized: false,
      ticketingAuthorized: false,
      servicingAuthorized: false,
      consumerReleaseEnabled: false,
      applyAuthority: "not_granted",
      productionApplyAuthority: "not_granted",
    });
    if (!entry) throw new Error("Production-local migration 119 is missing");
    expect(sha256(`supabase/production-migrations/${entry.filename}`))
      .toBe(entry.forwardSha256);
    expect(sha256(
      `supabase/production-rollbacks/${entry.filename.replace(/\.sql$/, ".rollback.sql")}`,
    )).toBe(entry.rollbackSha256);
    for (const [artifact, expectedSha256] of [
      [entry.implementationArtifact, entry.implementationArtifactSha256],
      [entry.persistenceArtifact, entry.persistenceArtifactSha256],
      [entry.verificationArtifact, entry.verificationArtifactSha256],
      [entry.documentationArtifact, entry.documentationArtifactSha256],
      [entry.runtimeTestArtifact, entry.runtimeTestArtifactSha256],
      [entry.migrationTestArtifact, entry.migrationTestArtifactSha256],
    ] as const) {
      expect(sha256(artifact)).toBe(expectedSha256);
    }
    expect(readFileSync(".env.example", "utf8")).toContain(
      "FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_DISPATCH_ENABLED=false",
    );
    expect(entry.version < "202608260120").toBe(true);
    expect(entry.version < "202608260200").toBe(true);
    expect(manifest.production.versions.some(
      ({ version }: { version: string }) => version === entry.version,
    )).toBe(false);
    expect(manifest.production.isolatedManagedUatAcceptance.acceptedVersions)
      .not.toContain(entry.version);
  });

  it("hash-pins route-free private-preview foundation gate 139", () => {
    const entry = manifest.production.authoredUnappliedVersions.find(
      ({ version }: { version: string }) => version === "202608260139",
    );
    expect(entry).toEqual({
      version: "202608260139",
      filename:
        "202608260139_flight_consumer_live_private_preview_foundation.sql",
      forwardSha256:
        "2667fe75b414b0a907b87ba1521470110a6f8aaa9b4a1c536ab3228a177374da",
      rollbackSha256:
        "22f017563a9ddc9cf420e5981bfb265fb802fc93592239bcab672db42cbc42e2",
      status: "authored_unapplied",
      targetEnvironment: "production_dark_only",
      objectVerification: "not_run_production",
      managedUatVerification: "not_run",
      localPostgresqlVerification:
        "passed_exact_stack_pglite_0_5_7_postgresql_18_3",
      implementationArtifact:
        "lib/flights/consumer-production/public-shopping-private-preview-foundation.server.ts",
      implementationArtifactSha256:
        "d4502354caf552b4f4763eccc94cbde71aa34f929d0f40f5f658597c40a7bdba",
      verificationArtifact:
        "scripts/verify-flight-consumer-private-preview-foundation-pglite.mjs",
      verificationArtifactSha256:
        "06f657769f0b74dbef0ad4953136cbc449e9d7f150dd4545e553d79171fecaec",
      documentationArtifact:
        "docs/FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_FOUNDATION_GATE_139.md",
      documentationArtifactSha256:
        "44202af41488cbc49ada77d2b8315afb2738735062a1913410d5b8f855ed64f7",
      runtimeTestArtifact:
        "tests/flight-consumer-production-private-preview-foundation.test.ts",
      runtimeTestArtifactSha256:
        "7034db9ace9acf884694e1a690b5072e16e05daedf9976941b94a411cfa602ac",
      migrationTestArtifact:
        "tests/flight-consumer-live-private-preview-foundation-migration.test.ts",
      migrationTestArtifactSha256:
        "ddcac4a6bb7ee1fe4fe0336681ad21977846c8a6cd98f20863427235bbda68b4",
      providerRequests: 0,
      stripeRequests: 0,
      routeExposed: false,
      publicConsumerExposure: false,
      membershipProvisioned: false,
      appendOnlyPrivateCohortMembershipImplemented: true,
      distributedGate115PreAdmissionLimiterImplemented: true,
      boundedRefusalEvidenceImplemented: true,
      privatePreviewExposureReceiptsImplemented: true,
      zeroOfferExposureVerified: true,
      staleDispatchClassifierImplemented: true,
      lateSuccessExposureReconciliationImplemented: true,
      providerRedispatchAuthorized: false,
      blindRetryAuthorized: false,
      orderAuthorized: false,
      paymentAuthorized: false,
      captureAuthorized: false,
      refundAuthorized: false,
      ticketingAuthorized: false,
      servicingAuthorized: false,
      consumerReleaseEnabled: false,
      applyAuthority: "not_granted",
      productionApplyAuthority: "not_granted",
    });
    if (!entry) throw new Error("Production-local migration 139 is missing");
    expect(sha256(`supabase/production-migrations/${entry.filename}`))
      .toBe(entry.forwardSha256);
    expect(sha256(
      `supabase/production-rollbacks/${entry.filename.replace(/\.sql$/, ".rollback.sql")}`,
    )).toBe(entry.rollbackSha256);
    for (const [artifact, expectedSha256] of [
      [entry.implementationArtifact, entry.implementationArtifactSha256],
      [entry.verificationArtifact, entry.verificationArtifactSha256],
      [entry.documentationArtifact, entry.documentationArtifactSha256],
      [entry.runtimeTestArtifact, entry.runtimeTestArtifactSha256],
      [entry.migrationTestArtifact, entry.migrationTestArtifactSha256],
    ] as const) {
      expect(sha256(artifact)).toBe(expectedSha256);
    }
    expect(entry.version > "202608260138").toBe(true);
    expect(entry.version < "202608260200").toBe(true);
    expect(manifest.production.versions.some(
      ({ version }: { version: string }) => version === entry.version,
    )).toBe(false);
    expect(manifest.production.isolatedManagedUatAcceptance.acceptedVersions)
      .not.toContain(entry.version);
  });

  it("reserves car versions without assigning any of them to flight", () => {
    expect(manifest.reservedExternalRanges).toEqual([{
      owner: "car_rental",
      firstVersion: "202608260200",
      lastVersion: "202608260207",
      flightUseAuthorized: false,
    }]);
    expect(CANONICAL_FLIGHT_MIGRATION_VERSIONS.every(
      (version: string) => version < "202608260200",
    )).toBe(true);
    const flightOwnedVersions = [
      ...CANONICAL_FLIGHT_MIGRATION_VERSIONS,
      ...manifest.production.versions.map(({ version }: { version: string }) => version),
      ...manifest.production.authoredUnappliedVersions.map(
        ({ version }: { version: string }) => version,
      ),
    ];
    expect(flightOwnedVersions.some(
      (version: string) => version >= "202608260200" && version <= "202608260207",
    )).toBe(false);
    for (const directory of [
      "supabase/migrations",
      "supabase/rollbacks",
      "supabase/production-migrations",
      "supabase/production-rollbacks",
    ]) {
      expect(readdirSync(directory).some((filename) => {
        const version = filename.slice(0, 12);
        return version >= "202608260200"
          && version <= "202608260207"
          && filename.includes("_flight_");
      })).toBe(false);
    }
    expect(rawManifest).not.toMatch(/access[_-]?token|password|database[_-]?url/i);
  });
});
