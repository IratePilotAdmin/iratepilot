export type PartnerOverviewBooking = {
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

export type PartnerOverviewFinancial = {
  booking_id: string;
  gross_room_revenue: number | string;
  partner_net: number | string;
  status: string;
  created_at: string;
};

type Counts = { properties: number; publishedProperties: number; pendingBookings: number; confirmedBookings: number };

export function buildPartnerOverview(
  counts: Counts,
  bookings: PartnerOverviewBooking[],
  financials: PartnerOverviewFinancial[],
  now = new Date(),
) {
  const activeFinancials = financials.filter((row) => row.status !== "void");
  const grossRoomRevenue = activeFinancials.reduce((total, row) => total + Number(row.gross_room_revenue), 0);
  const partnerNet = activeFinancials.reduce((total, row) => total + Number(row.partner_net), 0);
  const financialByBooking = new Map(activeFinancials.map((row) => [row.booking_id, row]));
  const monthKeys = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - index), 1));
    return {
      key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date),
      value: 0,
    };
  });
  const monthByKey = new Map(monthKeys.map((month) => [month.key, month]));
  for (const row of activeFinancials) {
    const month = monthByKey.get(row.created_at.slice(0, 7));
    if (month) month.value += Number(row.partner_net);
  }

  return {
    summary: { ...counts, grossRoomRevenue, partnerNet },
    monthlyNet: monthKeys,
    recentBookings: bookings.map((booking) => ({
      ...booking,
      partner_net: Number(financialByBooking.get(booking.id)?.partner_net || 0),
    })),
  };
}
