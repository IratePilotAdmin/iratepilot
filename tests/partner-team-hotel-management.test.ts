import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/202608150054_partner_team_hotel_management.sql",
  "utf8",
);
const selectionMigration = readFileSync(
  "supabase/migrations/202608150055_partner_hotel_access_selection.sql",
  "utf8",
);
const writeGuardMigration = readFileSync(
  "supabase/migrations/202608150056_hotel_manager_write_guards.sql",
  "utf8",
);
const resolver = readFileSync("lib/partner/hotel-access.ts", "utf8");
const propertyRoute = readFileSync("app/api/partner/properties/route.ts", "utf8");
const propertyEditRoute = readFileSync("app/api/partner/properties/[id]/route.ts", "utf8");
const ratesRoute = readFileSync("app/api/partner/rates/route.ts", "utf8");
const onboardingRoute = readFileSync("app/api/partner/onboarding/route.ts", "utf8");
const connectRoute = readFileSync("app/api/partner/connect/onboarding/route.ts", "utf8");
const invitationsRoute = readFileSync("app/api/partner/team/invitations/route.ts", "utf8");
const publicationRoute = readFileSync("app/api/admin/properties/[id]/route.ts", "utf8");
const acceptance = readFileSync("components/forms/partner-team-invitation-acceptance.tsx", "utf8");
const properties = readFileSync("components/dashboard/partner-properties.tsx", "utf8");
const rates = readFileSync("components/dashboard/rates-inventory-manager.tsx", "utf8");
const onboarding = readFileSync("components/partner/partner-onboarding.tsx", "utf8");

describe("partner-team hotel management", () => {
  it("grants only active approved hotel-team roles and returns every accessible partner", () => {
    expect(migration).toContain("can_manage_hotels boolean not null default false");
    expect(migration).toContain("'general_manager', 'revenue_manager', 'sales_manager'");
    expect(migration).toContain("partner_team_members.status = 'active'");
    expect(migration).toContain("partner_team_members.can_manage_hotels");
    expect(migration).toContain("partners.status = 'approved'");
    expect(migration).toContain("profiles.role = 'partner'");
    expect(selectionMigration).toContain("drop function if exists public.resolve_partner_hotel_access()");
    expect(selectionMigration).toContain("partner_name text");
    expect(selectionMigration).toContain("partition by candidate.partner_id");
    expect(selectionMigration).not.toContain("limit 1");
    expect(resolver).toContain('result.error?.code === "42883"');
    expect(resolver).toContain('role: "owner"');
    expect(resolver).toContain("options.length === 1");
    expect(resolver).toContain("selectionRequired");
  });

  it("uses the shared resolver across property, room, inventory, and onboarding APIs", () => {
    for (const route of [propertyRoute, propertyEditRoute, ratesRoute, onboardingRoute]) {
      expect(route).toContain("resolvePartnerHotelAccess(auth, requestedPartnerId)");
      expect(route).toContain(".access.partnerId");
    }
  });

  it("preserves pending-owner onboarding before delegated access is required", () => {
    expect(onboardingRoute).toContain('.select("id,status")');
    expect(onboardingRoute).toContain('owner.data.status !== "approved"');
    expect(onboardingRoute).toContain("partnerId = owner.data.id");
    expect(onboardingRoute.indexOf('owner.data.status !== "approved"'))
      .toBeLessThan(onboardingRoute.indexOf("resolvePartnerHotelAccess(auth, requestedPartnerId)"));
  });

  it("requires explicit organization selection when a manager has multiple assignments", () => {
    for (const component of [properties, rates, onboarding]) {
      expect(component).toContain("<HotelAccessSelector");
      expect(component).toContain("selectedPartnerId");
      expect(component).toContain("partnerId=");
    }
  });

  it("preserves inactive property reads for integration-only managers", () => {
    expect(selectionMigration).toContain('create policy "Partner integration managers view properties"');
    expect(selectionMigration).toContain("public.can_manage_partner_integrations(partner_id)");
  });

  it("allows draft management without publication, deletion, or partner transfer", () => {
    expect(migration).toContain('create policy "Hotel managers update partner properties"');
    expect(migration).toContain("active = false");
    expect(migration).toContain('create policy "Hotel managers create partner rooms"');
    expect(migration).toContain('create policy "Hotel managers update partner rooms"');
    expect(migration).toContain('create policy "Hotel managers create partner inventory"');
    expect(migration).toContain('create policy "Hotel managers update partner inventory"');
    expect(migration).not.toContain("Hotel managers delete");
    expect(migration).toContain("inventory.stay_date >= current_date");
    expect(migration).toContain("Hotel managers cannot transfer properties between partners");
    expect(publicationRoute).toContain('requireRole(["admin"])');
  });

  it("enforces delegated property fields and room assignment immutability in the database", () => {
    expect(writeGuardMigration).toContain("enforce_delegated_hotel_manager_property_fields");
    expect(writeGuardMigration).toContain("to_jsonb(new) - 'description' - 'image_url' - 'amenities' - 'active'");
    expect(writeGuardMigration).toContain("partners.owner_id = auth.uid()");
    expect(writeGuardMigration).toContain("before update on public.properties");
    expect(writeGuardMigration).toContain("new.property_id is distinct from old.property_id");
    expect(writeGuardMigration).toContain("Hotel managers cannot transfer rooms between properties");
    expect(writeGuardMigration).toContain("before update of property_id on public.rooms");
    expect(writeGuardMigration).not.toContain("live_enabled = true");
  });

  it("revokes hotel and integration capabilities together", () => {
    expect(migration).toContain("enforce_disabled_team_member_capabilities");
    expect(migration).toContain("new.can_manage_integrations := false");
    expect(migration).toContain("new.can_manage_hotels := false");
    expect(migration).toContain("can_manage_hotels = false");
    expect(migration).toContain("can_manage_hotels = true");
  });

  it("keeps owner-only commercial and team controls unchanged", () => {
    expect(connectRoute).toContain('.eq("owner_id", auth.user.id)');
    expect(invitationsRoute).toContain("Only the approved partner owner can invite");
    expect(migration).not.toContain("stripe_connect_account_id");
    expect(migration).not.toContain("live_enabled = true");
    expect(migration).not.toContain("properties.active = true");
  });

  it("sends accepted managers to scoped hotel operations", () => {
    expect(acceptance).toContain("draft-property, room, inventory, and integration access");
    expect(acceptance).toContain('href="/partner/properties"');
    expect(acceptance).not.toContain("integration-only access");
  });
});
