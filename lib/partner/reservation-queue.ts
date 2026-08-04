export type PartnerQueueReservation = {
  id: string;
  status: string;
  check_in: string;
  created_at: string;
};

const statusPriority = (status: string) => status === "pending" ? 0 : status === "confirmed" ? 1 : 2;

export function buildPartnerReservationQueue<T extends PartnerQueueReservation>(items: T[]) {
  const ordered = [...items].sort((left, right) => {
    const priority = statusPriority(left.status) - statusPriority(right.status);
    if (priority) return priority;
    if (left.status === "pending" || left.status === "confirmed") {
      const checkIn = left.check_in.localeCompare(right.check_in);
      if (checkIn) return checkIn;
    }
    return right.created_at.localeCompare(left.created_at);
  });

  return {
    ordered,
    summary: {
      total: items.length,
      pending: items.filter((item) => item.status === "pending").length,
      confirmed: items.filter((item) => item.status === "confirmed").length,
      closed: items.filter((item) => item.status !== "pending" && item.status !== "confirmed").length,
    },
  };
}
