import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202608020004_secure_profile_updates.sql", import.meta.url),
  "utf8",
);
const route = readFileSync(new URL("../app/api/profile/route.ts", import.meta.url), "utf8");

describe("profile update authorization", () => {
  it("removes broad row updates and exposes only identity-bound contact fields", () => {
    expect(migration).toContain('drop policy if exists "Users can update own profile"');
    expect(migration).toContain("create or replace function public.update_own_profile");
    expect(migration).toContain("where id = auth.uid()");
    expect(migration).toContain("set full_name = trim(p_full_name)");
    expect(migration).not.toContain("p_user_id");
  });

  it("routes profile edits through the restricted function", () => {
    expect(route).toContain('supabase.rpc("update_own_profile"');
    expect(route).not.toContain('from("profiles").update');
  });
});
