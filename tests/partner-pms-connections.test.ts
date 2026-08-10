import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("../app/api/partner/integrations/pms/route.ts", import.meta.url), "utf8");
const component = readFileSync(new URL("../components/dashboard/partner-pms-connections.tsx", import.meta.url), "utf8");

describe("partner PMS connections", () => {
  it("requires an approved partner and verifies property ownership", () => {
    expect(route).toContain('requireRole(["partner"])');
    expect(route).toContain('status === "approved"');
    expect(route).toContain('.eq("partner_id", partner.id)');
  });

  it("never accepts credentials from the partner portal", () => {
    expect(route).not.toMatch(/clientSecret|apiKey|accessToken/);
    expect(component).toContain("Do not paste passwords, API keys, or client secrets.");
  });

  it("keeps partner declarations pending until administrator validation", () => {
    expect(route).toContain('connection_status: "credentials_pending"');
    expect(route).toContain("last_validated_at: null");
  });

  it("collects pilot authorization and non-secret hotel mappings", () => {
    for (const field of ["hotel_authorized", "room_type_mapping", "rate_plan_mapping", "tax_fee_mapping", "cancellation_policy_mapping"]) {
      expect(route).toContain(field);
    }
    expect(component).toContain("Pilot-hotel authorization and mappings");
    expect(component).toContain("hotel owner or authorized manager approved");
    expect(component).toContain("do not include payment data");
  });
});

