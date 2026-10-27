import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/202610270173_ratehawk_sandbox_validation_evidence.sql", "utf8");

describe("RateHawk validation evidence migration", () => {
  it("creates an append-only service-role evidence table with RLS", () => {
    expect(migration).toContain("create table public.inventory_supplier_validation_evidence");
    expect(migration).toContain("enable row level security");
    expect(migration).toMatch(/revoke all[\s\S]*from public, anon, authenticated, service_role/i);
    expect(migration).toMatch(/grant select, insert[\s\S]*to service_role/i);
    expect(migration).not.toMatch(/grant[^;]*(update|delete)/i);
  });

  it("stores only a constrained summary, never credentials or raw responses", () => {
    const tableDefinition = migration.match(/create table public\.inventory_supplier_validation_evidence \(([\s\S]*?)\n\);/i)?.[1] ?? "";
    expect(migration).toContain("hotel_count integer not null check (hotel_count > 0)");
    expect(migration).toContain("rate_count integer not null check (rate_count > 0)");
    expect(tableDefinition).not.toMatch(/api_key|secret|credential_value|raw_response|response_body/i);
  });
});
