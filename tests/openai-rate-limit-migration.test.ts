import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/hotel-migrations/202609180145_ai_travel_request_limits.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("../supabase/hotel-rollbacks/202609180145_ai_travel_request_limits.rollback.sql", import.meta.url),
  "utf8",
);

describe("AI travel request-limit migration", () => {
  it("keeps counters private and binds reservations to the authenticated account", () => {
    expect(migration).toContain("alter table public.ai_travel_request_windows enable row level security");
    expect(migration).toContain("revoke all on public.ai_travel_request_windows");
    expect(migration).toContain("auth.uid() <> p_user_id");
    expect(migration).toContain("grant execute on function public.reserve_ai_travel_request_slot(uuid)");
    expect(migration).toContain("to authenticated");
  });

  it("enforces distributed account and platform budgets", () => {
    expect(migration).toContain("pg_advisory_xact_lock(hashtext(v_global_scope))");
    expect(migration).toContain("pg_advisory_xact_lock(hashtext(v_user_scope))");
    expect(migration).toContain("v_user_count >= 5");
    expect(migration).toContain("v_global_count >= 200");
    expect(migration).toContain("interval '10 minutes'");
    expect(migration).toContain("interval '24 hours'");
  });

  it("has a complete rollback", () => {
    expect(rollback).toContain("drop function if exists public.reserve_ai_travel_request_slot(uuid)");
    expect(rollback).toContain("drop table if exists public.ai_travel_request_windows");
  });
});
