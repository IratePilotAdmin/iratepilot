export type PartnerAnalyticsProperty = {
  id: string;
  name: string;
  active: boolean;
};

export type PartnerAnalyticsBooking = {
  id: string;
  property_id: string;
  status: "pending" | "confirmed" | "cancelled" | "refunded";
  total: number | string;
  created_at: string;
};

export type PartnerAnalyticsFinancial = {
  booking_id: string;
  partner_net: number | string;
  status: string;
};

const bookingStatuses = ["pending", "confirmed", "cancelled", "refunded"] as const;

export function buildPartnerAnalytics(
  properties: PartnerAnalyticsProperty[],
  bookings: PartnerAnalyticsBooking[],
  financials: PartnerAnalyticsFinancial[],
  now = new Date(),
) {
  const activeFinancials = financials.filter((row) => row.status !== "void");
  const netByBooking = new Map(activeFinancials.map((row) => [row.booking_id, Number(row.partner_net)]));
  const statusMix = bookingStatuses.map((status) => ({
    status,
    count: bookings.filter((booking) => booking.status === status).length,
  }));
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (11 - index), 1));
    return {
      key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).format(date),
      requests: 0,
      confirmed: 0,
      partnerNet: 0,
    };
  });
  const monthByKey = new Map(months.map((month) => [month.key, month]));
  for (const booking of bookings) {
    const month = monthByKey.get(booking.created_at.slice(0, 7));
    if (!month) continue;
    month.requests += 1;
    if (booking.status === "confirmed") month.confirmed += 1;
    month.partnerNet += netByBooking.get(booking.id) || 0;
  }

  const performance = properties.map((property) => {
    const propertyBookings = bookings.filter((booking) => booking.property_id === property.id);
    const confirmed = propertyBookings.filter((booking) => booking.status === "confirmed");
    return {
      id: property.id,
      name: property.name,
      active: property.active,
      requests: propertyBookings.length,
      confirmed: confirmed.length,
      pending: propertyBookings.filter((booking) => booking.status === "pending").length,
      cancelledOrRefunded: propertyBookings.filter((booking) => booking.status === "cancelled" || booking.status === "refunded").length,
      bookedValue: confirmed.reduce((total, booking) => total + Number(booking.total), 0),
      partnerNet: propertyBookings.reduce((total, booking) => total + (netByBooking.get(booking.id) || 0), 0),
    };
  }).sort((left, right) => right.partnerNet - left.partnerNet || right.requests - left.requests || left.name.localeCompare(right.name));

  return {
    summary: {
      properties: properties.length,
      requests: bookings.length,
      confirmed: statusMix.find((item) => item.status === "confirmed")?.count || 0,
      partnerNet: activeFinancials.reduce((total, row) => total + Number(row.partner_net), 0),
    },
    statusMix,
    monthlyPerformance: months,
    propertyPerformance: performance,
  };
}
