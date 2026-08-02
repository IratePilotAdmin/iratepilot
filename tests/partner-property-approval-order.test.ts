import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const reviewRoute = readFileSync(
  new URL("../app/api/admin/properties/[id]/route.ts", import.meta.url),
  "utf8",
);
const listRoute = readFileSync(
  new URL("../app/api/admin/properties/route.ts", import.meta.url),
  "utf8",
);
const reviewUi = readFileSync(
  new URL("../components/dashboard/admin-properties.tsx", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../supabase/migrations/202608020019_enforce_partner_before_property_approval.sql", import.meta.url),
  "utf8",
);
const schema = readFileSync(
  new URL("../supabase/schema.sql", import.meta.url),
  "utf8",
);

describe("partner-before-property approval order", () => {
  it("rejects property publication until the partner is approved", () => {
    expect(reviewRoute).toContain("partners!inner(status)");
    expect(reviewRoute).toContain('partner.status !== "approved"');
    expect(reviewRoute).toContain('error?.code === "23514"');
    expect(reviewRoute.indexOf('partner.status !== "approved"'))
      .toBeLessThan(reviewRoute.indexOf('.update({ active: parsed.data.active })'));
  });

  it("shows the partner state and disables premature publication in the admin queue", () => {
    expect(listRoute).toContain("partners(business_name,status)");
    expect(reviewUi).toContain('property.partners?.status === "approved"');
    expect(reviewUi).toContain("Partner pending");
  });

  it("repairs and prevents invalid active-property states in the database", () => {
    expect(migration).toContain("update public.properties");
    expect(migration).toContain("set active = false");
    expect(migration).toContain("function public.enforce_partner_before_property_activation");
    expect(migration).toContain("before insert or update of active, partner_id");
    expect(schema).toContain("trigger enforce_partner_before_property_activation");
  });
});
