export type BookingAuditRow = {
  id: string;
  status: string;
  note: string | null;
  created_at: string;
  profiles: { full_name?: string | null } | null;
  bookings: {
    confirmation_code?: string;
    properties?: { name?: string } | null;
  } | null;
};

export type RevenueAuditRow = {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
  profiles: { full_name?: string | null } | null;
  properties: { name?: string } | null;
};

export type AdminAuditEvent = {
  id: string;
  category: "booking" | "revenue";
  action: string;
  title: string;
  context: string;
  actor: string;
  detail: string | null;
  created_at: string;
};

const revenueLabels: Record<string, string> = {
  csv_imported: "Revenue CSV imported",
  recommendations_generated: "Rate recommendations generated",
  recommendation_approved: "Rate recommendation approved",
  recommendation_rejected: "Rate recommendation rejected",
  daily_report_generated: "Revenue report generated",
};

function readableDetails(details: Record<string, unknown> | null) {
  if (!details) return null;
  return Object.entries(details)
    .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
    .slice(0, 5)
    .map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`)
    .join(" · ") || null;
}

export function buildAdminAuditEvents(
  bookingRows: BookingAuditRow[],
  revenueRows: RevenueAuditRow[],
  limit = 200,
): AdminAuditEvent[] {
  const bookingEvents = bookingRows.map((row): AdminAuditEvent => ({
    id: `booking:${row.id}`,
    category: "booking",
    action: row.status,
    title: `Booking ${row.bookings?.confirmation_code || "status"} changed to ${row.status}`,
    context: row.bookings?.properties?.name || "Unknown property",
    actor: row.profiles?.full_name || "System",
    detail: row.note || null,
    created_at: row.created_at,
  }));
  const revenueEvents = revenueRows.map((row): AdminAuditEvent => ({
    id: `revenue:${row.id}`,
    category: "revenue",
    action: row.action,
    title: revenueLabels[row.action] || row.action.replaceAll("_", " "),
    context: row.properties?.name || "Unknown property",
    actor: row.profiles?.full_name || "System",
    detail: readableDetails(row.details),
    created_at: row.created_at,
  }));

  return [...bookingEvents, ...revenueEvents]
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, limit);
}
