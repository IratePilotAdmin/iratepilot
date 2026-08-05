export const stripeWebhookClaimTimeoutMs = 5 * 60 * 1000;

export function isRetryableStripeWebhookClaim(
  status: string,
  updatedAt: string,
  now = Date.now(),
) {
  if (status === "failed") return true;
  if (status !== "processing") return false;
  const updatedAtMs = Date.parse(updatedAt);
  return Number.isFinite(updatedAtMs)
    && updatedAtMs <= now - stripeWebhookClaimTimeoutMs;
}
