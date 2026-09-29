import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/202608260122_flight_consumer_relock_settlement_constraint.sql",
    import.meta.url,
  ),
  "utf8",
);
const rollback = readFileSync(
  new URL(
    "../supabase/rollbacks/202608260122_flight_consumer_relock_settlement_constraint.rollback.sql",
    import.meta.url,
  ),
  "utf8",
);
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

const lockedPredicates = [
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

function normalizedGuardedPostures() {
  return [...migration.matchAll(
    /select count\(\*\)::integer into v_guarded_state_count([\s\S]*?)\n  if v_guarded_state_count <> 1 then/g,
  )].map((match) => match[0]!
    .slice(0, match[0]!.lastIndexOf("\n  if v_guarded_state_count"))
    .replace(/\s+/g, " ")
    .trim());
}

describe("Consumer Flight Preview relock settlement constraint qualification", () => {
  it("repairs only the validated settlement dependency from an exact guarded posture", () => {
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).toContain("requires migrations 068 through 082");
    expect(migration).toContain("relock settlement predecessor has drifted");
    expect(migration).toContain("requires an exact active or relocked TEST posture");
    expect(migration).toContain(
      "drop constraint flight_runtime_controls_provider_settlement_dependency_check",
    );
    expect(migration).toContain(
      "add constraint flight_runtime_controls_provider_settlement_dependency_check",
    );
    expect(migration).toContain(
      "validate constraint flight_runtime_controls_provider_settlement_dependency_check",
    );
    expect(migration).not.toMatch(/update\s+public\.flight_runtime_controls/i);
    expect(migration).not.toMatch(/grant\s|revoke\s/i);
  });

  it("admits a complete retained binding only for matching provider traffic or exact relock", () => {
    for (const predicate of lockedPredicates) {
      expect(migration).toContain(predicate);
      expect(schema).toContain(predicate);
    }
    for (const settlementColumn of [
      "bound_provider_settlement_processor_code",
      "bound_provider_settlement_account_sha256",
      "bound_provider_settlement_environment",
      "bound_provider_settlement_source_sha256",
      "bound_provider_settlement_adapter_version_sha256",
    ]) {
      expect(migration).toContain(`${settlementColumn} is null`);
      expect(migration).toContain(`${settlementColumn} is not null`);
    }
    expect(migration).toContain("provider_sandbox_traffic_enabled");
    expect(migration).toContain("bound_provider_settlement_environment = 'test'");
    expect(migration).toContain("provider_live_traffic_enabled");
    expect(migration).toContain("bound_provider_settlement_environment = 'live'");
  });

  it("uses one exact active-or-relocked posture before and after qualification", () => {
    const guardedPostures = normalizedGuardedPostures();
    expect(guardedPostures).toHaveLength(2);
    expect(new Set(guardedPostures).size).toBe(1);
    expect(guardedPostures[0]).toContain(
      "not control.execution_kill_switch_engaged and control.provider_sandbox_traffic_enabled",
    );
    expect(guardedPostures[0]).toContain(
      "control.execution_kill_switch_engaged and not control.provider_sandbox_traffic_enabled",
    );
  });

  it("proves the constraint is validated and leaves the control row unchanged", () => {
    expect(migration.match(/lower\(pg_catalog\.pg_get_constraintdef/g)).toHaveLength(2);
    expect(migration).not.toMatch(/position\('(?:IS NULL|NOT )/);
    expect(migration).toContain("constraint_record.convalidated");
    expect(migration).toContain("or not v_validated");
    expect(migration).toContain("migration 083 changed the guarded runtime posture");
    expect(migration).toContain("does not change a control row");
    expect(migration).toContain("does not change a control row, enable traffic, move money");
  });

  it("is forward-only because the predecessor would strand relock", () => {
    expect(rollback).toContain("Migration 083 is forward-only");
    expect(rollback).toContain("cannot be rolled back safely");
    expect(rollback).toContain("rejects the exact relocked posture");
    expect(rollback.trimEnd().endsWith("rollback;")).toBe(true);
  });
});
