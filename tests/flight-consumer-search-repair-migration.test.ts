import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/202608260123_flight_consumer_search_repair.sql",
    import.meta.url,
  ),
  "utf8",
);
const rollback = readFileSync(
  new URL(
    "../supabase/rollbacks/202608260123_flight_consumer_search_repair.rollback.sql",
    import.meta.url,
  ),
  "utf8",
);
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

function functionDefinition(source: string, name: string, dollarTag: string) {
  const end = source.indexOf(`${dollarTag};`);
  const replaceStart = source.lastIndexOf(
    `create or replace function ${name}(`,
    end,
  );
  const createStart = source.lastIndexOf(`create function ${name}(`, end);
  const definitionStart = replaceStart >= 0 ? replaceStart : createStart;
  expect(definitionStart).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(definitionStart);
  return source.slice(definitionStart, end + dollarTag.length + 1);
}

function normalizeFunction(source: string) {
  return source
    .replace("create or replace function", "create function")
    .replace(/\$(complete|fail)_flight_consumer_search(?:_084)?\$/g, "$function$")
    .replace(/\s+/g, " ")
    .trim();
}

function taggedBlock(source: string, dollarTag: string) {
  const start = source.indexOf(`do ${dollarTag}`);
  const end = source.indexOf(`${dollarTag};`, start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + dollarTag.length + 1);
}

const disabledCapabilities = [
  "synthetic_execution_enabled",
  "provider_sandbox_traffic_enabled",
  "provider_live_traffic_enabled",
  "shopping_enabled",
  "order_enabled",
  "payment_enabled",
  "ticketing_enabled",
  "servicing_enabled",
  "provider_events_enabled",
  "production_release_enabled",
] as const;

const qualified083ConstraintTokens = [
  "bound_provider_settlement_processor_code is not null",
  "execution_kill_switch_engaged",
  "not synthetic_execution_enabled",
  "not provider_sandbox_traffic_enabled",
  "not provider_live_traffic_enabled",
  "not shopping_enabled",
  "not order_enabled",
  "not payment_enabled",
  "not ticketing_enabled",
  "not servicing_enabled",
  "not provider_events_enabled",
  "not production_release_enabled",
] as const;

describe("Consumer Flight Preview search repair migration", () => {
  it("is an additive, relocked, forward-only repair", () => {
    const dependencies = taggedBlock(
      migration,
      "$flight_consumer_preview_084_dependencies$",
    );
    const precondition = taggedBlock(
      migration,
      "$flight_consumer_preview_084_relocked_precondition$",
    );
    const postcondition = taggedBlock(
      migration,
      "$flight_consumer_preview_084_postcondition$",
    );
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).toContain("requires migrations 068 through 083");
    expect(migration).toContain("predecessor has drifted");
    expect(dependencies).toContain(
      "lower(pg_catalog.pg_get_constraintdef(constraint_record.oid))",
    );
    expect(dependencies).toContain("constraint_record.convalidated");
    expect(dependencies).toContain("requires validated migration 083");
    for (const token of qualified083ConstraintTokens) {
      expect(dependencies).toContain(`'${token}'`);
    }
    expect(precondition).toContain("and control.execution_kill_switch_engaged");
    expect(precondition).toContain("migration 084 requires relock before repair");
    expect(postcondition).toContain("and control.execution_kill_switch_engaged");
    expect(postcondition).toContain("migration 084 changed the locked runtime posture");
    for (const capability of disabledCapabilities) {
      expect(precondition).toContain(`and not control.${capability}`);
      expect(postcondition).toContain(`and not control.${capability}`);
    }
    expect(rollback).toContain("Migration 084 is forward-only");
    expect(rollback).toContain("cannot be rolled back safely");
    expect(rollback).not.toContain("revoke select");
    expect(rollback).not.toContain("create or replace function");
    expect(rollback).not.toMatch(/^\s*(?:alter|drop|grant|revoke|update|insert|delete)\b/im);
    expect(rollback.trimEnd().endsWith("rollback;")).toBe(true);
  });

  it("accepts the sanitized pseudonymous local offer token without weakening its shape", () => {
    const repaired = functionDefinition(
      migration,
      "public.complete_flight_consumer_search_v1",
      "$complete_flight_consumer_search_084$",
    );
    expect(repaired).toContain("#variable_conflict error");
    expect(repaired).toContain("coalesce(v_offer_json ->> 'local_offer_id', '')");
    expect(repaired).toContain("^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$");
    expect(repaired).toContain("Flight local offer identity is malformed");
    expect(repaired).not.toContain("must equal its durable UUID");
    expect(repaired).toContain("v_offer_json ->> 'local_offer_id', null");
    expect(repaired).toContain("v_evidence_json ->> 'raw_body_sha256'");
    expect(repaired).toContain("v_attempt.terminal_response_sha256");
    const stableDuffelAlias = `duffel_offer_${"a".repeat(48)}`;
    expect(stableDuffelAlias).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/);
    expect(stableDuffelAlias).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    for (const malformedAlias of ["", "offer 0001", "-offer_0001", `offer_${"a".repeat(123)}`]) {
      expect(malformedAlias).not.toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/);
    }
  });

  it("makes the failure RPC ambiguity an error and qualifies the offer lookup", () => {
    const repaired = functionDefinition(
      migration,
      "public.fail_flight_consumer_search_v1",
      "$fail_flight_consumer_search_084$",
    );
    expect(repaired).toContain("#variable_conflict error");
    expect(repaired).toContain("select search.* into v_search");
    expect(repaired).toContain("join public.flight_provider_request_attempts as attempt");
    expect(repaired).toContain("where attempt.id = p_attempt_id");
    expect(repaired).toContain("from public.flight_offers as offer");
    expect(repaired).toContain("where offer.search_id = v_search.id");
    expect(repaired).not.toMatch(/from public\.flight_offers\s+where\s+search_id\b/);
    expect(repaired).toContain(
      "Successful provider response may fail locally only before any offer materializes",
    );
  });

  it("preserves service-role-only execution and grants only required scope filters", () => {
    for (const signature of [
      "public.complete_flight_consumer_search_v1(uuid, integer, jsonb)",
      "public.fail_flight_consumer_search_v1(uuid, integer)",
    ]) {
      expect(migration).toContain(`revoke all on function ${signature}`);
      expect(migration).toContain(`grant execute on function ${signature}`);
    }
    expect(migration).toContain("from public, anon, authenticated, service_role");
    expect(migration).toContain("to service_role");
    const scopeTables = [
      "flight_offers",
      "flight_orders",
      "flight_payments",
      "flight_ticket_documents",
    ] as const;
    for (const table of scopeTables) {
      expect(migration).toContain(
        `grant select (execution_scope_sha256) on public.${table} to authenticated;`,
      );
      expect(schema).toContain(
        `grant select (execution_scope_sha256) on public.${table} to authenticated;`,
      );
      expect(migration).toContain(
        `'anon', 'public.${table}', 'execution_scope_sha256', 'SELECT'`,
      );
    }
    expect(migration.match(
      /grant select \(execution_scope_sha256\) on public\.flight_[a-z_]+ to authenticated;/g,
    )).toHaveLength(4);
    expect(schema.match(
      /grant select \(execution_scope_sha256\) on public\.flight_[a-z_]+ to authenticated;/g,
    )).toHaveLength(4);
    expect(migration).not.toMatch(/grant\s+select\s+on(?:\s+table)?\s+public\.flight_offers/i);
    expect(migration).not.toMatch(/grant\s+(?:all|insert|update|delete|truncate)/i);
    for (const sensitiveColumn of [
      "provider_offer_ref_ciphertext",
      "provider_offer_ref_sha256",
      "provider_payload_sha256",
      "provider_order_ref_ciphertext",
      "provider_order_ref_sha256",
      "processor_reference_ciphertext",
      "processor_reference_sha256",
      "document_ref_ciphertext",
      "document_ref_sha256",
    ]) {
      expect(migration).toContain(`'${sensitiveColumn}', 'SELECT'`);
    }
  });

  it("keeps both final schema routines aligned with the installed repair", () => {
    const pairs = [
      {
        name: "public.complete_flight_consumer_search_v1",
        migrationTag: "$complete_flight_consumer_search_084$",
        schemaTag: "$complete_flight_consumer_search_084$",
      },
      {
        name: "public.fail_flight_consumer_search_v1",
        migrationTag: "$fail_flight_consumer_search_084$",
        schemaTag: "$fail_flight_consumer_search_084$",
      },
    ];
    for (const pair of pairs) {
      const installed = functionDefinition(migration, pair.name, pair.migrationTag);
      const mirrored = functionDefinition(schema, pair.name, pair.schemaTag);
      expect(normalizeFunction(mirrored)).toBe(normalizeFunction(installed));
    }
    expect(schema).toContain(
      "Service-role Preview search completion with migration-084 sanitized local-offer identity validation.",
    );
    expect(schema).toContain(
      "Service-role Preview search failure with migration-084 output-parameter-safe offer lookup.",
    );
  });
});
