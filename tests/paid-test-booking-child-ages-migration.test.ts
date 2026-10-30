import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202610300178_paid_test_booking_child_ages.sql", import.meta.url),
  "utf8",
);

describe("paid test booking child ages migration", () => {
  it("validates and persists child ages in the paid-booking transaction", () => {
    expect(migration).toContain("p_child_ages integer[]");
    expect(migration).toContain("cardinality(p_child_ages) >= p_guests");
    expect(migration).toContain("check_in, check_out, guests, child_ages");
    expect(migration).toContain("p_check_in, p_check_out, p_guests, p_child_ages");
  });

  it("keeps the new RPC overload private to the service role", () => {
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });
});
