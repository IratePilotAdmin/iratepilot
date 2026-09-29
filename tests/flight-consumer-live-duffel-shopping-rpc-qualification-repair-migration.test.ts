import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/production-migrations/202608260102_flight_consumer_live_duffel_shopping_rpc_qualification_repair.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("../supabase/production-rollbacks/202608260102_flight_consumer_live_duffel_shopping_rpc_qualification_repair.rollback.sql", import.meta.url),
  "utf8",
);

describe("Production Duffel live-shopping RPC qualification repair migration", () => {
  it("qualifies every claim and completion CAS predicate", () => {
    expect(migration).toContain("create or replace function public.claim_flight_consumer_live_duffel_shopping_attempt_v1");
    expect(migration).toContain("create or replace function public.complete_flight_consumer_live_duffel_shopping_attempt_v1");
    for (const predicate of [
      "journal.id = p_attempt_id",
      "journal.execution_scope_sha256 = p_execution_scope_sha256",
      "journal.operation = 'create_offer_request'",
      "journal.attempt_state = 'prepared'",
      "journal.attempt_state = 'dispatching'",
      "journal.attempt_revision = p_expected_revision",
      "journal.dispatch_not_after > v_now",
    ]) {
      expect(migration).toContain(predicate);
    }
    expect(migration).toContain("returning journal.* into v_attempt");
  });

  it("preserves service-role-only authority and a fail-closed rollback", () => {
    expect(migration).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(migration).toContain("from public, anon, authenticated, service_role;");
    expect(migration.match(/to service_role;/g)).toHaveLength(2);
    expect(rollback.match(/from service_role;/g)).toHaveLength(2);
    expect(rollback).not.toMatch(/drop table|delete from|truncate/i);
  });
});
