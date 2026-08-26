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
    expect(rawManifest).not.toMatch(/access[_-]?token|password|database[_-]?url|project[_-]?ref/i);
  });
});
