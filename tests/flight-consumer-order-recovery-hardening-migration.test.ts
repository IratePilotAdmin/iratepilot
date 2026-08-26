import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/202608260128_flight_consumer_order_recovery_hardening.sql",
    import.meta.url,
  ),
  "utf8",
);
const rollback = readFileSync(
  new URL(
    "../supabase/rollbacks/202608260128_flight_consumer_order_recovery_hardening.rollback.sql",
    import.meta.url,
  ),
  "utf8",
);
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

function functionDefinition(source: string, name: string, dollarTag: string) {
  const end = source.indexOf(`${dollarTag};`);
  const replaceStart = source.lastIndexOf(`create or replace function ${name}(`, end);
  const createStart = source.lastIndexOf(`create function ${name}(`, end);
  const start = replaceStart >= 0 ? replaceStart : createStart;
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + dollarTag.length + 1);
}

function taggedBlock(source: string, dollarTag: string) {
  const start = source.indexOf(`do ${dollarTag}`);
  const end = source.indexOf(`${dollarTag};`, start);
  expect(start).toBeGreaterThanOrEqual(0);
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

describe("Consumer Flight Preview order recovery hardening migration", () => {
  it("requires migration 088 and a fully relocked posture before and after repair", () => {
    const dependencies = taggedBlock(migration, "$flight_consumer_preview_089_dependencies$");
    const precondition = taggedBlock(migration, "$flight_consumer_preview_089_relocked_precondition$");
    const postcondition = taggedBlock(migration, "$flight_consumer_preview_089_postcondition$");

    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(dependencies).toContain("requires migrations 068 through 088");
    expect(dependencies).toContain("mark_flight_consumer_order_ambiguous_v1");
    expect(dependencies).toContain("v_attempt.state in (''prepared'', ''failed'', ''blocked'')");
    expect(precondition).toContain("migration 089 requires relock before hardening");
    expect(postcondition).toContain("migration 089 changed the locked runtime posture");
    for (const capability of disabledCapabilities) {
      expect(precondition).toContain(`and not control.${capability}`);
      expect(postcondition).toContain(`and not control.${capability}`);
    }
  });

  it("binds fresh prepare and locked claim to exact unexpired offer authority", () => {
    const prepare = functionDefinition(
      migration,
      "public.prepare_flight_consumer_duffel_order_attempt_v1",
      "$prepare_flight_consumer_order_089$",
    );
    const claim = functionDefinition(
      migration,
      "public.claim_flight_consumer_duffel_order_attempt_v1",
      "$claim_flight_consumer_order_089$",
    );

    expect(prepare).toContain("#variable_conflict error");
    expect(prepare).toContain("p_dispatch_not_after > v_reprice.expires_at");
    expect(prepare).toContain("p_dispatch_not_after > v_now + interval '5 minutes'");
    expect(claim).toContain("#variable_conflict error");
    expect(claim).toContain("select * into v_offer from public.flight_offers as offer");
    expect(claim).toContain("select * into v_reprice from public.flight_reprice_receipts as reprice");
    expect(claim).toContain("v_offer.status <> 'offered'");
    expect(claim).not.toContain("v_offer.expires_at <= v_now");
    expect(claim).toContain("v_reprice.status not in ('confirmed', 'price_changed')");
    expect(claim).toContain("v_reprice.repriced_total_cents is distinct from v_order.total_cents");
    expect(claim).toContain("v_attempt.dispatch_not_after > v_reprice.expires_at");
    expect(claim).toContain("v_reprice.customer_accepted_by is distinct from v_order.customer_id");
    expect(claim).toContain("evidence.retention_expires_at > v_now");
    expect(claim).toContain("evidence.deleted_at is null for share");
    expect(claim).not.toContain("evidence.retention_expires_at > clock_timestamp() for share");
  });

  it("returns deadline and evidence availability without throwing for missing success evidence", () => {
    const recovery = functionDefinition(
      migration,
      "public.get_flight_consumer_duffel_order_recovery_v1",
      "$get_flight_consumer_duffel_order_recovery_089$",
    );

    expect(migration).toContain(
      "drop function public.get_flight_consumer_duffel_order_recovery_v1(uuid, uuid);",
    );
    expect(recovery).toContain("dispatch_not_after timestamptz");
    expect(recovery).toContain("evidence_available boolean");
    expect(recovery).toContain("v_evidence_available := v_attempt.state = 'succeeded'");
    expect(recovery).toContain("and v_evidence.retention_expires_at > clock_timestamp()");
    expect(recovery).toContain("v_attempt.dispatch_not_after");
    expect(recovery).toContain("case when v_evidence_available then v_evidence.evidence_receipt_sha256 end");
    expect(recovery).not.toContain("Flight Duffel recovery response evidence is unavailable");
    expect(recovery).toContain("Non-successful Flight Duffel attempt cannot own response evidence");
  });

  it("preserves service-role-only execution for all three contracts", () => {
    for (const functionName of [
      "prepare_flight_consumer_duffel_order_attempt_v1",
      "claim_flight_consumer_duffel_order_attempt_v1",
      "get_flight_consumer_duffel_order_recovery_v1",
    ]) {
      expect(migration).toContain(`revoke all on function public.${functionName}(`);
      expect(migration).toContain(`grant execute on function public.${functionName}(`);
    }
    expect(migration.match(/from public, anon, authenticated, service_role;/g)).toHaveLength(3);
    expect(migration.match(/\) to service_role;/g)).toHaveLength(3);
    expect(migration).not.toMatch(/\)\s+to\s+(?:anon|authenticated)\s*;/i);
  });

  it("is mirrored byte-for-byte as its canonical schema block", () => {
    const marker =
      "-- Mirrored from migrations/202608260128_flight_consumer_order_recovery_hardening.sql.";
    expect(schema).toContain(`${marker}\n${migration.trimEnd()}`);
  });

  it("uses a forward-only rollback", () => {
    expect(rollback).toContain("Migration 089 is forward-only");
    expect(rollback).toContain("cannot be rolled back safely");
    expect(rollback).not.toContain("create or replace function");
    expect(rollback).not.toMatch(/^\s*(?:alter|drop|grant|revoke|update|insert|delete)\b/im);
    expect(rollback.trimEnd().endsWith("rollback;")).toBe(true);
  });
});
