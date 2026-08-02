import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202608020011_enforce_partner_review_transitions.sql", import.meta.url),
  "utf8",
);
const reviewRoute = readFileSync(
  new URL("../app/api/admin/partner-applications/[id]/route.ts", import.meta.url),
  "utf8",
);
const listRoute = readFileSync(
  new URL("../app/api/admin/partner-applications/route.ts", import.meta.url),
  "utf8",
);

describe("partner application review transitions", () => {
  it("replaces broad admin table management with select-only review access", () => {
    expect(migration).toContain('drop policy if exists "Admins can manage partner applications"');
    expect(migration).toContain('create policy "Admins can view partner applications"');
    expect(migration).toContain("for select");
    expect(migration).not.toContain("for all");
  });

  it("keeps decisions on the secured provisioning function and listing on select", () => {
    expect(reviewRoute).toContain("auth.supabase.rpc(");
    expect(reviewRoute).toContain('"review_partner_application"');
    expect(reviewRoute).not.toContain('.from("partner_applications").update');
    expect(listRoute).toContain('.from("partner_applications")');
    expect(listRoute).toContain('.select("id,property_name,contact_name,email,property_type,status,created_at")');
  });
});
