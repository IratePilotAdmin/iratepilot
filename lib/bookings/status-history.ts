export type BookingStatusHistoryEntry = {
  status: string;
  note?: string | null;
  created_at: string;
};

const statusLabels: Record<string, string> = {
  pending: "Booking requested",
  confirmed: "Booking confirmed",
  cancelled: "Booking cancelled",
  refunded: "Payment refunded",
};

export function getBookingStatusLabel(status: string) {
  return statusLabels[status] || status.replaceAll("_", " ");
}

export function sortBookingStatusHistory(entries: BookingStatusHistoryEntry[]) {
  return [...entries].sort((left, right) => {
    const leftTime = Date.parse(left.created_at);
    const rightTime = Date.parse(right.created_at);
    return (Number.isNaN(leftTime) ? 0 : leftTime) - (Number.isNaN(rightTime) ? 0 : rightTime);
  });
}

export function formatBookingHistoryTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return `${new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date)} UTC`;
}
