export const resendWebhookClaimTimeoutMs = 5 * 60 * 1000;

export function isRetryableResendWebhookClaim(
  status: string,
  updatedAt: string,
  now = Date.now(),
) {
  if (status === "failed") return true;
  if (status !== "processing") return false;
  const updatedAtMs = Date.parse(updatedAt);
  return Number.isFinite(updatedAtMs)
    && updatedAtMs <= now - resendWebhookClaimTimeoutMs;
}

export function isNewerResendDeliveryEvent(
  incomingOccurredAt: string,
  currentOccurredAt: string | null,
) {
  const incomingMs = Date.parse(incomingOccurredAt);
  if (!Number.isFinite(incomingMs)) return false;
  if (!currentOccurredAt) return true;
  const currentMs = Date.parse(currentOccurredAt);
  return !Number.isFinite(currentMs) || incomingMs > currentMs;
}
