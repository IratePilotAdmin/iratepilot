type PartnerOwner = { owner_id?: string | null; status?: string | null };

export function isApprovedRevenueOwner(
  partners: PartnerOwner | PartnerOwner[] | null | undefined,
  userId: string,
): boolean {
  const partner = Array.isArray(partners) ? partners[0] : partners;
  return partner?.owner_id === userId && partner?.status === "approved";
}
