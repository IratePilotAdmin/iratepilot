import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202611150183_atomic_cloudbeds_api_key_delivery.sql", import.meta.url),
  "utf8",
);

describe("Cloudbeds API-key delivery transaction", () => {
  it("stores credentials, connection status, and evidence in one database function", () => {
    expect(migration).toContain("create or replace function public.complete_cloudbeds_api_key_delivery");
    expect(migration).toContain("insert into public.property_pms_credentials");
    expect(migration).toContain("update public.property_pms_connections");
    expect(migration).toContain("insert into public.pms_connection_test_events");
  });

  it("requires approved, authorized, and unambiguous property ownership", () => {
    expect(migration).toContain("connection.hotel_authorized");
    expect(migration).toContain("partner.status = 'approved'");
    expect(migration).toContain("if ownership_count <> 1");
  });

  it("restricts execution to the service role", () => {
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });
});
