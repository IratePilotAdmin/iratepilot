import type { requireRole } from "@/lib/auth/require-role";

export type PartnerIntegrationRole =
  | "owner"
  | "general_manager"
  | "revenue_manager"
  | "sales_manager";

export type PartnerIntegrationAccess = {
  partnerId: string;
  role: PartnerIntegrationRole;
};

export async function resolvePartnerIntegrationAccess(
  auth: Awaited<ReturnType<typeof requireRole>>,
): Promise<{ access: PartnerIntegrationAccess | null; migrationRequired: boolean }> {
  if ("error" in auth) return { access: null, migrationRequired: false };
  const result = await auth.supabase.rpc("resolve_partner_integration_access").maybeSingle();
  if (result.error?.code === "42883") return { access: null, migrationRequired: true };
  if (result.error) throw result.error;
  if (!result.data) return { access: null, migrationRequired: false };

  const row = result.data as { resolved_partner_id?: unknown; access_role?: unknown };
  if (
    typeof row.resolved_partner_id !== "string"
    || !["owner", "general_manager", "revenue_manager", "sales_manager"].includes(
      String(row.access_role),
    )
  ) return { access: null, migrationRequired: false };

  return {
    access: {
      partnerId: row.resolved_partner_id,
      role: row.access_role as PartnerIntegrationRole,
    },
    migrationRequired: false,
  };
}
