import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL(
  "../app/api/admin/integrations/inventory/expedia-rapid/readiness/route.ts",
  import.meta.url,
), "utf8");

describe("Expedia Rapid readiness evidence access", () => {
  it("uses the authenticated admin client for payment authorization evidence", () => {
    expect(route).toContain('auth.supabase.from("hotel_payment_launch_authorizations")');
    expect(route).toContain('auth.supabase.from("hotel_payment_launch_authorization_revocations")');
    expect(route).not.toContain('admin.from("hotel_payment_launch_authorizations")');
    expect(route).not.toContain('admin.from("hotel_payment_launch_authorization_revocations")');
  });
});
