import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/production-migrations/202608260103_flight_consumer_live_stripe_payment_intent_plan_journal.sql",
  "utf8",
);
const rollback = readFileSync(
  "supabase/production-rollbacks/202608260103_flight_consumer_live_stripe_payment_intent_plan_journal.rollback.sql",
  "utf8",
);
const normalizedMigration = migration.replace(/\s+/g, " ").trim();
const normalizedRollback = rollback.replace(/\s+/g, " ").trim();

const expectedColumns = [
  "id",
  "execution_scope_sha256",
  "payment_binding_sha256",
  "order_reference_sha256",
  "customer_reference_sha256",
  "payment_attempt_reference_sha256",
  "metadata_sha256",
  "request_body_sha256",
  "request_envelope_sha256",
  "idempotency_request_sha256",
  "idempotency_key_sha256",
  "plan_sha256",
  "plan_version",
  "plan_mode",
  "processor_id",
  "amount_cents",
  "currency",
  "capture_method",
  "confirmation_method",
  "payment_method_type",
  "provider_request_count",
  "stripe_request_count",
  "stripe_mutation_count",
  "payment_intent_count",
  "charge_count",
  "refund_count",
  "external_request_made",
  "raw_payment_method_accepted",
  "client_secret_exposed",
  "payment_authorized",
  "capture_authorized",
  "refund_authorized",
  "order_authorized",
  "ticketing_authorized",
  "consumer_release_enabled",
  "recorded_at",
];

function occurrenceCount(source: string, exact: string) {
  return source.split(exact).length - 1;
}

describe("Flight Consumer Live Stripe zero-dispatch plan journal migration", () => {
  it("creates a digest-only, forced-RLS journal for the reviewed plan", () => {
    expect(migration.startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).toContain(
      "create table public.flight_consumer_live_stripe_payment_intent_plans",
    );
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("force row level security");
    for (const digest of [
      "execution_scope_sha256",
      "payment_binding_sha256",
      "order_reference_sha256",
      "customer_reference_sha256",
      "payment_attempt_reference_sha256",
      "metadata_sha256",
      "request_body_sha256",
      "request_envelope_sha256",
      "idempotency_request_sha256",
      "idempotency_key_sha256",
      "plan_sha256",
    ]) {
      expect(migration).toContain(digest);
    }
    expect(migration).not.toMatch(/\b(?:jsonb?|bytea)\b/i);
    expect(migration).not.toMatch(
      /raw_(?:identifier|payload|request|response)|authorization_header|stripe_signature|payment_method_id|provider_object_ref/i,
    );
    const tableContract = migration.slice(
      migration.indexOf(
        "create table public.flight_consumer_live_stripe_payment_intent_plans",
      ),
      migration.indexOf(
        "create index flight_consumer_live_stripe_payment_intent_plans_recorded_idx",
      ),
    );
    const actualColumns = [...tableContract.matchAll(
      /^  ([a-z][a-z0-9_]*) (?:uuid|text|bigint|smallint|boolean|timestamptz)\b/gm,
    )].map((match) => match[1]);
    expect(actualColumns).toEqual(expectedColumns);
    for (const digest of expectedColumns.filter((column) => column.endsWith("_sha256"))) {
      const uniqueness = digest === "plan_sha256" ? " unique" : "";
      expect(normalizedMigration).toContain(
        `${digest} text not null${uniqueness} check (${digest} ~ '^[0-9a-f]{64}$')`,
      );
      expect(normalizedMigration).toContain(
        `p_${digest} is null or p_${digest} !~ '^[0-9a-f]{64}$'`,
      );
    }
    expect(normalizedMigration).toContain(
      "plan_version text not null default 'flight-consumer-production-stripe-payment-intent-plan-v1'",
    );
    expect(normalizedMigration).toContain(
      "processor_id text not null default 'stripe_live' check (processor_id = 'stripe_live')",
    );
    expect(normalizedMigration).toContain(
      "amount_cents bigint not null check (amount_cents between 50 and 99999999)",
    );
  });

  it("hard-locks every transport, money-movement, order, and release capability", () => {
    expect(migration).toContain("plan_mode text not null default 'zero_dispatch'");
    expect(migration).toContain("currency text not null default 'usd'");
    expect(migration).toContain("capture_method text not null default 'manual'");
    expect(migration).toContain("confirmation_method text not null default 'automatic'");
    expect(migration).toContain("payment_method_type text not null default 'card'");
    for (const count of [
      "provider_request_count",
      "stripe_request_count",
      "stripe_mutation_count",
      "payment_intent_count",
      "charge_count",
      "refund_count",
    ]) {
      expect(migration).toContain(`${count} smallint not null default 0`);
      expect(migration).toContain(`check (${count} = 0)`);
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
      expect(migration).toContain(`${capability} boolean not null default false`);
      expect(migration).toContain(`check (not ${capability})`);
    }
    expect(migration).not.toMatch(
      /create function public\.(?:claim|dispatch|complete|capture|refund|confirm|create_order|issue_ticket)/i,
    );
  });

  it("allows only a service-role recorder with exact replay and collision refusal", () => {
    const functionName =
      "record_flight_consumer_live_stripe_payment_intent_plan_v1";
    expect(migration).toContain(`create function public.${functionName}(`);
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog, public");
    expect(migration).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(migration).toContain("'created'::text");
    expect(migration.match(/'replay'::text/g)).toHaveLength(2);
    expect(migration).toContain("payment plan idempotency collision");
    expect(migration).toContain("payment plan concurrency collision");
    expect(migration).toContain("when unique_violation then");
    expect(migration).toContain("for update;");
    expect(migration.match(/create table public\./g)).toHaveLength(1);
    expect(migration.match(/create function public\./g)).toHaveLength(1);
    expect(migration).toContain(
      `alter function public.${functionName}(`,
    );
    expect(migration).toContain(") owner to postgres;");
    expect(migration).not.toMatch(/create\s+policy/i);

    const functionBody = migration.match(
      /as \$record_flight_consumer_live_stripe_payment_intent_plan_v1\$([\s\S]*?)\$record_flight_consumer_live_stripe_payment_intent_plan_v1\$;/,
    )?.[1];
    expect(functionBody).toBeDefined();
    expect(functionBody).not.toMatch(
      /^\s*(?:update|delete|truncate|merge|execute|perform|copy)\b/im,
    );
    expect(functionBody).not.toMatch(
      /\b(?:http|net)\.|dblink|pg_notify|lo_import|lo_export|create extension/i,
    );
  });

  it("binds all immutable fields in both replay and race comparisons", () => {
    const storedTuple = [
      "v_plan.execution_scope_sha256",
      "v_plan.payment_binding_sha256",
      "v_plan.order_reference_sha256",
      "v_plan.customer_reference_sha256",
      "v_plan.payment_attempt_reference_sha256",
      "v_plan.metadata_sha256",
      "v_plan.request_body_sha256",
      "v_plan.request_envelope_sha256",
      "v_plan.idempotency_request_sha256",
      "v_plan.idempotency_key_sha256",
      "v_plan.plan_sha256",
      "v_plan.amount_cents",
    ].join(", ");
    const inputTuple = [
      "p_execution_scope_sha256",
      "p_payment_binding_sha256",
      "p_order_reference_sha256",
      "p_customer_reference_sha256",
      "p_payment_attempt_reference_sha256",
      "p_metadata_sha256",
      "p_request_body_sha256",
      "p_request_envelope_sha256",
      "p_idempotency_request_sha256",
      "p_idempotency_key_sha256",
      "p_plan_sha256",
      "p_amount_cents",
    ].join(", ");
    expect(occurrenceCount(normalizedMigration, `row( ${storedTuple} )`)).toBe(2);
    expect(occurrenceCount(normalizedMigration, `row( ${inputTuple} )`)).toBe(2);
    expect(occurrenceCount(
      normalizedMigration,
      "candidate.execution_scope_sha256 = p_execution_scope_sha256 and candidate.idempotency_key_sha256 = p_idempotency_key_sha256",
    )).toBe(4);
    expect(occurrenceCount(
      normalizedMigration,
      "candidate.execution_scope_sha256 = p_execution_scope_sha256 and candidate.payment_attempt_reference_sha256 = p_payment_attempt_reference_sha256",
    )).toBe(4);
    expect(occurrenceCount(
      normalizedMigration,
      "candidate.plan_sha256 = p_plan_sha256",
    )).toBe(4);
    expect(normalizedMigration).toContain(
      "unique (execution_scope_sha256, idempotency_key_sha256)",
    );
    expect(normalizedMigration).toContain(
      "unique (execution_scope_sha256, payment_attempt_reference_sha256)",
    );
    expect(normalizedMigration).toContain("plan_sha256 text not null unique");
    expect(normalizedMigration).toContain(
      "p_amount_cents < 50 or p_amount_cents > 99999999",
    );
    expect(occurrenceCount(
      normalizedMigration,
      "p_order_reference_sha256 = p_customer_reference_sha256 or p_order_reference_sha256 = p_payment_attempt_reference_sha256 or p_customer_reference_sha256 = p_payment_attempt_reference_sha256",
    )).toBe(1);
  });

  it("revokes direct table access and grants only the narrow recorder", () => {
    expect(migration).toContain(
      "revoke all on table public.flight_consumer_live_stripe_payment_intent_plans\n  from public, anon, authenticated, service_role;",
    );
    expect(migration).toContain(
      ") from public, anon, authenticated, service_role;",
    );
    const expectedGrant =
      "grant execute on function public.record_flight_consumer_live_stripe_payment_intent_plan_v1( text, text, text, text, text, text, text, text, text, text, text, bigint ) to service_role;";
    expect(occurrenceCount(normalizedMigration, expectedGrant)).toBe(1);
    expect(normalizedMigration.replace(expectedGrant, "")).not.toMatch(/\bgrant\b/i);
    expect(migration).not.toContain(") to authenticated;");
    expect(migration).not.toContain(") to anon;");
  });

  it("is isolated from Preview, common commerce, Duffel, and car lineage", () => {
    expect(migration).not.toMatch(
      /flight_(?:orders|payments|tickets)|flight_consumer_live_duffel|car_rental|202608260(?:12[0-9]|13[0-7]|20[0-7])/i,
    );
    expect(migration).not.toMatch(
      /\b(?:http|net)\.|create extension|from\s+extensions\.|supabase\/migrations/i,
    );
  });

  it("refuses rollback after evidence exists and never deletes or truncates it", () => {
    expect(rollback.startsWith("begin;")).toBe(true);
    expect(rollback.trimEnd().endsWith("commit;")).toBe(true);
    expect(rollback).toContain(
      "lock table public.flight_consumer_live_stripe_payment_intent_plans\n  in access exclusive mode;",
    );
    expect(rollback).toContain(
      "Refusing rollback: Flight Consumer Live Stripe payment evidence exists",
    );
    expect(rollback).toContain(
      "drop table public.flight_consumer_live_stripe_payment_intent_plans;",
    );
    const revokeAt = normalizedRollback.indexOf("revoke all on function");
    const lockAt = normalizedRollback.indexOf("lock table public.");
    const guardAt = normalizedRollback.indexOf("if exists (");
    const refusalAt = normalizedRollback.indexOf("raise exception 'Refusing rollback:");
    const dropFunctionAt = normalizedRollback.indexOf("drop function public.");
    const dropTableAt = normalizedRollback.indexOf("drop table public.");
    const commitAt = normalizedRollback.lastIndexOf("commit;");
    expect([
      revokeAt,
      lockAt,
      guardAt,
      refusalAt,
      dropFunctionAt,
      dropTableAt,
      commitAt,
    ]).toEqual([...[
      revokeAt,
      lockAt,
      guardAt,
      refusalAt,
      dropFunctionAt,
      dropTableAt,
      commitAt,
    ]].sort((left, right) => left - right));
    expect(rollback).not.toMatch(/\b(?:delete|truncate|update)\b/i);
    expect(rollback).not.toMatch(/\bcascade\b|\bgrant\b|drop\s+(?:function|table)\s+if\s+exists/i);
    expect(rollback.match(/drop function public\./g)).toHaveLength(1);
    expect(rollback.match(/drop table public\./g)).toHaveLength(1);
    expect(rollback).not.toMatch(/flight_(?:orders|payments|tickets)|duffel|car_rental/i);
  });
});
