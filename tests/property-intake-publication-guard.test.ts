import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL(
  "../supabase/migrations/202609300162_property_intake_publication_guard.sql",
  import.meta.url,
), "utf8");

describe("property intake publication guard migration", () => {
  it("returns verified property ids in one bounded RPC result", () => {
    expect(migration).toContain("get_verified_hotel_intake_property_ids");
    expect(migration).toContain("returns uuid[]");
    expect(migration).toContain("array_agg(distinct application.property_id)");
    expect(migration).toContain("review.inactive_draft_scope_confirmed");
    expect(migration).toContain("to authenticated");
  });

  it("enforces the verified intake inside the publication transaction", () => {
    expect(migration).toContain("create or replace function public.set_property_publication_state");
    expect(migration).toContain("application.property_id = p_property_id");
    expect(migration).toContain("intake_review.inactive_draft_scope_confirmed");
    expect(migration).toContain("A verified approved hotel application linked to this property is required before publication");
    expect(migration.indexOf("intake_review.inactive_draft_scope_confirmed"))
      .toBeLessThan(migration.indexOf("set_property_publication_state_graph_guarded"));
  });
});
