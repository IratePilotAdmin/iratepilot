import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bootstrap = readFileSync("supabase/schema.sql", "utf8");
const verification = readFileSync("supabase/verify_schema.sql", "utf8");
const mirroredMigrations = [
  "202608130045_synxis_property_onboarding_requests.sql",
  "202608130046_partner_team_integration_access.sql",
  "202608130047_partner_team_invitations.sql",
  "202608130048_partner_team_access_lifecycle.sql",
  "202608130049_fix_partner_team_invitation_acceptance.sql",
  "202608150054_partner_team_hotel_management.sql",
  "202608150055_partner_hotel_access_selection.sql",
  "202608150056_hotel_manager_write_guards.sql",
  "202608150057_hotel_manager_inventory_guard.sql",
];

describe("Supabase bootstrap parity", () => {
  it("mirrors the complete partner-team hotel-management dependency chain through migration 057", () => {
    let previousIndex = -1;
    for (const name of mirroredMigrations) {
      const marker = `-- Mirrored from migrations/${name}.`;
      const migration = readFileSync(`supabase/migrations/${name}`, "utf8").trimEnd();
      const markerIndex = bootstrap.indexOf(marker);
      expect(markerIndex).toBeGreaterThan(previousIndex);
      expect(bootstrap).toContain(`${marker}\n${migration}`);
      previousIndex = markerIndex;
    }
  });

  it("contains the final delegated hotel resolver, policies, and write guards", () => {
    const selectionStart = bootstrap.indexOf(
      "-- Mirrored from migrations/202608150055_partner_hotel_access_selection.sql.",
    );
    const writeGuardStart = bootstrap.indexOf(
      "-- Mirrored from migrations/202608150056_hotel_manager_write_guards.sql.",
    );
    const finalSelection = bootstrap.slice(selectionStart, writeGuardStart);

    expect(bootstrap).toContain("can_manage_hotels boolean not null default false");
    expect(finalSelection).toContain("partner_name text");
    expect(finalSelection).toContain("partition by candidate.partner_id");
    expect(finalSelection).not.toContain("limit 1");
    expect(finalSelection).toContain('create policy "Partner integration managers view properties"');
    expect(bootstrap).toContain("enforce_delegated_hotel_manager_property_fields");
    expect(bootstrap).toContain("enforce_hotel_manager_room_property_immutability");
    expect(bootstrap).toContain("enforce_hotel_manager_inventory_room_immutability");
  });

  it("verifies the final partner-team tables, policies, resolver, and write guards", () => {
    for (const expected of [
      "partner_team_members",
      "partner_team_invitations",
      "partner_team_access_events",
      "Hotel managers create partner inventory",
      "Hotel managers update partner inventory",
      "resolve_partner_hotel_access()",
      "enforce_delegated_hotel_manager_property_fields",
      "enforce_hotel_manager_room_property_immutability",
      "enforce_hotel_manager_inventory_room_immutability",
    ]) {
      expect(verification).toContain(expected);
    }
    expect(verification).not.toContain("Partners can manage own inventory");
  });
});
