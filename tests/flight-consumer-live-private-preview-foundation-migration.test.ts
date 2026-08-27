import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/production-migrations/202608260139_flight_consumer_live_private_preview_foundation.sql";
const rollbackPath =
  "supabase/production-rollbacks/202608260139_flight_consumer_live_private_preview_foundation.rollback.sql";
const runtimePath =
  "lib/flights/consumer-production/public-shopping-private-preview-foundation.server.ts";
const verifierPath =
  "scripts/verify-flight-consumer-private-preview-foundation-pglite.mjs";
const documentationPath =
  "docs/FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_FOUNDATION_GATE_139.md";

const migration = readFileSync(migrationPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");
const runtime = readFileSync(runtimePath, "utf8");
const verifier = readFileSync(verifierPath, "utf8");
const documentation = readFileSync(documentationPath, "utf8");

describe("Gate139 private-preview foundation migration", () => {
  it("is one transactional forward-only layer after Gate119", () => {
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).toContain(
      "flight_consumer_live_public_shopping_dispatches",
    );
    expect(migration).toContain(
      "flight_consumer_live_duffel_offer_source_batches",
    );
    expect(migration).toContain(
      "flight_consumer_live_public_offer_projection_batches",
    );
    expect(migration).not.toMatch(/20260826020[0-7]/);
    expect(migration).not.toMatch(/drop table|truncate|delete from/i);
  });

  it("uses server-owned append-only membership revisions with deterministic revocation", () => {
    for (const fragment of [
      "create table public.flight_consumer_live_private_preview_membership_events",
      "unique (membership_key_sha256, event_sequence)",
      "event_type in ('granted', 'revoked')",
      "order by event.event_sequence desc limit 1",
      "lock table public.flight_consumer_live_private_preview_membership_events",
      "membership replay collision",
      "v_latest.event_type = 'granted'",
      "membership_not_after < v_claim_expires_at",
      "v_membership.event_type <> 'granted'",
    ]) expect(migration).toContain(fragment);
  });

  it("implements exact fixed Gate115 budgets before admission with bounded refusals", () => {
    for (const fragment of [
      "create table public.flight_consumer_live_private_preview_limiter_claims",
      "unique (execution_scope_sha256, idempotency_sha256)",
      "claim_expires_at = created_at + interval '60 seconds'",
      "v_subject_minute >= 2",
      "v_subject_day >= 10",
      "v_cohort_minute >= 10",
      "v_cohort_day >= 100",
      "v_global_minute >= 20",
      "v_global_day >= 250",
      "public-shopping-admission-policy:v1",
      "limiter replay collision",
      "limiter claim expired",
      "on conflict (refusal_bucket_sha256) do nothing",
      "0, 0, 0, 0, 0, 0",
    ]) expect(migration).toContain(fragment);
    const limiter = migration.slice(
      migration.indexOf("create function public.consume_flight_consumer_live_private_preview_limiter_v1"),
      migration.indexOf("create function public.classify_flight_consumer_live_private_preview_stale_dispatches_v1"),
    );
    expect(limiter.indexOf("lock table public.flight_consumer_live_private_preview_limiter_claims"))
      .toBeLessThan(limiter.indexOf("v_now := clock_timestamp();"));
  });

  it("binds one private exposure to the exact full succeeded evidence chain", () => {
    for (const fragment of [
      "limiter_claim_id uuid not null unique references",
      "admission_id uuid not null unique references",
      "dispatch_id uuid not null unique references",
      "shopping_attempt_id uuid not null unique references",
      "projection_batch_id uuid not null unique references",
      "v_attempt.attempt_state <> 'succeeded'",
      "v_attempt.attempt_revision <> 2",
      "v_source_batch.source_response_sha256",
      "v_projection.projection_batch_sha256",
      "v_projection.projection_receipt_sha256",
      "p_source_offer_count <> p_projected_offer_count + p_refused_offer_count",
      "private_preview_exposure_authorized",
      "consumer_public_release_authorized",
      "exposure replay collision",
    ]) expect(migration).toContain(fragment);
  });

  it("supports zero offers and only consumer-safe reads under an active receipt", () => {
    expect(migration).toContain("p_projected_offer_count = 0");
    expect(migration).toContain(
      "create function public.read_flight_consumer_live_private_preview_offer_batch_v1",
    );
    expect(migration).toContain("v_exposure.exposure_not_after <= v_now");
    expect(migration).toContain("projection.presentation_expires_at > v_now");
    expect(migration).not.toContain("provider_offer_reference_ciphertext text");
    expect(verifier).toContain("Gate139 direct zero exposure failed");
    expect(verifier).toContain("Gate139 zero safe read failed");
  });

  it("classifies stale dispatch nonterminally and permits only late success, never redispatch", () => {
    for (const fragment of [
      "classification = 'stale_ambiguous'",
      "provider_redispatch_authorized",
      "for update of dispatch, attempt skip locked",
      "attempt.attempt_state = 'dispatching'",
      "late_success_after_stale",
      "v_attempt.completed_at < v_stale.classified_at",
    ]) expect(migration).toContain(fragment);
    const classifier = migration.slice(
      migration.indexOf("create function public.classify_flight_consumer_live_private_preview_stale_dispatches_v1"),
      migration.indexOf("create function public.authorize_flight_consumer_live_private_preview_exposure_v1"),
    );
    expect(classifier).not.toMatch(/update\s+public\.flight_consumer_live_duffel_shopping_attempts/i);
    expect(verifier).toContain("stale classification terminalized Gate101");
  });

  it("forces RLS, hides tables, and makes every evidence table immutable", () => {
    expect(migration).toContain(
      "execute format('alter table public.%I force row level security', v_table)",
    );
    for (const table of [
      "flight_consumer_live_private_preview_membership_events",
      "flight_consumer_live_private_preview_limiter_claims",
      "flight_consumer_live_private_preview_limiter_refusals",
      "flight_consumer_live_private_preview_stale_dispatches",
      "flight_consumer_live_private_preview_exposures",
    ]) expect(migration).toContain(`'${table}'`);
    expect(migration).toContain(
      "from public, anon, authenticated, service_role",
    );
    expect(migration).toContain("before update or delete");
    for (const boundary of [
      "order_authorized",
      "stripe_dispatch_authorized",
      "booking_authorized",
      "payment_authorized",
      "capture_authorized",
      "refund_authorized",
      "settlement_authorized",
      "ticketing_authorized",
      "servicing_authorized",
      "consumer_release_enabled",
      "blind_retry_authorized",
    ]) expect(migration).toContain(`check (not ${boundary})`);
  });

  it("keeps code route-free, provider-free, and default fail-closed", () => {
    expect(runtime).toContain("routeExposed: false as const");
    expect(runtime).toContain("providerTransportImplemented: false as const");
    expect(runtime).toContain("consumerPublicReleaseAuthorized: false as const");
    expect(runtime).toContain("failClosed: true as const");
    expect(runtime).not.toMatch(/fetch\s*\(/);
    expect(runtime).not.toMatch(/from ["']stripe["']|stripe\.|create_order|createOrder/i);
  });

  it("refuses rollback and documents unapplied dark-only boundaries", () => {
    expect(rollback).toContain("rollback refused");
    expect(rollback).not.toMatch(/drop table|drop function|truncate|delete from/i);
    expect(documentation).toContain("No route");
    expect(documentation).toContain("No provider or Stripe call");
    expect(documentation).toContain("not applied");
    expect(documentation).toContain("consumer public release remains false");
  });
});
