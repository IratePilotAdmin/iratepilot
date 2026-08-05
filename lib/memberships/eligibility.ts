export type MembershipProfile = {
  membership_tier: string | null;
  membership_status: string | null;
};

export function hasActiveMembership(profile: MembershipProfile | null | undefined) {
  return profile?.membership_status === "active"
    && (profile.membership_tier === "basic" || profile.membership_tier === "business");
}
