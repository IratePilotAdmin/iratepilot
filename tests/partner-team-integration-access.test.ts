import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/202608130046_partner_team_integration_access.sql", "utf8");
const resolver = readFileSync("lib/partner/integration-access.ts", "utf8");
const route = readFileSync("app/api/partner/integrations/crs/synxis/route.ts", "utf8");
const component = readFileSync("components/dashboard/partner-synxis-onboarding.tsx", "utf8");

describe("partner-team integration RBAC", () => {
  it("supports only scoped hotel management roles", () => {
    expect(migration).toContain("'general_manager', 'revenue_manager', 'sales_manager'");
    expect(migration).toContain("can_manage_integrations boolean not null default false");
    expect(migration).toContain("partner_team_members.status = 'active'");
    expect(migration).toContain("profiles.role = 'partner'");
  });

  it("keeps membership provisioning admin-controlled", () => {
    expect(migration).toContain('create policy "Admins manage partner team access"');
    expect(migration).not.toContain("Partner owners manage team access");
    expect(migration).toContain("Phase 46 adds no invitation or automatic activation path");
  });

  it("resolves owners or active integration managers through a bounded database function", () => {
    expect(migration).toContain("resolve_partner_integration_access()");
    expect(migration).toContain("'owner'::text as access_role");
    expect(migration).toContain("order by candidate.priority, candidate.partner_id");
    expect(migration).toContain("limit 1");
    expect(resolver).toContain('result.error?.code === "42883"');
  });

  it("enforces the permission in RLS and the partner API", () => {
    expect(migration).toContain("can_manage_partner_integrations(properties.partner_id)");
    expect(migration).toContain('create policy "Partner integration managers view properties"');
    expect(migration).toContain("requested_by = auth.uid()");
    expect(route).toContain("Approved partner integration access is required.");
    expect(route).toContain("accessRole: access.role");
    expect(route).toContain('.in("property_id", propertyIds)');
  });

  it("shows delegated access and prevents role switching in the UI", () => {
    expect(component).toContain("Signed-in integration role:");
    expect(component).toContain('accessRole === "owner"');
    expect(component).toContain("value === accessRole");
    expect(component).not.toContain("Enable live traffic");
  });
});
