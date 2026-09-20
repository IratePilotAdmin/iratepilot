import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/production-migrations/202608260118_flight_consumer_live_duffel_offer_source_conflict_repair.sql";
const rollbackPath =
  "supabase/production-rollbacks/202608260118_flight_consumer_live_duffel_offer_source_conflict_repair.rollback.sql";
const verifierPath =
  "scripts/verify-flight-consumer-duffel-offer-source-repair-pglite.mjs";
const documentationPath =
  "docs/FLIGHT_CONSUMER_PRODUCTION_DUFFEL_OFFER_SOURCE_REPAIR_GATE_118.md";
const migration105Path =
  "supabase/production-migrations/202608260105_flight_consumer_live_duffel_offer_refresh_journal.sql";

const migration = readFileSync(migrationPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");
const verifier = readFileSync(verifierPath, "utf8");
const documentation = readFileSync(documentationPath, "utf8");
const migration105 = readFileSync(migration105Path);

describe("Production Duffel offer-source conflict repair migration 118", () => {
  it("preserves migration 105 and applies one transactional repair", () => {
    expect(createHash("sha256").update(migration105).digest("hex")).toBe(
      "c10757ec05ab4c1f55b9da881e37c74679cc8a44c6e0afe3298ae1d7da8249b9",
    );
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).toContain(
      "lock table public.flight_consumer_live_duffel_shopping_attempts,\n  public.flight_consumer_live_duffel_offer_sources\n  in access exclusive mode;",
    );
    expect(migration).toContain(
      "create or replace function public.record_flight_consumer_live_duffel_offer_sources_v1(",
    );
    expect(migration.match(/create table public\./g)).toHaveLength(1);
    expect(migration).not.toMatch(/drop table|truncate|delete from/i);
  });

  it("discovers, validates, and stabilizes the exact unique constraint", () => {
    for (const fragment of [
      "constraint_record.contype = 'u'",
      "not constraint_record.condeferrable",
      "not constraint_record.condeferred",
      "array[v_attempt_attnum, v_offer_attnum]::smallint[]",
      "index_record.indisunique",
      "index_record.indisvalid",
      "index_record.indisready",
      "index_record.indpred is null",
      "index_record.indexprs is null",
      "alter table public.flight_consumer_live_duffel_offer_sources rename constraint %I to %I",
      "flight_consumer_duffel_offer_source_attempt_offer_uniq",
    ]) {
      expect(migration).toContain(fragment);
    }
    expect(migration).toContain(
      "on conflict on constraint\n      flight_consumer_duffel_offer_source_attempt_offer_uniq",
    );
    expect(migration).not.toContain(
      "on conflict (source_shopping_attempt_id, offer_id_sha256)",
    );
  });

  it("requires an exact per-source replay including evidence and expiry", () => {
    for (const binding of [
      "v_recorded_source.source_shopping_execution_scope_sha256",
      "p_source_shopping_execution_scope_sha256",
      "v_recorded_source.source_response_sha256",
      "p_source_response_sha256",
      "v_recorded_source.offer_id_sha256",
      "v_offer_id_sha256",
      "v_recorded_source.source_offer_evidence_sha256",
      "v_evidence_sha256",
      "v_recorded_source.expires_at is distinct from v_expires_at",
      "v_recorded_count is distinct from v_expected_count",
    ]) {
      expect(migration).toContain(binding);
    }
    expect(migration).toContain(
      "iratepilot:flight-consumer-production:duffel-live:offer-source-evidence:v1",
    );
  });

  it("records one immutable digest header, including the empty source set", () => {
    expect(migration).toContain(
      "create table public.flight_consumer_live_duffel_offer_source_batches",
    );
    for (const binding of [
      "source_shopping_attempt_id uuid not null",
      "source_shopping_execution_scope_sha256 text not null",
      "source_response_sha256 text not null",
      "source_offer_count integer not null",
      "source_set_sha256 text not null",
      "source_batch_receipt_sha256 text not null",
      "flight_consumer_duffel_source_batch_pkey",
      "flight_consumer_duffel_source_batch_receipt_uniq",
      "coalesce(string_agg(",
      "flight-consumer-production:duffel-live:offer-source-set:v1",
      "flight-consumer-production:duffel-live:offer-source-batch-receipt:v1",
      "on conflict on constraint flight_consumer_duffel_source_batch_pkey",
    ]) {
      expect(migration).toContain(binding);
    }
    expect(migration).toContain(
      "flight_consumer_live_duffel_offer_source_batches_immutable",
    );
    expect(migration).toContain("before update or delete on");
  });

  it("refuses unsafe succeeded history and guards every success completion", () => {
    expect(migration).toContain("$validate_succeeded_history$");
    expect(migration).toContain(
      "succeeded offer-source history cannot be safely bound",
    );
    expect(migration).toContain("source_set_digests as (");
    expect(migration).toContain("$validate_succeeded_backfill$");
    expect(migration).toContain(
      "create trigger flight_consumer_live_duffel_shopping_success_sources_guard",
    );
    expect(migration).toContain(
      "before update on public.flight_consumer_live_duffel_shopping_attempts",
    );
    for (const terminalBinding of [
      "v_batch.source_shopping_execution_scope_sha256",
      "new.execution_scope_sha256",
      "v_batch.source_response_sha256",
      "new.terminal_response_sha256",
      "v_batch.source_offer_count is distinct from new.offer_count",
      "v_batch.source_offer_count is distinct from v_source_count",
      "source.source_response_sha256",
    ]) {
      expect(migration).toContain(terminalBinding);
    }
  });

  it("replaces Gate 116 listing with an exact header-bound empty-safe read", () => {
    expect(migration).toContain(
      "create or replace function public.list_flight_consumer_live_duffel_pending_offer_sources_v1(",
    );
    expect(migration).toContain(
      "v_batch.source_batch_receipt_sha256\n      is distinct from v_batch_receipt_sha256",
    );
    expect(migration).toContain(
      "where source.source_shopping_attempt_id = p_source_shopping_attempt_id",
    );
  });

  it("preserves forced-RLS prerequisites and service-role-only ACLs", () => {
    expect(migration).toContain("catalog_class.relrowsecurity");
    expect(migration).toContain("catalog_class.relforcerowsecurity");
    expect(migration).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(migration).toContain("security definer");
    expect(migration).toContain(
      "alter table public.flight_consumer_live_duffel_offer_source_batches\n  enable row level security;",
    );
    expect(migration).toContain(
      "alter table public.flight_consumer_live_duffel_offer_source_batches\n  force row level security;",
    );
    expect(migration).toContain(
      "set search_path = pg_catalog, public, extensions",
    );
    expect(migration).toContain(
      ") from public, anon, authenticated, service_role;",
    );
    expect(migration).toContain(") to service_role;");
    expect(migration).toContain(") owner to postgres;");
    expect(migration).not.toMatch(/grant (?:select|insert|update|delete|all) on table/i);
  });

  it("has an unconditional non-regressive rollback refusal", () => {
    expect(rollback.trimStart().startsWith("begin;")).toBe(true);
    expect(rollback.trimEnd().endsWith("commit;")).toBe(true);
    expect(rollback).toContain("Refusing rollback:");
    expect(rollback).not.toMatch(/drop |alter |update |delete |truncate |revoke /i);
  });

  it("documents and behaviorally probes every required repair case", () => {
    for (const marker of [
      "baseline42702Refused",
      "safeZeroHistoryBackfilled",
      "unsafeSucceededHistoryRefused",
      "zeroOfferRecorded",
      "zeroHeaderCompleted",
      "oneOfferRecorded",
      "manyOffersRecorded",
      "exactReplayAccepted",
      "headerExactReplayAccepted",
      "duplicateInputRefused",
      "changedExpiryRefused",
      "changedScopeRefused",
      "changedResponseRefused",
      "wrongTerminalResponseRefused",
      "wrongTerminalCountRefused",
      "crossResponseSourceRefused",
      "crossScopeSourceRefused",
      "gate116WrongResponseRefused",
      "headerImmutable",
      "headerServiceRoleHidden",
      "gate116SourceListingEnabled",
      "forcedRls",
      "serviceRoleOnly",
      "rollbackRefused",
    ]) {
      expect(verifier).toContain(marker);
    }
    expect(documentation).toContain("Gate 118 is a narrow, code-and-schema repair");
    expect(documentation).toContain("Authenticated public Duffel transport is a later gate");
  });
});
