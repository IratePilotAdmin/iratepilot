import type { requireRole } from "@/lib/auth/require-role";

export type PartnerHotelRole =
  | "owner"
  | "general_manager"
  | "revenue_manager"
  | "sales_manager";

export type PartnerHotelAccess = {
  partnerId: string;
  role: PartnerHotelRole;
};

const hotelRoles: PartnerHotelRole[] = [
  "owner",
  "general_manager",
  "revenue_manager",
  "sales_manager",
];

export async function resolvePartnerHotelAccess(
  auth: Awaited<ReturnType<typeof requireRole>>,
): Promise<{ access: PartnerHotelAccess | null; migrationRequired: boolean }> {
  if ("error" in auth) return { access: null, migrationRequired: false };

  const result = await auth.supabase.rpc("resolve_partner_hotel_access").maybeSingle();
  if (result.error?.code === "42883") {
    const owner = await auth.supabase.from("partners")
      .select("id,status")
      .eq("owner_id", auth.user.id)
      .maybeSingle();
    if (owner.error) throw owner.error;
    return {
      access: owner.data?.status === "approved"
        ? { partnerId: owner.data.id, role: "owner" }
        : null,
      migrationRequired: true,
    };
  }
  if (result.error) throw result.error;
  if (!result.data) return { access: null, migrationRequired: false };

  const row = result.data as { resolved_partner_id?: unknown; access_role?: unknown };
  if (
    typeof row.resolved_partner_id !== "string"
    || !hotelRoles.includes(String(row.access_role) as PartnerHotelRole)
  ) return { access: null, migrationRequired: false };

  return {
    access: {
      partnerId: row.resolved_partner_id,
      role: row.access_role as PartnerHotelRole,
    },
    migrationRequired: false,
  };
}
