export type CustomerProfile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  membership_tier: string;
  membership_status: string;
  reward_points: number;
  created_at: string;
};

export type CustomerBooking = {
  customer_id: string | null;
  status: string;
  total: number | string;
  created_at: string;
};

export type CustomerDirectoryItem = CustomerProfile & {
  email: string | null;
  booking_count: number;
  pending_booking_count: number;
  confirmed_value: number;
  last_booking_at: string | null;
};

export function buildCustomerDirectory(
  profiles: CustomerProfile[],
  bookings: CustomerBooking[],
  emails: Map<string, string | null>,
): CustomerDirectoryItem[] {
  const bookingSummary = new Map<string, Omit<CustomerDirectoryItem, keyof CustomerProfile | "email">>();

  for (const booking of bookings) {
    if (!booking.customer_id) continue;
    const current = bookingSummary.get(booking.customer_id) || {
      booking_count: 0,
      pending_booking_count: 0,
      confirmed_value: 0,
      last_booking_at: null,
    };
    current.booking_count += 1;
    if (booking.status === "pending") {
      current.pending_booking_count += 1;
    }
    if (booking.status === "confirmed") {
      current.confirmed_value += Number(booking.total);
    }
    if (!current.last_booking_at || booking.created_at > current.last_booking_at) {
      current.last_booking_at = booking.created_at;
    }
    bookingSummary.set(booking.customer_id, current);
  }

  return profiles.map((profile) => ({
    ...profile,
    email: emails.get(profile.id) || null,
    ...(bookingSummary.get(profile.id) || {
      booking_count: 0,
      pending_booking_count: 0,
      confirmed_value: 0,
      last_booking_at: null,
    }),
  }));
}
