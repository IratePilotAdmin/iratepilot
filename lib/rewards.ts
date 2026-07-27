import { memberships, type MembershipTier } from "../config/memberships";

export function calculateRewardPoints(subtotal: number, tier: "none" | MembershipTier) {
  if (tier === "none") return 0;
  return Math.floor(subtotal) * memberships[tier].rewardMultiplier;
}
