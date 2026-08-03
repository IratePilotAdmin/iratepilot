export const cancellationClaimTimeoutMs = 10 * 60 * 1000;

export function isCancellationClaimStale(status: string, updatedAt: string, now = Date.now()) {
  if (status !== "processing") return false;
  const updatedTime = Date.parse(updatedAt);
  return !Number.isNaN(updatedTime) && updatedTime < now - cancellationClaimTimeoutMs;
}
