import { describe, expect, it, vi } from "vitest";
import { resolvePartnerIntegrationAccess } from "../lib/partner/integration-access";

function authFor(result: { data?: unknown; error?: { code?: string } | null }) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  const rpc = vi.fn().mockReturnValue({ maybeSingle });
  return { auth: { supabase: { rpc } } as never, rpc, maybeSingle };
}

describe("partner integration access resolver", () => {
  it.each([
    ["owner", "owner"],
    ["general_manager", "general_manager"],
    ["revenue_manager", "revenue_manager"],
    ["sales_manager", "sales_manager"],
  ] as const)("resolves only the scoped partner and %s role", async (role, accessRole) => {
    const { auth, rpc } = authFor({
      data: { resolved_partner_id: "partner-123", access_role: accessRole },
    });

    await expect(resolvePartnerIntegrationAccess(auth)).resolves.toEqual({
      access: { partnerId: "partner-123", role },
      migrationRequired: false,
    });
    expect(rpc).toHaveBeenCalledWith("resolve_partner_integration_access");
  });

  it("denies absent, malformed, and unsupported roles without widening access", async () => {
    for (const data of [
      null,
      { resolved_partner_id: 5, access_role: "owner" },
      { resolved_partner_id: "partner-123", access_role: "admin" },
    ]) {
      const { auth } = authFor({ data });
      await expect(resolvePartnerIntegrationAccess(auth)).resolves.toEqual({
        access: null,
        migrationRequired: false,
      });
    }
  });

  it("reports a missing migration explicitly and propagates unrelated database errors", async () => {
    const missingMigration = authFor({ error: { code: "42883" } });
    await expect(resolvePartnerIntegrationAccess(missingMigration.auth)).resolves.toEqual({
      access: null,
      migrationRequired: true,
    });

    const unexpected = authFor({ error: { code: "08006" } });
    await expect(resolvePartnerIntegrationAccess(unexpected.auth)).rejects.toEqual({ code: "08006" });
  });
});
