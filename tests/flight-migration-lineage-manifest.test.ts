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
    expect(manifest.preview.canonicalTip).toBe("202608260137");
    expect(manifest.preview.retiredVersionMap.map(
      ({ retired }: { retired: string }) => retired,
    )).toEqual(RETIRED_FLIGHT_MIGRATION_VERSIONS);
    expect(manifest.preview.retiredVersionMap.map(
      ({ canonical }: { canonical: string }) => canonical,
    )).toEqual(CANONICAL_FLIGHT_MIGRATION_VERSIONS);
    expect(manifest.preview.ledgerVerification).toEqual({
      status: "not_verified_stored_preview_db_credential_stale",
      mandatoryBeforeAnyFutureApply: true,
      retiredFlightIdentifierResultRequired: "none_of_081_or_083_through_098_present",
      sharedHotelPredecessorResultRequired: "202608250082_already_applied",
    });
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
    )).toEqual(["202608260104"]);

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
    expect(authoredVersions).toEqual(["202608260104"]);
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
    expect(manifest.production.authoredUnappliedVersions).toEqual([{
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
        "8cf38983ea74af770bfa96c7e85581c9feb23e1df2f0075a5e0f7375a78b8710",
      applyAuthority: "not_granted",
      productionApplyAuthority: "not_granted",
    }]);

    const [entry] = manifest.production.authoredUnappliedVersions;
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
    expect(rawManifest).not.toMatch(/access[_-]?token|password|database[_-]?url|project[_-]?ref/i);
  });
});
