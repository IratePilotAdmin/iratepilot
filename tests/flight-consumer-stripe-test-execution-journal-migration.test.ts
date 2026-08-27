import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/production-migrations/202608260104_flight_consumer_stripe_test_execution_journal.sql";
const rollbackPath =
  "supabase/production-rollbacks/202608260104_flight_consumer_stripe_test_execution_journal.rollback.sql";
const migration = readFileSync(migrationPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");
const normalizedMigration = migration.replace(/\s+/g, " ").trim();
const normalizedRollback = rollback.replace(/\s+/g, " ").trim();

const tables = [
  "flight_consumer_stripe_test_payment_attempts",
  "flight_consumer_stripe_test_webhook_events",
  "flight_consumer_stripe_test_payment_observations",
];
const rpcFunctions = [
  "prepare_flight_consumer_stripe_test_payment_attempt_v1",
  "claim_flight_consumer_stripe_test_payment_attempt_v1",
  "record_flight_consumer_stripe_test_payment_observation_v1",
  "recover_flight_consumer_stripe_test_payment_attempt_v1",
];

function occurrenceCount(source: string, exact: string) {
  return source.split(exact).length - 1;
}

describe("Flight Consumer Stripe TEST execution journal migration 104", () => {
  it("creates only the dedicated transactional journal in one transaction", () => {
    expect(migration.startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration.match(/create table public\./g)).toHaveLength(3);
    expect(migration.match(/create function public\./g)).toHaveLength(6);
    for (const table of tables) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.${table}\n  enable row level security;`);
      expect(migration).toContain(`alter table public.${table}\n  force row level security;`);
      expect(migration).toContain(
        `revoke all on table public.${table}\n  from public, anon, authenticated, service_role;`,
      );
    }
    for (const rpc of rpcFunctions) {
      expect(migration).toContain(`create function public.${rpc}(`);
      expect(migration).toContain(`public.${rpc}(`);
    }
    expect(migration).not.toMatch(/create\s+policy/i);
  });

  it("stores only digests, numeric lifecycle observations, and local UUIDs", () => {
    for (const digestColumn of [
      "execution_scope_sha256",
      "payment_binding_sha256",
      "order_reference_sha256",
      "customer_reference_sha256",
      "payment_attempt_reference_sha256",
      "workflow_sha256",
      "metadata_sha256",
      "request_body_sha256",
      "request_envelope_sha256",
      "idempotency_request_sha256",
      "idempotency_key_sha256",
      "lease_token_sha256",
      "payment_intent_reference_sha256",
      "last_observation_sha256",
      "reconciliation_evidence_sha256",
      "webhook_event_id_sha256",
      "payload_sha256",
      "semantic_sha256",
      "verification_receipt_sha256",
      "observation_sha256",
      "evidence_sha256",
    ]) {
      expect(migration).toContain(digestColumn);
    }
    expect(migration).not.toMatch(/\b(?:jsonb?|bytea)\b/i);
    expect(migration).not.toMatch(
      /authorization_header|stripe_signature|client_secret_value|payment_method_id|provider_payload|raw_(?:body|payload|request|response|identifier)|card_number|customer_email/i,
    );
    expect(migration).not.toMatch(
      /(?:sk|rk)_(?:test|live)_|whsec_|'(?:pi|pm|ch|re|evt)_[A-Za-z0-9_]+'/,
    );
  });

  it("hard-locks TEST mode and all external/money/release authority", () => {
    expect(normalizedMigration).toContain(
      "processor_environment text not null default 'stripe_test' check (processor_environment = 'stripe_test')",
    );
    expect(migration.match(/livemode boolean not null default false check \(not livemode\)/g))
      .toHaveLength(3);
    expect(normalizedMigration).toContain(
      "capture_method text not null default 'manual' check (capture_method = 'manual')",
    );
    for (const count of [
      "provider_request_count",
      "provider_mutation_count",
      "payment_intent_create_count",
      "capture_request_count",
      "refund_request_count",
    ]) {
      expect(normalizedMigration).toContain(
        `${count} integer not null default 0 check (${count} = 0)`,
      );
    }
    for (const capability of [
      "external_request_made",
      "raw_payment_method_accepted",
      "client_secret_exposed",
      "payment_authorized",
      "capture_authorized",
      "refund_authorized",
      "order_authorized",
      "ticketing_authorized",
      "consumer_release_enabled",
    ]) {
      expect(normalizedMigration).toContain(
        `${capability} boolean not null default false check (not ${capability})`,
      );
    }
    expect(migration).not.toMatch(
      /\b(?:http|net)\.|dblink|pg_notify|lo_import|lo_export|create extension|from\s+extensions\./i,
    );
    expect(migration).not.toMatch(
      /flight_(?:orders|payments|tickets)|flight_consumer_live_duffel|car_rental/i,
    );
  });

  it("implements exact attempt identity, lease CAS, and immutable PI binding", () => {
    expect(normalizedMigration).toContain(
      "unique (execution_scope_sha256, payment_attempt_reference_sha256)",
    );
    expect(normalizedMigration).toContain(
      "unique (execution_scope_sha256, idempotency_key_sha256)",
    );
    expect(normalizedMigration).toContain("unique (workflow_sha256)");
    expect(normalizedMigration).toContain(
      "payment_intent_reference_sha256 ) where payment_intent_reference_sha256 is not null",
    );
    expect(migration).toContain("attempt idempotency collision");
    expect(migration).toContain("attempt concurrency collision");
    expect(migration).toContain("attempt identity is ambiguous");
    expect(migration).toContain("attempt revision must advance by exact CAS");
    expect(migration).toContain("PaymentIntent binding is immutable");
    expect(migration).toContain("lease_seconds not between 15 and 120");
    expect(migration).toContain("recovery requires an expired exact lease");
    expect(migration).toContain("blind_retry_authorized boolean");
    expect(normalizedMigration).toContain(
      "v_attempt.recovery_state, false",
    );
  });

  it("deduplicates webhook evidence and allows no unverified database claim", () => {
    expect(normalizedMigration).toContain(
      "unique (execution_scope_sha256, webhook_event_id_sha256)",
    );
    expect(normalizedMigration).toContain(
      "unique (execution_scope_sha256, idempotency_sha256)",
    );
    expect(normalizedMigration).toContain("unique (observation_sha256)");
    expect(migration).toContain("webhook replay collision");
    expect(migration).toContain("webhook identity conflict");
    expect(migration).toContain("observation digest collision");
    expect(migration).toContain(
      "Opaque caller evidence is not authenticated by this database function.",
    );
    expect(migration).toContain(
      "A separately signature-verified webhook is asynchronous",
    );
    expect(migration).toContain("p_source = 'stripe_retrieve'");
    expect(migration).toContain("p_source = 'stripe_webhook'");
    expect(migration).not.toMatch(/webhooks\.constructEvent|signature_verified\s+boolean/i);
  });

  it("keeps lifecycle observation and capture/refund placeholders bounded", () => {
    for (const state of [
      "not_observed",
      "requires_payment_method",
      "requires_confirmation",
      "requires_action",
      "processing",
      "requires_capture",
      "succeeded",
      "canceled",
      "failed",
      "ambiguous",
    ]) {
      expect(migration).toContain(`'${state}'`);
    }
    expect(migration).toContain(
      "amount_refunded_cents <= amount_received_cents",
    );
    expect(migration).toContain(
      "p_amount_refunded_cents > p_amount_received_cents",
    );
    expect(migration).toContain("p_capture_state = 'captured'");
    expect(migration).toContain("p_refund_state = 'succeeded'");
    expect(migration).toContain("lifecycle observation is inconsistent");
    expect(migration).not.toMatch(
      /create function public\.(?:capture|refund|dispatch|confirm|create_order|issue_ticket)/i,
    );
  });

  it("pins every definer to postgres and grants only four RPCs to service role", () => {
    expect(migration.match(/security definer/g)).toHaveLength(6);
    expect(migration.match(/set search_path = pg_catalog, public/g)).toHaveLength(6);
    expect(migration.match(/owner to postgres;/g)).toHaveLength(6);
    expect(migration.match(/coalesce\(auth\.role\(\), ''\) <> 'service_role'/g))
      .toHaveLength(4);
    expect(migration.match(/grant execute on function/g)).toHaveLength(4);
    expect(migration.match(/\) to service_role;/g)).toHaveLength(4);
    expect(migration).not.toContain(") to authenticated;");
    expect(migration).not.toContain(") to anon;");
    expect(normalizedMigration.match(/grant\s+[\s\S]*?;/gi)?.every(
      (statement) => /grant execute on function[\s\S]*to service_role;/i
        .test(statement),
    )).toBe(true);
  });

  it("has an exact evidence-preserving rollback with no destructive shortcut", () => {
    expect(rollback.startsWith("begin;")).toBe(true);
    expect(rollback.trimEnd().endsWith("commit;")).toBe(true);
    for (const table of tables) {
      expect(rollback).toContain(`lock table public.${table}`);
      expect(rollback).toContain(`drop table public.${table};`);
    }
    for (const rpc of rpcFunctions) {
      expect(rollback).toContain(`public.${rpc}(`);
    }
    expect(rollback).toContain(
      "Refusing rollback: Flight Consumer Stripe TEST execution evidence exists",
    );
    expect(rollback.match(/drop function public\./g)).toHaveLength(6);
    expect(rollback.match(/drop table public\./g)).toHaveLength(3);
    expect(rollback).not.toMatch(/\b(?:delete|truncate|update)\b/i);
    expect(rollback).not.toMatch(
      /\bcascade\b|\bgrant\b|drop\s+(?:function|table)\s+if\s+exists/i,
    );

    const positions = [
      normalizedRollback.indexOf("revoke all on function"),
      normalizedRollback.indexOf("lock table public."),
      normalizedRollback.indexOf("if exists ("),
      normalizedRollback.indexOf("raise exception 'Refusing rollback:"),
      normalizedRollback.indexOf("drop trigger"),
      normalizedRollback.indexOf("drop function public."),
      normalizedRollback.indexOf("drop table public."),
      normalizedRollback.lastIndexOf("commit;"),
    ];
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it("remains a distinct 104 artifact outside Preview and the car range", () => {
    expect(migrationPath).toContain("202608260104_");
    expect(rollbackPath).toContain("202608260104_");
    expect(migration).not.toMatch(/202608260(?:12[0-9]|13[0-7]|20[0-7])/);
    expect(rollback).not.toMatch(/202608260(?:12[0-9]|13[0-7]|20[0-7])/);
    expect(occurrenceCount(migration, "202608260103")).toBe(0);
  });
});
