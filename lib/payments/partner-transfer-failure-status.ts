export type PartnerTransferFailureStatusOptions = {
  error: unknown;
  transferAttempted: boolean;
  transferConfirmed?: boolean;
  wasIndeterminate?: boolean;
};

export function partnerTransferFailureStatus({
  error,
  transferAttempted,
  transferConfirmed = false,
  wasIndeterminate = false,
}: PartnerTransferFailureStatusOptions): "pending" | "failed" {
  if (wasIndeterminate || transferConfirmed) return "pending";
  if (!transferAttempted) return "failed";

  const type = (error as { type?: unknown } | null)?.type;
  return type === "StripeConnectionError" || type === "StripeAPIError" ? "pending" : "failed";
}
