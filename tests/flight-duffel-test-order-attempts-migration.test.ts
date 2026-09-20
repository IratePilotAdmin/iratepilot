import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/202608250070_flight_duffel_test_order_attempts.sql",
  "utf8",
);
const rollback = readFileSync(
  "supabase/rollbacks/202608250070_flight_duffel_test_order_attempts.rollback.sql",
  "utf8",
);
const bootstrap = readFileSync("supabase/schema.sql", "utf8");

describe("Duffel test order-attempt migration", () => {
  it("adds only the exact non-retryable create_order journal operation", () => {
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).toContain("Duffel test order attempts require migration 069");
    expect(migration).toContain("'list_orders_by_offer', 'create_order'");
    expect(migration).toContain("p_provider_code <> 'duffel'");
    expect(migration).toContain("'test', 'order'");
    expect(migration).toContain("'test', 'payment', p_provider_code, 'duffel_balance'");
    expect(migration).toContain("'test', 'ticketing'");
    expect(migration).toContain("v_control.bound_environment <> 'preview'");
    expect(migration).toContain("v_control.bound_project_ref <> 'eiqmdldjnedqgbtoozqa'");
    expect(migration).not.toMatch(/\b(?:fetch|http_request|net\.http|vault\.)\b/i);
    expect(migration).not.toMatch(/\b(?:insert into|update)\s+public\.flight_runtime_controls\b/i);
  });

  it("locks and rechecks authority before the exact dispatch CAS", () => {
    const claim = migration.slice(
      migration.indexOf("create function public.claim_flight_provider_order_attempt_for_dispatch"),
    );
    expect(claim.indexOf("for update")).toBeGreaterThanOrEqual(0);
    expect(claim.indexOf("execution_kill_switch_engaged")).toBeGreaterThan(claim.indexOf("for update"));
    expect(claim.indexOf("app.flight_request_authority_receipt_sha256")).toBeGreaterThan(0);
    expect(claim.indexOf("dispatch_not_after <= v_now")).toBeGreaterThan(0);
    expect(claim.indexOf("set state = 'dispatching'")).toBeGreaterThan(
      claim.indexOf("dispatch_not_after <= v_now"),
    );
    expect(migration).toContain("retry_authorized, prepared_at");
    expect(migration).toContain("'prepared', 0, false, v_now");
  });

  it("keeps service-role-only RPC authority and forced-RLS storage", () => {
    for (const name of [
      "prepare_flight_provider_order_attempt",
      "claim_flight_provider_order_attempt_for_dispatch",
    ]) {
      expect(migration).toContain(`revoke all on function public.${name}(`);
      expect(migration).toMatch(new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?\\)\\s+to service_role;`));
    }
    expect(migration).toContain("coalesce(auth.role(), '') <> 'service_role'");
  });

  it("refuses evidence-destroying rollback and restores the shopping-only constraint", () => {
    expect(rollback).toContain("where operation = 'create_order'");
    expect(rollback).toContain("Rollback refused: Duffel test order-attempt evidence exists");
    expect(rollback).toContain("drop function public.claim_flight_provider_order_attempt_for_dispatch");
    expect(rollback).toContain("'create_offer_request', 'retrieve_offer', 'list_orders_by_offer'");
    expect(rollback).not.toContain("'list_orders_by_offer', 'create_order'");
  });

  it("is mirrored exactly once in the bootstrap schema", () => {
    const body = migration
      .replace(/^begin;\r?\n\r?\n/, "")
      .replace(/\r?\ncommit;\r?\n?$/, "");
    expect(bootstrap.split(body)).toHaveLength(2);
  });
});
