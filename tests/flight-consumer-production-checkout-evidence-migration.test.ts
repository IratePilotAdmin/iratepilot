import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/production-migrations/202608260107_flight_consumer_live_checkout_evidence_aggregate.sql";
const rollbackPath =
  "supabase/production-rollbacks/202608260107_flight_consumer_live_checkout_evidence_aggregate.rollback.sql";
const migration = readFileSync(migrationPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");

const rpcNames = [
  "prepare_flight_consumer_live_checkout_evidence_v1",
  "finalize_flight_consumer_live_checkout_evidence_v1",
  "abandon_flight_consumer_live_checkout_evidence_v1",
] as const;

describe("Flight Consumer Production checkout evidence migration 107", () => {
  it("is transaction-scoped and pins the reviewed 105/103/106 prerequisites", () => {
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    for (const prerequisite of [
      "flight_consumer_live_duffel_offer_refresh_attempts",
      "flight_consumer_live_stripe_payment_intent_plans",
      "flight_consumer_live_stripe_payment_executions",
      "record_flight_consumer_live_stripe_payment_intent_plan_v1",
      "prepare_flight_consumer_live_duffel_offer_refresh_attempt_v1",
      "prepare_flight_consumer_live_stripe_payment_execution_v1",
      "profiles",
      "extensions.digest(bytea,text)",
    ]) {
      expect(migration).toContain(prerequisite);
    }
    expect(migration).not.toMatch(/\b(create extension|alter extension)\b/i);
  });

  it("binds one exact succeeded 105 refresh and one untouched 106 execution", () => {
    expect(migration).toContain("offer_refresh_attempt_id uuid not null unique");
    expect(migration).toContain("stripe_plan_id uuid not null unique");
    expect(migration).toContain("stripe_execution_attempt_id uuid not null unique");
    expect(migration).toContain("refresh.attempt_state = 'succeeded'");
    expect(migration).toContain("refresh.attempt_revision = 2");
    expect(migration).toContain("refresh.provider_dispatch_count = 1");
    expect(migration).toContain("refresh.terminal_http_status = 200");
    expect(migration).toContain("refresh.price_amount_minor = p_amount_cents");
    expect(migration).toContain("plan.plan_mode = 'zero_dispatch'");
    expect(migration).toContain("execution.attempt_state = 'prepared'");
    expect(migration).toContain("execution.attempt_revision = 0");
    expect(migration).toContain("execution.stripe_request_count = 0");
    expect(migration).toContain(
      "execution.latest_state_receipt_sha256 =\n       p_stripe_execution_state_receipt_sha256",
    );
  });

  it("stores only versioned ciphertext and independent domain-separated digests", () => {
    const aggregateStart = migration.indexOf(
      "create table public.flight_consumer_live_checkout_evidence_aggregates",
    );
    const aggregateEnd = migration.indexOf(
      "create index flight_consumer_live_checkout_evidence_state_idx",
      aggregateStart,
    );
    const aggregate = migration.slice(aggregateStart, aggregateEnd);

    for (const field of ["traveler", "contact", "billing_address"]) {
      expect(aggregate).toContain(`${field}_payload_ciphertext text not null`);
      expect(aggregate).toContain(`${field}_payload_sha256 text not null`);
      expect(aggregate).toContain(`${field}_evidence_sha256 text not null`);
    }
    expect(aggregate).toContain("terms_snapshot_sha256 text not null");
    expect(aggregate).toContain("terms_acceptance_sha256 text not null");
    expect(aggregate).not.toMatch(/\b(?:traveler|contact|billing_address)_plaintext\b/i);
    expect(aggregate).not.toMatch(/\bprovider_(?:order|offer|passenger)_ref(?:erence)?\b/i);
    expect(migration).toContain(
      "checkout:traveler-ciphertext:v1",
    );
    expect(migration).toContain("checkout:contact-ciphertext:v1");
    expect(migration).toContain("checkout:address-ciphertext:v1");

    for (const returnsBlock of migration.matchAll(
      /returns table \(([\s\S]*?)\)\s*language plpgsql/g,
    )) {
      expect(returnsBlock[1]).not.toContain("_ciphertext");
      expect(returnsBlock[1]).not.toContain("customer_id");
      expect(returnsBlock[1]).not.toContain("order_id");
    }
  });

  it("anchors the customer and self-contained order identity to reviewed digests", () => {
    expect(migration).toContain(
      "customer_id uuid not null references public.profiles(id) on delete restrict",
    );
    expect(migration).toContain("attribute.atttypid = 'uuid'::regtype");
    expect(migration).toContain("constraint_record.contype in ('p', 'u')");
    expect(migration).toContain("order_id uuid not null");
    expect(migration).toContain("plan.order_reference_sha256 = p_order_reference_sha256");
    expect(migration).toContain("plan.customer_reference_sha256 = p_customer_reference_sha256");
    expect(migration).toContain("plan.amount_cents = p_amount_cents");
    expect(migration).toContain("execution.amount_cents = p_amount_cents");
    expect(migration).toContain("p_currency is distinct from 'USD'");
    expect(migration).not.toContain("public.flight_orders");
  });

  it("forces RLS and exposes exactly three service-role RPCs", () => {
    for (const table of [
      "flight_consumer_live_checkout_evidence_aggregates",
      "flight_consumer_live_checkout_evidence_receipts",
    ]) {
      expect(migration).toContain(
        `alter table public.${table}\n  enable row level security;`,
      );
      expect(migration).toContain(
        `alter table public.${table}\n  force row level security;`,
      );
    }
    for (const rpcName of rpcNames) {
      const bodyStart = migration.indexOf(`create function public.${rpcName}(`);
      expect(bodyStart).toBeGreaterThan(-1);
      const next = migration.indexOf("\ncreate function public.", bodyStart + 1);
      const body = migration.slice(bodyStart, next === -1 ? migration.length : next);
      expect(body).toContain("coalesce(auth.role(), '') <> 'service_role'");
      expect(migration).toMatch(new RegExp(
        `grant execute on function\\s+public\\.${rpcName}\\(`,
      ));
    }
    expect(migration.match(/grant execute on function/g)).toHaveLength(3);
    expect(migration).not.toMatch(/grant execute[\s\S]{0,800}\bto (?:public|anon|authenticated)\b/i);
  });

  it("permits only prepared-to-finalized or prepared-to-abandoned CAS", () => {
    const guardStart = migration.indexOf(
      "create function public.protect_flight_consumer_live_checkout_evidence_v1()",
    );
    const guardEnd = migration.indexOf(
      "$protect_flight_consumer_live_checkout_evidence_v1$;",
      guardStart,
    );
    const guard = migration.slice(guardStart, guardEnd);
    expect(guard).toContain("old.checkout_state <> 'prepared'");
    expect(guard).toContain(
      "new.checkout_state not in ('finalized', 'abandoned')",
    );
    expect(guard).toContain(
      "new.checkout_revision <> old.checkout_revision + 1",
    );
    expect(migration).toContain(
      "Flight Consumer Live checkout evidence receipts are append-only",
    );
    expect(migration).not.toMatch(/set\s+checkout_state\s*=\s*'prepared'/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\./i);
    expect(migration).not.toMatch(/truncate\s+(?:table\s+)?public\./i);
    expect(migration).not.toMatch(/\b(reset|reopen)_flight_consumer_live_checkout/i);
  });

  it("resolves exact replay before mutable offer/106 prerequisite checks", () => {
    const prepareStart = migration.indexOf(
      "create function public.prepare_flight_consumer_live_checkout_evidence_v1",
    );
    const prepareEnd = migration.indexOf(
      "$prepare_flight_consumer_live_checkout_evidence_v1$;",
      prepareStart,
    );
    const body = migration.slice(prepareStart, prepareEnd);
    expect(body).toContain("while every changed byte/digest is still refused");
    expect(body.indexOf("v_match_count > 0")).toBeLessThan(
      body.indexOf("select refresh.* into v_refresh"),
    );
    expect(body).toContain("v_match_count <> 1 or not v_exact_match");
    expect(body).toContain(
      "Flight Consumer Live checkout evidence replay collision",
    );
  });

  it("revalidates the still-prepared zero-dispatch prerequisite at finalize", () => {
    const start = migration.indexOf(
      "create function public.finalize_flight_consumer_live_checkout_evidence_v1",
    );
    const end = migration.indexOf(
      "$finalize_flight_consumer_live_checkout_evidence_v1$;",
      start,
    );
    const body = migration.slice(start, end);
    expect(body).toContain("execution.attempt_state = 'prepared'");
    expect(body).toContain("execution.attempt_revision = 0");
    expect(body).toContain("execution.stripe_request_count = 0");
    expect(body).toContain("refresh.offer_expires_at > v_now");
    expect(body).toContain(
      "execution.latest_state_receipt_sha256 =\n       v_aggregate.stripe_execution_state_receipt_sha256",
    );
    expect(body).toContain("checkout_revision = p_expected_revision");
  });

  it("hard-locks every provider, booking, payment, and release authority", () => {
    for (const authority of [
      "provider_dispatch_authorized",
      "stripe_dispatch_authorized",
      "booking_authorized",
      "order_authorized",
      "payment_authorized",
      "capture_authorized",
      "refund_authorized",
      "settlement_authorized",
      "ticketing_authorized",
      "servicing_authorized",
      "consumer_release_enabled",
    ]) {
      expect(migration).toContain(`check (not ${authority})`);
    }
    for (const count of [
      "provider_request_count",
      "stripe_request_count",
      "order_request_count",
      "payment_request_count",
      "capture_request_count",
      "refund_request_count",
      "settlement_request_count",
      "ticket_request_count",
    ]) {
      expect(migration).toContain(`check (${count} = 0)`);
    }
  });

  it("has a data-preserving rollback with exact dependency order", () => {
    expect(rollback.trimStart().startsWith("begin;")).toBe(true);
    expect(rollback.trimEnd().endsWith("commit;")).toBe(true);
    expect(rollback).toContain(
      "Refusing rollback: Flight Consumer Live checkout evidence exists",
    );
    expect(rollback.indexOf("lock table")).toBeLessThan(
      rollback.indexOf("Refusing rollback"),
    );
    expect(rollback.indexOf("drop trigger")).toBeLessThan(
      rollback.indexOf("drop function"),
    );
    expect(rollback.indexOf("drop function")).toBeLessThan(
      rollback.indexOf("drop table"),
    );
    expect(rollback.indexOf(
      "drop table public.flight_consumer_live_checkout_evidence_receipts",
    )).toBeLessThan(rollback.indexOf(
      "drop table public.flight_consumer_live_checkout_evidence_aggregates",
    ));
    expect(rollback).not.toMatch(/cascade/i);
  });
});
