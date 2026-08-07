import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202608070031_property_pms_connections.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("../supabase/rollbacks/202608070031_property_pms_connections.rollback.sql", import.meta.url),
  "utf8",
);

describe("property PMS connection migration", () => {
  it("stores declarations without credential columns", () => {
    expect(migration).toContain("external_property_code");
    expect(migration).not.toMatch(/client_secret|access_token|api_key/i);
  });

  it("prevents partners from self-activating connections", () => {
    expect(migration).toContain("connection_status in ('declared', 'credentials_pending')");
    expect(migration).toContain("last_validated_at is null");
    expect(migration).toContain("profiles.role = 'admin'");
  });

  it("uses RLS and blocks anonymous access", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.property_pms_connections from anon");
  });

  it("refuses to roll back a table containing declarations", () => {
    expect(rollback).toContain("Refusing rollback");
    expect(rollback).toContain("contains data");
  });
});
