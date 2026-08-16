export const resendWebhookClaimTimeoutMs = 5 * 60 * 1000;
export const resendSourceTagName = "source";
export const resendOutboxIdTagName = "outbox_id";
export const resendOutboxSourceTag = "iratepilot_outbox";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function tagRecord(tags: unknown) {
  return typeof tags === "object" && tags !== null
    ? tags as Record<string, unknown>
    : null;
}

export function hasResendOutboxSourceTag(tags: unknown) {
  return tagRecord(tags)?.[resendSourceTagName] === resendOutboxSourceTag;
}

export function getResendOutboxIdFromTags(tags: unknown) {
  const value = tagRecord(tags)?.[resendOutboxIdTagName];
  return typeof value === "string" && uuidPattern.test(value) ? value : null;
}

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
