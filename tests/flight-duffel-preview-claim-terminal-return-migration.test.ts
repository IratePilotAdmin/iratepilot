import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/202608250073_flight_duffel_claim_terminal_return.sql",
  "utf8",
);
const rollback = readFileSync(
  "supabase/rollbacks/202608250073_flight_duffel_claim_terminal_return.rollback.sql",
  "utf8",
);
const schema = readFileSync("supabase/schema.sql", "utf8");

describe("Duffel Preview claim terminal-return migration", () => {
  it("makes create-order and shopping claim routing mutually exclusive", () => {
    expect(migration).toMatch(
      /if p_operation = 'create_order' then[\s\S]*?return query select \* from public\.claim_flight_provider_order_attempt_for_dispatch\(p_attempt_id, p_expected_revision\);\s*else\s*return query select \* from public\.claim_flight_provider_request_attempt_for_dispatch\(p_attempt_id, p_expected_revision\);\s*end if;/,
    );
    expect(migration.match(/return query select \* from public\.claim_flight_provider_(?:order|request)_attempt_for_dispatch/g)).toHaveLength(2);
    expect(migration).toContain("security definer set search_path = pg_catalog, public");
    expect(migration).toContain("from public, anon, authenticated, service_role");
    expect(migration).toContain("to service_role");
    expect(migration).not.toMatch(/\b(?:insert|update|delete|truncate)\b/i);
    expect(migration).not.toContain("production");
  });

  it("refuses to restore the known-broken fallthrough router", () => {
    expect(rollback).toContain("if exists (select 1 from public.flight_provider_request_attempts)");
    expect(rollback).toContain("raise exception");
    expect(rollback).not.toMatch(/create\s+or\s+replace\s+function/i);
    expect(rollback).not.toMatch(/drop\s+(?:table|function)/i);
  });

  it("mirrors the exact reviewed migration bytes once in the bootstrap schema", () => {
    const marker = "-- Mirrored from migrations/202608250073_flight_duffel_claim_terminal_return.sql.";
    expect(schema.split(marker)).toHaveLength(2);
    expect(schema).toContain(`${marker}\n${migration.trimEnd()}`);
  });
});
