import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/production-migrations/202608260140_flight_consumer_live_private_preview_exposure_reconciliation.sql";
const rollbackPath =
  "supabase/production-rollbacks/202608260140_flight_consumer_live_private_preview_exposure_reconciliation.rollback.sql";
const verifierPath =
  "scripts/verify-flight-consumer-private-preview-reconciliation-pglite.mjs";

const migration = readFileSync(migrationPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");
const verifier = readFileSync(verifierPath, "utf8");

describe("Gate140 private-preview exposure reconciliation migration", () => {
  it("is an isolated transactional forward layer after Gate139", () => {
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).toContain(
      "authorize_flight_consumer_live_private_preview_exposure_v1",
    );
    expect(migration).not.toMatch(/20260826020[0-7]/);
    expect(migration).not.toMatch(/drop table|drop function|truncate|delete from/i);
  });

  it("accepts only the four opaque caller bindings and is service-role-only", () => {
    expect(migration).toContain(
      "reconcile_flight_consumer_live_private_preview_exposure_v1(\n  p_admission_id uuid,\n  p_admission_receipt_sha256 text,\n  p_subject_sha256 text,\n  p_request_sha256 text",
    );
    expect(migration).toContain("language plpgsql security definer");
    expect(migration).toContain(
      "set search_path = pg_catalog, public, extensions",
    );
    expect(migration).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(migration).toContain("p_admission_receipt_sha256 is null");
    expect(migration).toContain("p_subject_sha256 is null");
    expect(migration).toContain("p_request_sha256 is null");
    expect(migration).toContain(
      "from public, anon, authenticated, service_role",
    );
    expect(migration).toContain(") to service_role;");
  });

  it("derives the complete immutable Gate115/119/118/116 input chain", () => {
    for (const fragment of [
      "flight_consumer_live_public_shopping_admissions",
      "flight_consumer_live_public_shopping_dispatches",
      "flight_consumer_live_duffel_shopping_attempts",
      "flight_consumer_live_duffel_offer_source_batches",
      "flight_consumer_live_public_offer_projection_batches",
      "v_attempt.attempt_state <> 'succeeded'",
      "v_attempt.attempt_revision <> 2",
      "v_source_batch.source_response_sha256",
      "v_projection.projection_batch_sha256",
      "v_projection.projection_receipt_sha256",
      "v_source_batch.source_offer_count",
      "v_projection.projected_offer_count",
      "v_projection.refused_offer_count",
    ]) expect(migration).toContain(fragment);
  });

  it("serializes with Gate139, reads DB time after locks, and composes one write", () => {
    const membershipLock = migration.indexOf(
      "lock table public.flight_consumer_live_private_preview_membership_events",
    );
    const exposureLock = migration.indexOf(
      "lock table public.flight_consumer_live_private_preview_exposures",
    );
    const dbTime = migration.indexOf("v_now := clock_timestamp();");
    const authorizeCall = migration.lastIndexOf(
      "public.authorize_flight_consumer_live_private_preview_exposure_v1(",
    );
    expect(membershipLock).toBeGreaterThan(0);
    expect(exposureLock).toBeGreaterThan(membershipLock);
    expect(dbTime).toBeGreaterThan(exposureLock);
    expect(authorizeCall).toBeGreaterThan(dbTime);
    expect(migration.match(/authorize_flight_consumer_live_private_preview_exposure_v1\(/g))
      .toHaveLength(2);
  });

  it("bounds fresh exposure to DB-time 60 seconds and never extends replay", () => {
    for (const fragment of [
      "v_exposure_not_after := v_existing.exposure_not_after",
      "v_now + interval '60 seconds'",
      "v_membership.membership_not_after - interval '1 microsecond'",
      "min(projection.presentation_expires_at)",
      "min(projection.offer_expires_at)",
      "v_exposure_not_after > v_now + interval '60 seconds'",
      "'migrationVersion', '202608260139'",
      "'consumerPublicReleaseAuthorized', false",
      "'blindRetryAuthorized', false",
    ]) expect(migration).toContain(fragment);
  });

  it("has exact-stack behavioral coverage for fresh, replay, late success, and rollback", () => {
    for (const fragment of [
      "202608260140_flight_consumer_live_private_preview_exposure_reconciliation.sql",
      "Gate140 fresh exposure exceeded its 60-second bound",
      "exact reconciliation replay",
      "late-success reconciliation",
      "Gate140 accepted a caller binding collision",
      "Gate140 reconciliation survived membership revocation",
      "Gate140 reconciliation RPC ACL failed",
      "202608260140_flight_consumer_live_private_preview_exposure_reconciliation.rollback.sql",
      "Gate140 reconciliation PGlite verifier passed",
    ]) expect(verifier).toContain(fragment);
  });

  it("is route/provider/payment free and refuses destructive rollback", () => {
    expect(migration).not.toMatch(/fetch\s*\(|create_order|createOrder|stripe\./i);
    expect(migration).toContain("grants no public-release or commercial authority");
    expect(rollback).toContain("Gate 140 rollback refused");
    expect(rollback).not.toMatch(/drop table|drop function|truncate|delete from/i);
  });
});
