import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { synxisOnboardingRequestSchema } from "../lib/validation";

const route = readFileSync("app/api/partner/integrations/crs/synxis/route.ts", "utf8");
const component = readFileSync("components/dashboard/partner-synxis-onboarding.tsx", "utf8");
const migration = readFileSync("supabase/migrations/202608130045_synxis_property_onboarding_requests.sql", "utf8");

describe("partner SynXis property onboarding", () => {
  it("accepts authorized hotel, general, revenue, and sales manager requests", () => {
    for (const requesterRole of ["hotel_owner", "general_manager", "revenue_manager", "sales_manager"]) {
      expect(synxisOnboardingRequestSchema.safeParse({
        propertyId: "11111111-1111-4111-8111-111111111111",
        synxisHotelId: "HOTEL-128",
        requesterRole,
        hotelAuthorized: true,
      }).success).toBe(true);
    }
    expect(component).toContain("Revenue manager");
    expect(component).toContain("Sales manager");
  });

  it("rejects missing authorization, secrets, and unsafe Hotel IDs", () => {
    const base = {
      propertyId: "11111111-1111-4111-8111-111111111111",
      synxisHotelId: "HOTEL-128",
      requesterRole: "revenue_manager",
      hotelAuthorized: true,
    };
    expect(synxisOnboardingRequestSchema.safeParse({ ...base, hotelAuthorized: false }).success).toBe(false);
    expect(synxisOnboardingRequestSchema.safeParse({ ...base, synxisHotelId: "hotel id; secret=1" }).success).toBe(false);
    expect(route).not.toMatch(/password|apiKey|accessToken|clientSecret/);
    expect(component).toContain("Never enter passwords, API keys, tokens, or SOAP credentials.");
  });

  it("requires an approved partner, verifies property ownership, and stays pending", () => {
    expect(route).toContain('requireRole(["partner"])');
    expect(route).toContain('status === "approved"');
    expect(route).toContain('.eq("partner_id", partner.id)');
    expect(route).toContain('connection_status: "vendor_approval_pending"');
    expect(route).toContain("last_validated_at: null");
  });

  it("enforces property ownership and pending-only partner writes in PostgreSQL", () => {
    expect(migration).toContain("property_synxis_onboarding_requests");
    expect(migration).toContain("partners.owner_id = auth.uid()");
    expect(migration).toContain("partners.status = 'approved'");
    expect(migration).toContain("connection_status = 'vendor_approval_pending'");
    expect(migration).toContain("requested_by = auth.uid()");
    expect(migration).toContain("revoke all on table public.property_synxis_onboarding_requests from anon");
    expect(migration).toContain("Credentials are prohibited");
  });

  it("keeps CRS onboarding visibly separate from PMS configuration", () => {
    const page = readFileSync("app/partner/integrations/page.tsx", "utf8");
    expect(page).toContain("<PartnerPmsConnections />");
    expect(page).toContain("<PartnerSynxisOnboarding />");
    expect(component).toContain("This CRS request is separate from the hotel PMS connection");
    expect(component).toContain("does not connect the property or enable SynXis traffic");
  });
});
