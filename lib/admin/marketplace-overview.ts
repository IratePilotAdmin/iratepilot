export type AdminOverviewBooking = {
  id: string;
  confirmation_code: string;
  check_in: string;
  check_out: string;
  total: number | string;
  status: string;
  created_at: string;
  properties: { name?: string } | null;
  profiles: { full_name?: string | null } | null;
};

export type AdminOverviewFinancial = {
  gross_room_revenue: number | string;
  partner_commission: number | string;
  partner_net: number | string;
  status: string;
  created_at: string;
};

type Counts = { publishedProperties: number; pendingBookings: number; confirmedBookings: number; pendingPartners: number; openSupport: number };

export function buildAdminMarketplaceOverview(
  counts: Counts,
  recentBookings: AdminOverviewBooking[],
  financials: AdminOverviewFinancial[],
  now = new Date(),
) {
  const activeFinancials = financials.filter((row) => row.status !== "void");
  const finance = activeFinancials.reduce((totals, row) => ({
    grossRoomRevenue: totals.grossRoomRevenue + Number(row.gross_room_revenue),
    commission: totals.commission + Number(row.partner_commission),
    partnerLiability: totals.partnerLiability + Number(row.partner_net),
  }), { grossRoomRevenue: 0, commission: 0, partnerLiability: 0 });
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - index), 1));
    return {
      key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date),
      value: 0,
    };
  });
  const monthByKey = new Map(months.map((month) => [month.key, month]));
  for (const row of activeFinancials) {
    const month = monthByKey.get(row.created_at.slice(0, 7));
    if (month) month.value += Number(row.partner_commission);
  }

  return { summary: { ...counts, ...finance }, monthlyCommission: months, recentBookings };
}
