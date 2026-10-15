import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pmsConnectionSchema } from "../lib/validation";

const route = readFileSync(new URL("../app/api/partner/integrations/pms/route.ts", import.meta.url), "utf8");
const component = readFileSync(new URL("../components/dashboard/partner-pms-connections.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/202610150167_pms_vendor_account_reference.sql", import.meta.url), "utf8");
const enforcementMigration = readFileSync(new URL("../supabase/migrations/202610150168_require_clock_subscription_id.sql", import.meta.url), "utf8");

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

  it("rejects placeholder mapping descriptions while allowing pending blank mappings", () => {
    const declaration = {
      propertyId: "11111111-1111-4111-8111-111111111111",
      providerId: "hotelkey" as const,
      externalPropertyCode: "128",
      vendorAccountReference: "hotelkey-account-128",
      hotelAuthorized: true,
      roomTypeMapping: "",
      ratePlanMapping: "",
      taxFeeMapping: "",
      cancellationPolicyMapping: "",
    };

    expect(pmsConnectionSchema.safeParse(declaration).success).toBe(true);
    expect(pmsConnectionSchema.safeParse({
      ...declaration,
      taxFeeMapping: "HotelKey’s applicable codes",
    }).success).toBe(false);
    expect(pmsConnectionSchema.safeParse({
      ...declaration,
      cancellationPolicyMapping: "your policy name mapped to its HotelKey code",
    }).success).toBe(false);
  });

  it("requires Clock's non-secret Subscription ID without conflating it with the property code", () => {
    const declaration = {
      propertyId: "11111111-1111-4111-8111-111111111111",
      providerId: "clock-pms-plus" as const,
      externalPropertyCode: "hotel-128",
      vendorAccountReference: "subscription-456",
      hotelAuthorized: true,
      roomTypeMapping: "",
      ratePlanMapping: "",
      taxFeeMapping: "",
      cancellationPolicyMapping: "",
    };

    expect(pmsConnectionSchema.safeParse(declaration).success).toBe(true);
    expect(pmsConnectionSchema.safeParse({ ...declaration, vendorAccountReference: "" }).success).toBe(false);
    expect(pmsConnectionSchema.safeParse({ ...declaration, vendorAccountReference: "do not use spaces" }).success).toBe(false);
    expect(component).toContain("Clock PMS+ Subscription ID");
    expect(component).toContain("separate from the hotel/property code");
    expect(route).toContain("vendor_account_reference");
  });

  it("adds a nullable, constrained vendor reference without changing row access", () => {
    expect(migration).toContain("add column if not exists vendor_account_reference text");
    expect(migration).toContain("property_pms_connections_vendor_account_reference_format");
    expect(migration).toContain("Never stores credentials");
    expect(migration).not.toMatch(/create policy|enable row level security/i);
    expect(enforcementMigration).toContain("provider_id <> 'clock-pms-plus' or vendor_account_reference is not null");
    expect(enforcementMigration).toContain("Requires a non-secret Subscription ID for Clock PMS+");
    expect(enforcementMigration).not.toMatch(/create policy|enable row level security/i);
  });
});

