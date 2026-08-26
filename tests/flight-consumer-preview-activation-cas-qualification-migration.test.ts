import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/202608260121_flight_consumer_activation_cas_qualification.sql",
    import.meta.url,
  ),
  "utf8",
);
const rollback = readFileSync(
  new URL(
    "../supabase/rollbacks/202608260121_flight_consumer_activation_cas_qualification.rollback.sql",
    import.meta.url,
  ),
  "utf8",
);
const predecessor = readFileSync(
  new URL(
    "../supabase/migrations/202608260120_flight_consumer_webhook_operational_escalation.sql",
    import.meta.url,
  ),
  "utf8",
);
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

function activationFunction(source: string, startText: string, dollarTag: string) {
  const start = source.lastIndexOf(startText);
  expect(start).toBeGreaterThan(0);
  const end = source.indexOf(`${dollarTag};`, start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + dollarTag.length + 1);
}

function normalizedFunction(source: string) {
  return source
    .replace(/^\s*--.*$/gm, "")
    .replace("create or replace function", "create function")
    .replace(/\$activate_flight_consumer_preview_08[12]\$/g, "$activation$")
    .replace(/\s+/g, " ")
    .trim();
}

describe("Consumer Flight Preview activation CAS qualification migration", () => {
  it("is an additive locked-state repair for the exact migration-081 wrapper", () => {
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).toContain("SQLSTATE 42702");
    expect(migration).toContain(
      "requires migrations 068 through 081",
    );
    expect(migration).toContain(
      "public.activate_flight_consumer_preview_080_v1(timestamptz,text,text,text,text,text,text)",
    );
    expect(migration).toContain("extensions.digest(bytea,text)");
    expect(migration).toContain("flight_runtime_controls_081_activation_gate");
    expect(migration).toContain("activation_gate.tgenabled = 'O'");
    expect(migration).toContain("predecessor has drifted");
    expect(predecessor).toContain("where control_key = v_080.control_key");
    expect(predecessor).toContain("and updated_at = v_080.updated_at");
  });

  it("requires and preserves every relocked Preview capability", () => {
    expect(migration).toContain(
      "do $flight_consumer_preview_082_relocked_precondition$",
    );
    for (const capability of [
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
    ]) {
      expect(migration).toContain(`and not control.${capability}`);
    }
    expect(migration).toContain("migration 082 requires relock before repair");
    expect(migration).toContain("migration 082 changed the locked runtime posture");
  });

  it("qualifies every target-table CAS reference and makes ambiguity an error", () => {
    const repaired = activationFunction(
      migration,
      "create or replace function public.activate_flight_consumer_preview_v1(",
      "$activate_flight_consumer_preview_082$",
    );
    expect(repaired).toContain("#variable_conflict error");
    expect(repaired).toContain(
      "update public.flight_runtime_controls as runtime_control",
    );
    for (const predicate of [
      "control_key = v_080.control_key",
      "updated_at = v_080.updated_at",
      "bound_execution_scope_sha256",
      "activation_evidence_sha256",
      "execution_kill_switch_engaged = false",
      "provider_sandbox_traffic_enabled = true",
      "provider_live_traffic_enabled = false",
      "production_release_enabled = false",
    ]) {
      expect(repaired).toContain(`runtime_control.${predicate}`);
    }
    expect(repaired).toContain("returning runtime_control.* into v_control");
    expect(repaired).not.toMatch(/\n\s*where control_key = v_080\.control_key/);
    expect(repaired).not.toMatch(/\n\s*and updated_at = v_080\.updated_at/);
  });

  it("preserves the reviewed 080 delegation and migration-081 evidence semantics", () => {
    const repaired = activationFunction(
      migration,
      "create or replace function public.activate_flight_consumer_preview_v1(",
      "$activate_flight_consumer_preview_082$",
    );
    expect(repaired).toContain(
      "perform public.assert_flight_consumer_preview_operational_escalation_contract_v1()",
    );
    expect(repaired).toContain(
      "'app.flight_consumer_preview_081_activation_contract'",
    );
    expect(repaired).toMatch(
      /from public\.activate_flight_consumer_preview_080_v1\(\s*p_expected_updated_at,\s*p_expected_execution_scope_sha256,\s*p_expected_activation_evidence_sha256,\s*p_expected_runtime_control_receipt_sha256,\s*p_stripe_account_id,\s*p_activation_packet_sha256,\s*p_activation_nonce\s*\)/,
    );
    expect(repaired).toContain(
      "'iratepilot.flight.consumer-preview.activation-evidence.v3'",
    );
    expect(repaired).toContain("'activation_control_migration', '202608260120'");
    expect(repaired).toContain("'provider_dispatch_authorized', false");
    expect(repaired).toContain("'production_authorized', false");
    expect(repaired).toContain(
      "v_runtime_control_receipt_sha256 = v_080.runtime_control_receipt_sha256",
    );

    const original = activationFunction(
      predecessor,
      "create function public.activate_flight_consumer_preview_v1(",
      "$activate_flight_consumer_preview_081$",
    );
    const reversedRepair = repaired
      .replace("#variable_conflict error", "")
      .replace(
        "update public.flight_runtime_controls as runtime_control",
        "update public.flight_runtime_controls",
      )
      .replaceAll("runtime_control.control_key", "control_key")
      .replaceAll("runtime_control.updated_at", "updated_at")
      .replaceAll(
        "runtime_control.bound_execution_scope_sha256",
        "bound_execution_scope_sha256",
      )
      .replaceAll(
        "runtime_control.activation_evidence_sha256",
        "activation_evidence_sha256",
      )
      .replaceAll(
        "runtime_control.execution_kill_switch_engaged",
        "execution_kill_switch_engaged",
      )
      .replaceAll(
        "runtime_control.provider_sandbox_traffic_enabled",
        "provider_sandbox_traffic_enabled",
      )
      .replaceAll(
        "runtime_control.provider_live_traffic_enabled",
        "provider_live_traffic_enabled",
      )
      .replaceAll(
        "runtime_control.production_release_enabled",
        "production_release_enabled",
      )
      .replace("returning runtime_control.* into v_control", "returning * into v_control");
    expect(normalizedFunction(reversedRepair)).toBe(normalizedFunction(original));
  });

  it("keeps the final schema function exactly aligned with the repaired implementation", () => {
    const repaired = activationFunction(
      migration,
      "create or replace function public.activate_flight_consumer_preview_v1(",
      "$activate_flight_consumer_preview_082$",
    );
    const mirrored = activationFunction(
      schema,
      "create or replace function public.activate_flight_consumer_preview_v1(",
      "$activate_flight_consumer_preview_082$",
    );
    expect(normalizedFunction(mirrored)).toBe(normalizedFunction(repaired));
    expect(schema).toContain(
      "Mirrored from migrations/202608260121_flight_consumer_activation_cas_qualification.sql",
    );
  });

  it("retains the exclusive authenticated-admin grant and is forward-only", () => {
    expect(migration).toMatch(
      /revoke all on function public\.activate_flight_consumer_preview_v1\([\s\S]*?\) from public, anon, authenticated, service_role;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.activate_flight_consumer_preview_v1\([\s\S]*?\) to authenticated;/,
    );
    expect(migration).toContain("routine.prosecdef");
    expect(migration).toContain("routine.provolatile");
    expect(migration).toContain(
      "search_path=pg_catalog, public, extensions",
    );
    expect(migration).toContain("'service_role'");
    expect(rollback).toContain("Migration 082 is forward-only");
    expect(rollback).toContain("known SQLSTATE-42702 activation wrapper");
    expect(rollback.trimEnd().endsWith("rollback;")).toBe(true);
  });
});
