import { describe, expect, it } from "vitest";

import { decideFlightConsumerPreviewDuffelOrderRecovery } from "../lib/flights/consumer-preview/duffel-order-recovery-policy";

const deadline = "2026-08-26T20:04:00.000Z";

describe("Consumer Preview Duffel order recovery policy", () => {
  it("reattaches an exact prepared attempt and separately identifies expiry", () => {
    expect(decideFlightConsumerPreviewDuffelOrderRecovery({
      attemptRevision: 0,
      attemptState: "prepared",
      dispatchNotAfter: deadline,
      evidenceAvailable: false,
      nowMs: Date.parse("2026-08-26T20:00:00.000Z"),
    })).toBe("resume_prepared");
    expect(decideFlightConsumerPreviewDuffelOrderRecovery({
      attemptRevision: 0,
      attemptState: "prepared",
      dispatchNotAfter: deadline,
      evidenceAvailable: false,
      nowMs: Date.parse(deadline),
    })).toBe("block_expired_prepared");
  });

  it("leaves an actively dispatching attempt processing without a review mutation", () => {
    expect(decideFlightConsumerPreviewDuffelOrderRecovery({
      attemptRevision: 1,
      attemptState: "dispatching",
      dispatchNotAfter: deadline,
      evidenceAvailable: false,
      nowMs: Date.parse("2026-08-26T20:00:00.000Z"),
    })).toBe("processing");
  });

  it("routes an expired dispatching attempt to review without redispatch", () => {
    expect(decideFlightConsumerPreviewDuffelOrderRecovery({
      attemptRevision: 1,
      attemptState: "dispatching",
      dispatchNotAfter: deadline,
      evidenceAvailable: false,
      nowMs: Date.parse(deadline),
    })).toBe("review");
  });

  it("replays only a terminal success with durable response evidence", () => {
    expect(decideFlightConsumerPreviewDuffelOrderRecovery({
      attemptRevision: 2,
      attemptState: "succeeded",
      dispatchNotAfter: deadline,
      evidenceAvailable: true,
    })).toBe("replay_succeeded");
    expect(decideFlightConsumerPreviewDuffelOrderRecovery({
      attemptRevision: 2,
      attemptState: "succeeded",
      dispatchNotAfter: deadline,
      evidenceAvailable: false,
    })).toBe("review");
  });

  it.each([
    ["blocked", 1],
    ["failed", 2],
    ["ambiguous", 2],
  ] as const)("routes terminal %s revision %s to review", (attemptState, attemptRevision) => {
    expect(decideFlightConsumerPreviewDuffelOrderRecovery({
      attemptRevision,
      attemptState,
      dispatchNotAfter: deadline,
      evidenceAvailable: false,
    })).toBe("review");
  });
});
