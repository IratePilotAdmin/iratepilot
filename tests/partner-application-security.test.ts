import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { partnerApplicationSchema } from "../lib/validation";

const route = readFileSync(
  new URL("../app/api/partners/apply/route.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../supabase/migrations/202608020009_secure_partner_applications.sql", import.meta.url),
  "utf8",
);

describe("partner application security", () => {
  it("removes anonymous database inserts and fixes API-created applications as pending", () => {
    expect(migration).toContain('drop policy if exists "Public can submit partner applications"');
    expect(route).toContain('import { createAdminClient } from "@/lib/supabase/admin"');
    expect(route).toContain('admin.from("partner_applications").insert');
    expect(route).toContain('status: "pending"');
    expect(route).not.toContain('createClient');
  });

  it("enforces valid statuses for new and changed rows without blocking unknown legacy data", () => {
    expect(migration).toContain("add constraint partner_applications_status_check");
    expect(migration).toContain("check (status in ('pending','approved','declined')) not valid");
  });

  it("normalizes application fields and rejects oversized input", () => {
    const parsed = partnerApplicationSchema.safeParse({
      propertyName: "  Harbor House  ",
      contactName: "  Alex Rivera  ",
      email: "  OWNER@EXAMPLE.COM  ",
      propertyType: "hotel",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toMatchObject({
      propertyName: "Harbor House",
      contactName: "Alex Rivera",
      email: "owner@example.com",
    });
    expect(partnerApplicationSchema.safeParse({
      propertyName: "x".repeat(161),
      contactName: "Alex Rivera",
      email: "owner@example.com",
      propertyType: "hotel",
    }).success).toBe(false);
  });
});
