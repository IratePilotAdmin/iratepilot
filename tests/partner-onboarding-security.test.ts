import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202608020006_secure_partner_onboarding.sql", import.meta.url),
  "utf8",
);
const route = readFileSync(new URL("../app/api/partner/properties/route.ts", import.meta.url), "utf8");

describe("partner onboarding authorization", () => {
  it("removes direct partner and property inserts", () => {
    expect(migration).toContain('drop policy if exists "Partners can create own partner record"');
    expect(migration).toContain('drop policy if exists "Partners can create own properties"');
  });

  it("keeps role-checked onboarding writes on the server-only client", () => {
    expect(route).toContain('requireRole(["partner", "admin"])');
    expect(route).toContain('admin.from("partners").insert');
    expect(route).toContain('admin.from("properties").insert');
    expect(route).not.toContain('auth.supabase.from("partners").insert');
    expect(route).not.toContain('auth.supabase.from("properties").insert');
  });
});
