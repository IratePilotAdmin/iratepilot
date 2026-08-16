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
const inventoryGuardMigration = readFileSync(
  "supabase/migrations/202608150057_hotel_manager_inventory_guard.sql",
  "utf8",
);
const inventoryStayDateGuardMigration = readFileSync(
  "supabase/migrations/202608150058_hotel_manager_inventory_stay_date_guard.sql",
  "utf8",
);
const consentMigration = readFileSync(
  "supabase/migrations/202608150059_legacy_hotel_manager_consent.sql",
  "utf8",
);
const publicationGuardMigration = readFileSync(
  "supabase/migrations/202608150060_delegated_property_publication_guard.sql",
  "utf8",
);
const ownerDeleteMigration = readFileSync(
  "supabase/migrations/202608150061_partner_owner_delete_policies.sql",
  "utf8",
);
const resolver = readFileSync("lib/partner/hotel-access.ts", "utf8");
const onboardingModel = readFileSync("lib/partner/onboarding.ts", "utf8");
const propertyRoute = readFileSync("app/api/partner/properties/route.ts", "utf8");
const propertyEditRoute = readFileSync("app/api/partner/properties/[id]/route.ts", "utf8");
const ratesRoute = readFileSync("app/api/partner/rates/route.ts", "utf8");
const onboardingRoute = readFileSync("app/api/partner/onboarding/route.ts", "utf8");
const connectRoute = readFileSync("app/api/partner/connect/onboarding/route.ts", "utf8");
const invitationsRoute = readFileSync("app/api/partner/team/invitations/route.ts", "utf8");
const invitationEmail = readFileSync("lib/email/partner-team-invitation.ts", "utf8");
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

  it("honors requested hotel access while retaining pending ownership as a selectable option", () => {
    expect(onboardingRoute).toContain('.select("id,business_name,status")');
    expect(onboardingRoute).toContain("pendingOwnerAccess");
    expect(resolver).toContain("requestedPartnerId === pendingOwnerAccess?.partnerId");
    expect(resolver).toContain("resolved.options.filter");
    expect(onboardingRoute).toContain("mergePendingOwnerHotelAccess(resolved, pendingOwnerAccess, requestedPartnerId)");
    expect(onboardingRoute.indexOf("resolvePartnerHotelAccess(auth, requestedPartnerId)"))
      .toBeLessThan(onboardingRoute.indexOf("mergePendingOwnerHotelAccess(resolved, pendingOwnerAccess, requestedPartnerId)"));
  });

  it("requires explicit organization selection when a manager has multiple assignments", () => {
    for (const component of [properties, rates, onboarding]) {
      expect(component).toContain("<HotelAccessSelector");
      expect(component).toContain("selectedPartnerId");
      expect(component).toContain("partnerId=");
    }
  });

  it("prevents delegated managers from submitting active-property edits", () => {
    expect(properties).toContain('selectedAccess.role !== "owner"');
    expect(properties).toContain("delegatedManager && selectedProperty?.active");
    expect(properties).toContain("disabled={delegatedManager && property.active}");
    expect(properties).toContain("Published (owner or admin only)");
    expect(properties).toContain("delegatedManager && selectedProperty.active");
  });

  it("ignores responses from superseded organization requests", () => {
    for (const component of [properties, rates, onboarding]) {
      expect(component).toContain("const loadRequestId = useRef(0)");
      expect(component).toContain("const requestId = ++loadRequestId.current");
      expect(component).toContain("if (requestId !== loadRequestId.current) return");
      expect(component).toContain("loadRequestId.current += 1");
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

  it("enforces delegated property fields and room and inventory key immutability in the database", () => {
    expect(writeGuardMigration).toContain("enforce_delegated_hotel_manager_property_fields");
    expect(writeGuardMigration).toContain("to_jsonb(new) - 'description' - 'image_url' - 'amenities' - 'active'");
    expect(writeGuardMigration).toContain("partners.owner_id = auth.uid()");
    expect(writeGuardMigration).toContain("before update on public.properties");
    expect(writeGuardMigration).toContain("new.property_id is distinct from old.property_id");
    expect(writeGuardMigration).toContain("Hotel managers cannot transfer rooms between properties");
    expect(writeGuardMigration).toContain("before update of property_id on public.rooms");
    expect(writeGuardMigration).not.toContain("live_enabled = true");
    expect(inventoryGuardMigration).toContain("enforce_hotel_manager_inventory_room_immutability");
    expect(inventoryGuardMigration).toContain("new.room_id is distinct from old.room_id");
    expect(inventoryGuardMigration).toContain("Hotel managers cannot transfer inventory between rooms");
    expect(inventoryGuardMigration).toContain("before update of room_id on public.inventory");
    expect(inventoryGuardMigration).not.toContain("live_enabled = true");
    expect(inventoryStayDateGuardMigration).toContain("enforce_hotel_manager_inventory_room_immutability");
    expect(inventoryStayDateGuardMigration).toContain("new.room_id is distinct from old.room_id");
    expect(inventoryStayDateGuardMigration).toContain("new.stay_date is distinct from old.stay_date");
    expect(inventoryStayDateGuardMigration).toContain("Hotel managers cannot change inventory room or stay date");
    expect(inventoryStayDateGuardMigration).toContain("before update of room_id, stay_date on public.inventory");
    expect(inventoryStayDateGuardMigration).not.toContain("live_enabled = true");
    expect(publicationGuardMigration).toContain("if old.active then");
    expect(publicationGuardMigration).toContain("new.active is distinct from old.active");
    expect(publicationGuardMigration).toContain("Hotel managers cannot change property publication state");
    expect(publicationGuardMigration).toContain("to_jsonb(new) - 'description' - 'image_url' - 'amenities'");
    expect(propertyEditRoute).toContain('.select("id,active")');
    expect(propertyEditRoute).toContain('resolved.access.role !== "owner"');
    expect(propertyEditRoute).toContain("delegatedManager && property.active");
    expect(propertyEditRoute).toContain("...(delegatedManager ? {} : { active: false })");
  });

  it("restores room and inventory deletion only for approved partner owners", () => {
    expect(ownerDeleteMigration).toContain('create policy "Partner owners delete own rooms"');
    expect(ownerDeleteMigration).toContain('create policy "Partner owners delete own inventory"');
    expect(ownerDeleteMigration.match(/for delete to authenticated/g)).toHaveLength(2);
    expect(ownerDeleteMigration.match(/partners\.owner_id = auth\.uid\(\)/g)).toHaveLength(2);
    expect(ownerDeleteMigration.match(/partners\.status = 'approved'/g)).toHaveLength(2);
    expect(ownerDeleteMigration).not.toContain("Hotel managers delete");
    expect(ownerDeleteMigration).not.toContain("can_manage_partner_hotels");
  });

  it("returns a hotel-only onboarding checklist to delegated managers", () => {
    expect(onboardingRoute).toContain("buildPartnerOnboarding(partner as OnboardingPartner, prepared, accessRole)");
    expect(onboardingModel).toContain('accessRole === "owner"');
    expect(onboardingModel).toContain("hotelSteps");
    expect(onboarding).toContain("data.software ?");
  });

  it("revokes hotel and integration capabilities together", () => {
    expect(migration).toContain("enforce_disabled_team_member_capabilities");
    expect(migration).toContain("new.can_manage_integrations := false");
    expect(migration).toContain("new.can_manage_hotels := false");
    expect(migration).toContain("can_manage_hotels = false");
    expect(migration).toContain("can_manage_hotels = true");
  });

  it("requires a newly disclosed invitation before legacy managers gain hotel access", () => {
    expect(consentMigration).toContain(
      "add column if not exists can_manage_hotels boolean not null default false",
    );
    expect(consentMigration).toContain("set can_manage_hotels = false");
    expect(consentMigration).toContain("v_invitation.can_manage_hotels");
    expect(consentMigration).toContain("can_manage_hotels = excluded.can_manage_hotels");
    expect(invitationsRoute).toContain("can_manage_hotels: true");
    expect(invitationsRoute).toContain("canManageHotels: invitation.can_manage_hotels");
    expect(invitationEmail).toContain("draft property content, rooms, rates, future inventory");
    expect(invitationEmail).toContain("does not include publication, billing, payouts, invitations");
    expect(invitationEmail).not.toContain("integration-only access");
  });

  it("keeps owner-only commercial and team controls unchanged", () => {
    expect(connectRoute).toContain('.eq("owner_id", auth.user.id)');
    expect(invitationsRoute).toContain("Only the approved partner owner can invite");
    expect(migration).not.toContain("stripe_connect_account_id");
    expect(migration).not.toContain("live_enabled = true");
    expect(migration).not.toContain("properties.active = true");
  });

  it("discloses and routes accepted managers by their invitation's actual scope", () => {
    expect(acceptance).toContain("scope.canManageHotels");
    expect(acceptance).toContain("inactive-property content, room, rate, future-inventory, and integration access");
    expect(acceptance).toContain("integration access only");
    expect(acceptance).toContain('canManageHotels ? "/partner/properties" : "/partner/integrations"');
  });
});
