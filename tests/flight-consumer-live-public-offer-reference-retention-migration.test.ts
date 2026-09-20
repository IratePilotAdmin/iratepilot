import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const forward = readFileSync(
  "supabase/production-migrations/202608260117_flight_consumer_live_public_offer_reference_retention.sql",
  "utf8",
);
const rollback = readFileSync(
  "supabase/production-rollbacks/202608260117_flight_consumer_live_public_offer_reference_retention.rollback.sql",
  "utf8",
);

describe("Production-local expired offer-reference retention migration 117", () => {
  it("uses a service-role-only bounded locked purge and never returns secrets", () => {
    expect(forward.trimStart().startsWith("begin;")).toBe(true);
    expect(forward).toContain("p_limit not between 1 and 500");
    expect(forward).toContain("for update skip locked");
    expect(forward).toContain("retention_expires_at <= v_now");
    expect(forward).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(forward).toContain("grant execute on function");
    expect(forward).not.toMatch(/returns table[\s\S]{0,600}(ciphertext|sha256)/i);
  });

  it("records no empty receipt and append-only digest/count evidence otherwise", () => {
    expect(forward).toContain("if v_count = 0 then");
    expect(forward.indexOf("if v_count = 0 then")).toBeLessThan(
      forward.indexOf("insert into public.flight_consumer_live_public_offer_reference_purge_receipts"),
    );
    expect(forward).toContain("purged_projection_set_sha256");
    expect(forward).toContain("purged_count integer not null");
    expect(forward).toContain("enable row level security");
    expect(forward).toContain("force row level security");
    expect(forward).toContain("before update or delete");
  });

  it("makes only vault DELETE possible through the definer and restores immutability", () => {
    expect(forward).toContain("before update on public.flight_consumer_live_public_offer_reference_vaults");
    expect(forward).toContain("revoke all on table");
    expect(rollback).toContain("before update or delete on");
    expect(rollback).toContain("Refusing rollback:");
    expect(rollback).not.toMatch(/cascade|truncate|delete from/i);
  });
});
