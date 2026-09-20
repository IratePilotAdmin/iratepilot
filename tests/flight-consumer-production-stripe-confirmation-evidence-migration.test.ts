import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/production-migrations/202608260109_flight_consumer_live_stripe_confirmation_journal.sql",
  "utf8",
);
const rollback = readFileSync(
  "supabase/production-rollbacks/202608260109_flight_consumer_live_stripe_confirmation_journal.rollback.sql",
  "utf8",
);

const rpcNames = [
  "prepare_flight_consumer_live_stripe_confirmation_v1",
  "claim_flight_consumer_live_stripe_confirmation_handoff_v1",
  "record_flight_consumer_live_stripe_confirmation_terminal_v1",
  "mark_flight_consumer_live_stripe_confirmation_ambiguous_v1",
  "reconcile_flight_consumer_live_stripe_confirmation_v1",
] as const;

describe("Flight Consumer Production Stripe confirmation evidence migration 109", () => {
  it("is transaction-scoped and pins the frozen 106 completed / 107 prepared prerequisites", () => {
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    for (const prerequisite of [
      "flight_consumer_live_stripe_payment_executions",
      "flight_consumer_live_stripe_payment_execution_receipts",
      "flight_consumer_live_checkout_evidence_aggregates",
      "flight_consumer_live_checkout_evidence_receipts",
      "complete_flight_consumer_live_stripe_payment_execution_v1",
      "prepare_flight_consumer_live_checkout_evidence_v1",
      "extensions.digest(bytea,text)",
    ]) {
      expect(migration).toContain(prerequisite);
    }
    expect(migration).toContain("v_checkout.checkout_state <> 'prepared'");
    expect(migration).toContain("v_execution.attempt_state <> 'completed'");
    expect(migration).toContain("v_execution.attempt_revision <> 2");
    expect(migration).toContain("v_execution.payment_intent_create_count <> 1");
    expect(migration).not.toMatch(/\b(create extension|alter extension)\b/i);
  });

  it("copies only the encrypted PaymentIntent reference and stores all observations as digests or bounded facts", () => {
    expect(migration).toContain("payment_intent_reference_ciphertext text not null");
    expect(migration).toContain("payment_intent_reference_sha256 text not null unique");
    expect(migration).toContain("observed_payment_intent_status text");
    expect(migration).toContain("observed_amount_cents bigint");
    expect(migration).toContain("observed_currency text");
    expect(migration).toContain("observed_livemode boolean");
    expect(migration).toContain("observed_payment_intent_reference_sha256 text");
    for (const digest of [
      "confirmation_request_sha256",
      "provider_response_sha256",
      "confirmation_evidence_sha256",
      "webhook_event_sha256",
      "retrieval_evidence_sha256",
      "ambiguity_evidence_sha256",
      "reconciliation_evidence_sha256",
    ]) {
      expect(migration).toContain(`${digest} text`);
    }
    expect(migration).not.toMatch(/\b(client_secret|payment_method|card_number|\bpan\b|\bcvc\b)\s+text\b/i);
    expect(migration).not.toMatch(/\bp_(?:client_secret|payment_method|card|pan|cvc|raw_provider_payload)\b/i);
    for (const block of migration.matchAll(
      /returns table \(([\s\S]*?)\)\s*language plpgsql/g,
    )) {
      expect(block[1]).not.toContain("payment_intent_reference_ciphertext");
      expect(block[1]).not.toContain("customer_id");
      expect(block[1]).not.toContain("order_id");
    }
  });

  it("requires structured live Stripe facts before authorization evidence can be asserted", () => {
    expect(migration).toContain(
      "p_observed_payment_intent_status is distinct from 'requires_capture'",
    );
    expect(migration).toContain(
      "p_observed_amount_cents <> v_attempt.amount_cents",
    );
    expect(migration).toContain(
      "p_observed_currency <> lower(v_attempt.currency)",
    );
    expect(migration).toContain("p_observed_livemode is distinct from true");
    expect(migration).toContain(
      "p_observed_payment_intent_reference_sha256 <>\n      v_attempt.payment_intent_reference_sha256",
    );
    expect(migration).toContain(
      "and (webhook_event_sha256 is not null\n        or retrieval_evidence_sha256 is not null)",
    );
    expect(migration).toContain("'observed_payment_intent_status'");
    expect(migration).toContain("'observed_amount_cents'");
    expect(migration).toContain("'observed_livemode'");
  });

  it("forces RLS and exposes exactly five service-role RPCs", () => {
    for (const table of [
      "flight_consumer_live_stripe_confirmation_attempts",
      "flight_consumer_live_stripe_confirmation_receipts",
    ]) {
      expect(migration).toContain(
        `alter table public.${table}\n  enable row level security;`,
      );
      expect(migration).toContain(
        `alter table public.${table}\n  force row level security;`,
      );
    }
    for (const rpcName of rpcNames) {
      const start = migration.indexOf(`create function public.${rpcName}(`);
      expect(start).toBeGreaterThan(-1);
      const next = migration.indexOf("\ncreate function public.", start + 1);
      const body = migration.slice(start, next === -1 ? migration.length : next);
      expect(body).toContain("coalesce(auth.role(), '') <> 'service_role'");
      expect(migration).toMatch(new RegExp(
        `grant execute on function\\s+public\\.${rpcName}\\(`,
      ));
    }
    expect(migration.match(/grant execute on function/g)).toHaveLength(5);
    expect(migration).not.toMatch(/grant execute[\s\S]{0,900}\bto (?:public|anon|authenticated)\b/i);
  });

  it("permits one bounded handoff, terminal evidence, and evidence-only reconciliation without reset", () => {
    const guardStart = migration.indexOf(
      "create function public.protect_flight_consumer_live_stripe_confirmation_v1()",
    );
    const guardEnd = migration.indexOf(
      "$protect_flight_consumer_live_stripe_confirmation_v1$;",
      guardStart,
    );
    const guard = migration.slice(guardStart, guardEnd);
    expect(guard).toContain(
      "new.confirmation_revision <> old.confirmation_revision + 1",
    );
    expect(guard).toContain(
      "old.confirmation_state = 'prepared'\n        and new.confirmation_state = 'handoff_claimed'",
    );
    expect(guard).toContain(
      "'authorized_requires_capture', 'failed', 'ambiguous'",
    );
    expect(guard).toContain(
      "old.confirmation_state = 'ambiguous'\n        and new.confirmation_state = 'reconciled'",
    );
    expect(migration).toContain("handoff_seconds between 15 and 300");
    expect(migration).toContain("p_handoff_seconds not between 15 and 300");
    expect(migration).toContain("blind_retry_authorized boolean not null default false");
    expect(migration).not.toMatch(/set\s+confirmation_state\s*=\s*'prepared'/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\./i);
    expect(migration).not.toMatch(/truncate\s+(?:table\s+)?public\./i);
  });

  it("keeps capture, refund, Duffel order, ticketing, servicing, and release at zero authority", () => {
    for (const authority of [
      "confirmation_handoff_authorized",
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
      "blind_retry_authorized",
    ]) {
      expect(migration).toContain(`check (not ${authority})`);
    }
    for (const count of [
      "order_request_count",
      "capture_request_count",
      "refund_request_count",
      "ticket_request_count",
    ]) {
      expect(migration).toContain(`check (${count} = 0)`);
    }
  });

  it("has a data-preserving, non-cascading rollback", () => {
    expect(rollback.trimStart().startsWith("begin;")).toBe(true);
    expect(rollback.trimEnd().endsWith("commit;")).toBe(true);
    expect(rollback).toContain(
      "Refusing rollback: Flight Consumer Live Stripe confirmation evidence exists",
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
    expect(rollback).not.toMatch(/cascade/i);
  });
});
