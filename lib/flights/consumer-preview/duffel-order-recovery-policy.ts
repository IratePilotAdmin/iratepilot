export type FlightConsumerPreviewDuffelOrderRecoveryDecision =
  | "resume_prepared"
  | "block_expired_prepared"
  | "processing"
  | "replay_succeeded"
  | "review";

export function decideFlightConsumerPreviewDuffelOrderRecovery(input: Readonly<{
  attemptRevision: 0 | 1 | 2;
  attemptState: "prepared" | "dispatching" | "blocked" | "succeeded" | "failed" | "ambiguous";
  dispatchNotAfter: string;
  evidenceAvailable: boolean;
  nowMs?: number;
}>): FlightConsumerPreviewDuffelOrderRecoveryDecision {
  if (input.attemptState === "prepared" && input.attemptRevision === 0) {
    return Date.parse(input.dispatchNotAfter) <= (input.nowMs ?? Date.now())
      ? "block_expired_prepared"
      : "resume_prepared";
  }
  if (input.attemptState === "dispatching" && input.attemptRevision === 1) {
    return Date.parse(input.dispatchNotAfter) <= (input.nowMs ?? Date.now())
      ? "review"
      : "processing";
  }
  if (
    input.attemptState === "succeeded"
    && input.attemptRevision === 2
    && input.evidenceAvailable
  ) return "replay_succeeded";
  return "review";
}
