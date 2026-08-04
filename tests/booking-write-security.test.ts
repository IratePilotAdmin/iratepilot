import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202608020005_secure_booking_creation.sql", import.meta.url),
  "utf8",
);
const route = readFileSync(new URL("../app/api/bookings/route.ts", import.meta.url), "utf8");

describe("booking write authorization", () => {
  it("removes direct authenticated booking inserts", () => {
    expect(migration).toContain('drop policy if exists "Customers can create own pending bookings"');
  });

  it("keeps verified booking creation on the server-only client", () => {
    expect(route).toContain('import { createAdminClient } from "@/lib/supabase/admin"');
    expect(route).toContain('admin.from("bookings").insert');
    expect(route).not.toContain('supabase.from("bookings").insert');
  });
});
