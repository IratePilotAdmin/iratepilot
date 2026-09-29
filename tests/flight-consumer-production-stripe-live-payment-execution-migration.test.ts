import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/production-migrations/202608260106_flight_consumer_live_stripe_payment_execution_journal.sql";
const rollbackPath =
  "supabase/production-rollbacks/202608260106_flight_consumer_live_stripe_payment_execution_journal.rollback.sql";
const migration = readFileSync(migrationPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");

const rpcNames = [
  "prepare_flight_consumer_live_stripe_payment_execution_v1",
  "claim_flight_consumer_live_stripe_payment_execution_v1",
  "complete_flight_consumer_live_stripe_payment_execution_v1",
  "mark_flight_consumer_live_stripe_payment_execution_ambiguous_v1",
  "recover_flight_consumer_live_stripe_payment_execution_v1",
] as const;

describe("Flight Consumer Production Stripe live execution migration 106", () => {
  it("is a transaction-scoped authored prerequisite pinned to migration 103", () => {
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).toContain(
      "public.flight_consumer_live_stripe_payment_intent_plans",
    );
    expect(migration).toContain(
      "record_flight_consumer_live_stripe_payment_intent_plan_v1(text,text,text,text,text,text,text,text,text,text,text,bigint)",
    );
    expect(migration).toContain("extensions.digest(bytea,text)");
    expect(migration).not.toMatch(/\b(create extension|alter extension)\b/i);
  });

  it("stores an immutable live binding and only encrypted PaymentIntent references", () => {
    expect(migration).toContain(
      "processor_environment text not null default 'stripe_live'",
    );
    expect(migration).toContain(
      "livemode boolean not null default true check (livemode)",
    );
    expect(migration).toContain("payment_binding_sha256 text not null");
    expect(migration).toContain("execution_workflow_sha256 text not null unique");
    expect(migration).toContain("execution_prerequisite_sha256 text not null");
    expect(migration).toContain("payment_intent_reference_ciphertext text");
    expect(migration).toContain(
      "^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,}$",
    );
    expect(migration).toContain(
      "char_length(payment_intent_reference_ciphertext) <= 4096",
    );
    expect(migration).toContain("payment_intent_reference_sha256 text");
    expect(migration).not.toMatch(/\bpayment_intent_reference\s+text\b/);
    expect(migration).not.toMatch(/\bp_(?:client_secret|payment_method|card|pan|cvc)\b/i);

    for (const returnsBlock of migration.matchAll(
      /returns table \(([\s\S]*?)\)\s*language plpgsql/g,
    )) {
      expect(returnsBlock[1]).not.toContain(
        "payment_intent_reference_ciphertext",
      );
    }
  });

  it("forces RLS and exposes only five service-role RPCs", () => {
    for (const table of [
      "flight_consumer_live_stripe_payment_executions",
      "flight_consumer_live_stripe_payment_execution_receipts",
    ]) {
      expect(migration).toContain(
        `alter table public.${table}\n  enable row level security;`,
      );
      expect(migration).toContain(
        `alter table public.${table}\n  force row level security;`,
      );
      expect(migration).toMatch(new RegExp(
        `revoke all on table(?:\\s+public\\.| public\\.)${table}`,
      ));
    }

    for (const rpcName of rpcNames) {
      const bodyStart = migration.indexOf(`create function public.${rpcName}(`);
      expect(bodyStart).toBeGreaterThan(-1);
      const nextFunction = migration.indexOf("\ncreate function public.", bodyStart + 1);
      const body = migration.slice(
        bodyStart,
        nextFunction === -1 ? migration.length : nextFunction,
      );
      expect(body).toContain("coalesce(auth.role(), '') <> 'service_role'");
      expect(migration).toMatch(new RegExp(
        `grant execute on function\\s+public\\.${rpcName}\\(`,
      ));
    }
    expect(migration.match(/grant execute on function/g)).toHaveLength(5);
    expect(migration).not.toMatch(/grant\s+(?:select|insert|update|delete|all)/i);
    expect(migration).not.toMatch(/grant execute[\s\S]{0,400}\bto (?:public|anon|authenticated)\b/i);
  });

  it("enforces exact CAS transitions without reset, delete, or reopen", () => {
    const guardStart = migration.indexOf(
      "create function public.protect_flight_consumer_live_stripe_payment_execution_v1()",
    );
    const guardEnd = migration.indexOf(
      "$protect_flight_consumer_live_stripe_payment_execution_v1$;",
      guardStart,
    );
    const guard = migration.slice(guardStart, guardEnd);

    expect(guard).toContain(
      "new.attempt_revision <> old.attempt_revision + 1",
    );
    expect(guard).toContain(
      "old.attempt_state = 'prepared' and new.attempt_state = 'claimed'",
    );
    expect(guard).toContain(
      "new.attempt_state in ('completed', 'ambiguous', 'reconciled')",
    );
    expect(guard).toContain(
      "old.attempt_state = 'ambiguous'\n    and new.attempt_state = 'reconciled'",
    );
    expect(guard).not.toContain("new.attempt_state = 'prepared'");
    expect(migration).not.toMatch(/set\s+attempt_state\s*=\s*'prepared'/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\./i);
    expect(migration).not.toMatch(/truncate\s+(?:table\s+)?public\./i);
    expect(migration).toContain(
      "Flight Consumer Live Stripe execution receipts are append-only",
    );
  });

  it("keeps completion, ambiguity, and recovery terminal and live-only", () => {
    expect(migration).toContain("p_livemode is distinct from true");
    expect(migration.match(/p_livemode is distinct from true/g))
      .toHaveLength(3);
    expect(migration).toContain(
      "v_attempt.attempt_state not in ('claimed', 'ambiguous')",
    );
    expect(migration).toContain(
      "and v_now < v_attempt.lease_expires_at",
    );
    expect(migration).toContain(
      "attempt_state = 'reconciled'",
    );
    expect(migration).toContain(
      "blind_retry_authorized boolean not null default false",
    );
    expect(migration).toContain("check (not blind_retry_authorized)");
    expect(migration).not.toMatch(/\bretry_prepared\b/i);
  });

  it("hard-locks every downstream authority and mutation count", () => {
    for (const authority of [
      "stripe_dispatch_authorized",
      "payment_authorized",
      "order_authorized",
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

  it("provides a data-preserving rollback with exact dependency order", () => {
    expect(rollback.trimStart().startsWith("begin;")).toBe(true);
    expect(rollback.trimEnd().endsWith("commit;")).toBe(true);
    expect(rollback).toContain(
      "Refusing rollback: Flight Consumer Live Stripe execution evidence exists",
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
      "drop table public.flight_consumer_live_stripe_payment_execution_receipts",
    )).toBeLessThan(rollback.indexOf(
      "drop table public.flight_consumer_live_stripe_payment_executions",
    ));
    expect(rollback).not.toMatch(/cascade/i);
  });
});
