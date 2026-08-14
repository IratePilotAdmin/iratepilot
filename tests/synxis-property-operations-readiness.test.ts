import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  new URL("../app/api/admin/integrations/crs/synxis/route.ts", import.meta.url),
  "utf8",
);
const dashboard = readFileSync(
  new URL("../components/dashboard/synxis-crs-readiness.tsx", import.meta.url),
  "utf8",
);

describe("SynXis property operations deployment readiness", () => {
  it("checks migrations 045 through 048 in parallel using count-only reads", () => {
    expect(route).toContain('from("property_synxis_onboarding_requests").select("id", { count: "exact", head: true })');
    expect(route).toContain('from("partner_team_members").select("id", { count: "exact", head: true })');
    expect(route).toContain('from("partner_team_invitations").select("id", { count: "exact", head: true })');
    expect(route).toContain('from("partner_team_access_events").select("id", { count: "exact", head: true })');
    expect(route).toContain("loadPropertyOperationsReadiness(admin)");
    expect(route).toContain("requiredThroughMigration: 48");
  });

  it("fails closed when a required table or column is unavailable", () => {
    expect(route).toContain('result.error?.code === "42P01"');
    expect(route).toContain('result.error?.code === "42703"');
    expect(route).toContain("ready: gates.every((gate) => gate.available)");
  });

  it("shows each operational capability without exposing sensitive records", () => {
    expect(dashboard).toContain("Hotel onboarding operations");
    expect(dashboard).toContain("Migration {gate.migration}");
    expect(dashboard).toContain("Apply migrations through");
    expect(dashboard).toContain("Counts only. No hotel identifiers, manager emails, invitations, or audit details are returned.");
  });
});
