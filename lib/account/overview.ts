type AccountProfile = {
  full_name: string | null;
  membership_tier: string;
  membership_status: string;
  reward_points: number;
};

export type AccountBooking = {
  id: string;
  confirmation_code: string;
  check_in: string;
  check_out: string;
  total: number | string;
  status: string;
  created_at: string;
  properties?: { name?: string; city?: string; country?: string } | Array<{ name?: string; city?: string; country?: string }> | null;
};

export type AccountNotification = {
  id: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

const property = (booking: AccountBooking) => Array.isArray(booking.properties)
  ? booking.properties[0] || null
  : booking.properties || null;

export function buildCustomerAccountOverview(
  profile: AccountProfile,
  bookings: AccountBooking[],
  notifications: AccountNotification[],
  today: string,
) {
  const upcoming = bookings
    .filter((booking) => booking.status === "confirmed" && booking.check_out >= today)
    .sort((left, right) => left.check_in.localeCompare(right.check_in));
  const recentBookings = [...bookings]
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
    .slice(0, 5)
    .map((booking) => ({ ...booking, properties: property(booking) }));

  return {
    profileName: profile.full_name,
    membership: {
      tier: profile.membership_tier,
      status: profile.membership_status,
      active: profile.membership_status === "active" && profile.membership_tier !== "none",
      rewardPoints: Number(profile.reward_points || 0),
    },
    summary: {
      upcomingTrips: upcoming.length,
      pendingRequests: bookings.filter((booking) => booking.status === "pending").length,
      unreadUpdates: notifications.filter((notification) => !notification.read_at).length,
    },
    nextTrip: upcoming[0] ? { ...upcoming[0], properties: property(upcoming[0]) } : null,
    recentBookings,
    notifications: notifications.slice(0, 8),
  };
}
