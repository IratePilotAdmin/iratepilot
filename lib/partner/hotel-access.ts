import type { requireRole } from "@/lib/auth/require-role";

export type PartnerHotelRole =
  | "owner"
  | "general_manager"
  | "revenue_manager"
  | "sales_manager";

export type PartnerHotelAccess = {
  partnerId: string;
  partnerName: string;
  role: PartnerHotelRole;
};

export type PartnerHotelAccessResult = {
  access: PartnerHotelAccess | null;
  options: PartnerHotelAccess[];
  selectionRequired: boolean;
  migrationRequired: boolean;
};

export function mergePendingOwnerHotelAccess(
  resolved: PartnerHotelAccessResult,
  pendingOwnerAccess: PartnerHotelAccess | null,
  requestedPartnerId?: string | null,
): PartnerHotelAccessResult {
  const options = pendingOwnerAccess
    ? [pendingOwnerAccess, ...resolved.options.filter((option) => option.partnerId !== pendingOwnerAccess.partnerId)]
    : resolved.options;
  const access = requestedPartnerId === pendingOwnerAccess?.partnerId
    ? pendingOwnerAccess
    : resolved.access ?? (!requestedPartnerId && options.length === 1 ? options[0] : null);

  return {
    ...resolved,
    access,
    options,
    selectionRequired: !requestedPartnerId && options.length > 1,
  };
}

const hotelRoles: PartnerHotelRole[] = [
  "owner",
  "general_manager",
  "revenue_manager",
  "sales_manager",
];

export async function resolvePartnerHotelAccess(
  auth: Awaited<ReturnType<typeof requireRole>>,
  requestedPartnerId?: string | null,
): Promise<PartnerHotelAccessResult> {
  const empty = {
    access: null,
    options: [],
    selectionRequired: false,
    migrationRequired: false,
  } satisfies PartnerHotelAccessResult;
  if ("error" in auth) return empty;

  const result = await auth.supabase.rpc("resolve_partner_hotel_access");
  if (result.error?.code === "42883") {
    const owner = await auth.supabase.from("partners")
      .select("id,business_name,status")
      .eq("owner_id", auth.user.id)
      .maybeSingle();
    if (owner.error) throw owner.error;
    const access = owner.data?.status === "approved"
      ? {
          partnerId: owner.data.id,
          partnerName: owner.data.business_name,
          role: "owner" as const,
        }
      : null;
    return {
      access,
      options: access ? [access] : [],
      selectionRequired: false,
      migrationRequired: true,
    };
  }
  if (result.error) throw result.error;
  const rows = Array.isArray(result.data) ? result.data : [];
  const options = rows.flatMap((item) => {
    const row = item as {
      resolved_partner_id?: unknown;
      partner_name?: unknown;
      access_role?: unknown;
    };
    if (
      typeof row.resolved_partner_id !== "string"
      || typeof row.partner_name !== "string"
      || !hotelRoles.includes(String(row.access_role) as PartnerHotelRole)
    ) return [];
    return [{
      partnerId: row.resolved_partner_id,
      partnerName: row.partner_name,
      role: row.access_role as PartnerHotelRole,
    }];
  });

  if (rows.length > 0 && options.length !== rows.length) {
    return { ...empty, migrationRequired: true };
  }

  const access = requestedPartnerId
    ? options.find((option) => option.partnerId === requestedPartnerId) ?? null
    : options.length === 1 ? options[0] : null;

  return {
    access,
    options,
    selectionRequired: !requestedPartnerId && options.length > 1,
    migrationRequired: false,
  };
}
