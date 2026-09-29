import { createHmac, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  FlightConsumerPreviewDuffelJournal,
  type FlightConsumerPreviewJournalRpc,
} from "../lib/flights/consumer-preview/duffel-journal.server";
import { canonicalFlightJson } from "../lib/flights/runtime-safety";

const digest = "a".repeat(64);
const secret = "consumer-preview-journal-test-secret-000000000000";

function receipt(label: string, value: unknown) {
  return createHmac("sha256", secret)
    .update(label)
    .update("\0")
    .update(canonicalFlightJson(value as never))
    .digest("hex");
}

function metadata(operation: "create_offer_request" | "create_order") {
  return Object.freeze({
    version: "duffel-safe-request-metadata-v1" as const,
    environment: "sandbox" as const,
    operation,
    endpointClass: operation === "create_order" ? "orders_collection" as const : "offer_requests_collection" as const,
    method: "POST" as const,
    requestDigest: digest,
    requestBodyDigest: "b".repeat(64),
    outboundBodyBytes: 24,
    timeoutMs: operation === "create_order" ? 130_000 : 10_000,
  });
}

function rpcRecorder() {
  const calls: Array<{ name: string; parameters: Readonly<Record<string, unknown>> }> = [];
  const attemptId = randomUUID();
  const rpc: FlightConsumerPreviewJournalRpc = {
    async rpc(name, parameters) {
      calls.push({ name, parameters });
      if (name.startsWith("prepare_")) {
        return { data: [{ attempt_id: attemptId, attempt_revision: 0, attempt_state: "prepared" }], error: null };
      }
      if (name.startsWith("claim_")) {
        return { data: [{ attempt_id: attemptId, attempt_revision: 1, attempt_state: "dispatching" }], error: null };
      }
      return { data: [{ attempt_id: attemptId, attempt_revision: 2, attempt_state: "succeeded" }], error: null };
    },
  };
  return { calls, attemptId, rpc };
}

describe("Flight Consumer Preview Duffel journal", () => {
  it("maps search prepare, claim, and terminal completion to durable RPCs", async () => {
    const recorded = rpcRecorder();
    const journal = new FlightConsumerPreviewDuffelJournal({
      context: { kind: "search", customerId: randomUUID(), searchId: randomUUID() },
      rpc: recorded.rpc,
      secret,
    });
    const safeMetadata = metadata("create_offer_request");
    const authorizationReceiptDigest = receipt("duffel-preview-traffic-v1", safeMetadata);
    const begun = await journal.begin({
      version: "duffel-journal-begin-v1",
      metadata: safeMetadata,
      authorizationReceiptDigest,
    });
    const claimed = await journal.markDispatching({
      version: "duffel-journal-mark-dispatching-v1",
      attemptId: begun.attemptId,
      expectedRevision: 0,
      journalReceiptDigest: begun.journalReceiptDigest,
      requestDigest: digest,
      authorizationReceiptDigest,
    });
    expect(claimed.decision).toBe("claimed");
    if (claimed.decision !== "claimed") throw new Error("claim refused");
    const completed = await journal.complete({
      version: "duffel-journal-completion-v1",
      attemptId: begun.attemptId,
      expectedRevision: 1,
      journalReceiptDigest: begun.journalReceiptDigest,
      dispatchReceiptDigest: claimed.dispatchReceiptDigest,
      requestDigest: digest,
      terminalState: "succeeded",
      detailCode: "completed",
      httpStatus: 200,
      inboundBodyBytes: 100,
      responseDigest: "c".repeat(64),
    });
    expect(completed.revision).toBe(2);
    expect(recorded.calls.map((call) => call.name)).toEqual([
      "prepare_flight_consumer_search_attempt_v1",
      "claim_flight_consumer_shopping_attempt_v1",
      "complete_flight_provider_request_attempt",
    ]);
    expect(journal.readOutcome()).toMatchObject({
      attemptId: recorded.attemptId,
      terminalState: "succeeded",
      completionReceiptDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("passes split Stripe and Duffel Balance receipts only for create-order", async () => {
    const recorded = rpcRecorder();
    const paymentBinding = "d".repeat(64);
    const providerSettlement = "e".repeat(64);
    const journal = new FlightConsumerPreviewDuffelJournal({
      context: {
        kind: "order",
        customerId: randomUUID(),
        searchId: randomUUID(),
        offerId: randomUUID(),
        orderId: randomUUID(),
        offerEvidenceReceiptSha256: "f".repeat(64),
        paymentBindingReceiptSha256: paymentBinding,
        providerSettlementBindingReceiptSha256: providerSettlement,
      },
      rpc: recorded.rpc,
      secret,
    });
    const safeMetadata = metadata("create_order");
    const authorizationReceiptDigest = receipt("duffel-preview-traffic-v1", safeMetadata);
    const begun = await journal.begin({
      version: "duffel-journal-begin-v1",
      metadata: safeMetadata,
      authorizationReceiptDigest,
    });
    const claimed = await journal.markDispatching({
      version: "duffel-journal-mark-dispatching-v1",
      attemptId: begun.attemptId,
      expectedRevision: 0,
      journalReceiptDigest: begun.journalReceiptDigest,
      requestDigest: digest,
      authorizationReceiptDigest,
    });
    expect(claimed.decision).toBe("claimed");
    expect(recorded.calls[0]).toMatchObject({
      name: "prepare_flight_consumer_duffel_order_attempt_v1",
      parameters: {
        p_payment_binding_receipt_sha256: paymentBinding,
        p_provider_settlement_binding_receipt_sha256: providerSettlement,
      },
    });
    expect(recorded.calls[1]).toMatchObject({
      name: "claim_flight_consumer_duffel_order_attempt_v1",
      parameters: {
        p_payment_binding_receipt_sha256: paymentBinding,
        p_provider_settlement_binding_receipt_sha256: providerSettlement,
      },
    });
  });

  it("bounds a fresh create-order SQL deadline by the bridge order-plan expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T20:00:00.000Z"));
    try {
      const recorded = rpcRecorder();
      const planExpiry = "2026-08-26T20:02:30.000Z";
      const journal = new FlightConsumerPreviewDuffelJournal({
        context: {
          kind: "order",
          customerId: randomUUID(),
          searchId: randomUUID(),
          offerId: randomUUID(),
          orderId: randomUUID(),
          offerEvidenceReceiptSha256: "f".repeat(64),
          paymentBindingReceiptSha256: "d".repeat(64),
          providerSettlementBindingReceiptSha256: "e".repeat(64),
        },
        rpc: recorded.rpc,
        secret,
        freshAttemptDispatchDeadlineCeiling: planExpiry,
      });
      const safeMetadata = metadata("create_order");
      await journal.begin({
        version: "duffel-journal-begin-v1",
        metadata: safeMetadata,
        authorizationReceiptDigest: receipt("duffel-preview-traffic-v1", safeMetadata),
      });
      expect(recorded.calls[0]).toMatchObject({
        name: "prepare_flight_consumer_duffel_order_attempt_v1",
        parameters: { p_dispatch_not_after: planExpiry },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("reattaches only the exact prepared search attempt with its original deadline", async () => {
    const recorded = rpcRecorder();
    const searchId = randomUUID();
    const dispatchNotAfter = "2026-08-25T22:04:00.000Z";
    const journal = new FlightConsumerPreviewDuffelJournal({
      context: { kind: "search", customerId: randomUUID(), searchId },
      rpc: recorded.rpc,
      secret,
      preparedAttemptRecovery: {
        attemptId: recorded.attemptId,
        dispatchNotAfter,
      },
    });
    const safeMetadata = metadata("create_offer_request");
    await expect(journal.begin({
      version: "duffel-journal-begin-v1",
      metadata: safeMetadata,
      authorizationReceiptDigest: receipt("duffel-preview-traffic-v1", safeMetadata),
    })).resolves.toMatchObject({
      attemptId: recorded.attemptId,
      revision: 0,
      state: "prepared",
    });
    expect(recorded.calls[0]).toMatchObject({
      name: "prepare_flight_consumer_search_attempt_v1",
      parameters: {
        p_search_id: searchId,
        p_dispatch_not_after: dispatchNotAfter,
      },
    });
  });

  it("refuses a prepared-attempt recovery that resolves to another attempt", async () => {
    const recorded = rpcRecorder();
    const journal = new FlightConsumerPreviewDuffelJournal({
      context: { kind: "search", customerId: randomUUID(), searchId: randomUUID() },
      rpc: recorded.rpc,
      secret,
      preparedAttemptRecovery: {
        attemptId: randomUUID(),
        dispatchNotAfter: "2026-08-25T22:04:00.000Z",
      },
    });
    const safeMetadata = metadata("create_offer_request");
    await expect(journal.begin({
      version: "duffel-journal-begin-v1",
      metadata: safeMetadata,
      authorizationReceiptDigest: receipt("duffel-preview-traffic-v1", safeMetadata),
    })).rejects.toThrow("provider journal is unavailable");
  });

  it("turns a recovered prepared claim error into a no-dispatch refusal", async () => {
    const recorded = rpcRecorder();
    const rpc: FlightConsumerPreviewJournalRpc = {
      async rpc(name, parameters) {
        if (name === "claim_flight_consumer_shopping_attempt_v1") {
          return { data: null, error: { code: "dispatch_deadline_expired" } };
        }
        return recorded.rpc.rpc(name, parameters);
      },
    };
    const journal = new FlightConsumerPreviewDuffelJournal({
      context: { kind: "search", customerId: randomUUID(), searchId: randomUUID() },
      rpc,
      secret,
      preparedAttemptRecovery: {
        attemptId: recorded.attemptId,
        dispatchNotAfter: "2026-08-25T22:04:00.000Z",
      },
    });
    const safeMetadata = metadata("create_offer_request");
    const authorizationReceiptDigest = receipt("duffel-preview-traffic-v1", safeMetadata);
    const begun = await journal.begin({
      version: "duffel-journal-begin-v1",
      metadata: safeMetadata,
      authorizationReceiptDigest,
    });
    await expect(journal.markDispatching({
      version: "duffel-journal-mark-dispatching-v1",
      attemptId: begun.attemptId,
      expectedRevision: 0,
      journalReceiptDigest: begun.journalReceiptDigest,
      requestDigest: digest,
      authorizationReceiptDigest,
    })).resolves.toEqual({
      version: "duffel-journal-mark-dispatching-result-v1",
      decision: "refused",
    });
  });

  it("reattaches an exact prepared order and refuses its expired deadline before claim", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T20:05:00.000Z"));
    try {
      const recorded = rpcRecorder();
      const journal = new FlightConsumerPreviewDuffelJournal({
        context: {
          kind: "order",
          customerId: randomUUID(),
          searchId: randomUUID(),
          offerId: randomUUID(),
          orderId: randomUUID(),
          offerEvidenceReceiptSha256: "f".repeat(64),
          paymentBindingReceiptSha256: "d".repeat(64),
          providerSettlementBindingReceiptSha256: "e".repeat(64),
        },
        rpc: recorded.rpc,
        secret,
        preparedAttemptRecovery: {
          attemptId: recorded.attemptId,
          dispatchNotAfter: "2026-08-26T20:04:00.000Z",
        },
        freshAttemptDispatchDeadlineCeiling: "2026-08-26T20:30:00.000Z",
      });
      const safeMetadata = metadata("create_order");
      const authorizationReceiptDigest = receipt("duffel-preview-traffic-v1", safeMetadata);
      const begun = await journal.begin({
        version: "duffel-journal-begin-v1",
        metadata: safeMetadata,
        authorizationReceiptDigest,
      });
      await expect(journal.markDispatching({
        version: "duffel-journal-mark-dispatching-v1",
        attemptId: begun.attemptId,
        expectedRevision: 0,
        journalReceiptDigest: begun.journalReceiptDigest,
        requestDigest: digest,
        authorizationReceiptDigest,
      })).resolves.toEqual({
        version: "duffel-journal-mark-dispatching-result-v1",
        decision: "refused",
      });
      expect(recorded.calls).toHaveLength(1);
      expect(recorded.calls[0]).toMatchObject({
        name: "prepare_flight_consumer_duffel_order_attempt_v1",
        parameters: { p_dispatch_not_after: "2026-08-26T20:04:00.000Z" },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("runs the payment attestation hook immediately before the only order claim", async () => {
    const recorded = rpcRecorder();
    const sequence: string[] = [];
    const rpc: FlightConsumerPreviewJournalRpc = {
      async rpc(name, parameters) {
        sequence.push(name);
        return recorded.rpc.rpc(name, parameters);
      },
    };
    const beforeDispatchClaim = vi.fn(async () => {
      sequence.push("capture_attestation");
      throw new Error("retryable Stripe availability failure");
    });
    const journal = new FlightConsumerPreviewDuffelJournal({
      context: {
        kind: "order",
        customerId: randomUUID(),
        searchId: randomUUID(),
        offerId: randomUUID(),
        orderId: randomUUID(),
        offerEvidenceReceiptSha256: "f".repeat(64),
        paymentBindingReceiptSha256: "d".repeat(64),
        providerSettlementBindingReceiptSha256: "e".repeat(64),
      },
      rpc,
      secret,
      beforeDispatchClaim,
    });
    const safeMetadata = metadata("create_order");
    const authorizationReceiptDigest = receipt("duffel-preview-traffic-v1", safeMetadata);
    const begun = await journal.begin({
      version: "duffel-journal-begin-v1",
      metadata: safeMetadata,
      authorizationReceiptDigest,
    });

    await expect(journal.markDispatching({
      version: "duffel-journal-mark-dispatching-v1",
      attemptId: begun.attemptId,
      expectedRevision: 0,
      journalReceiptDigest: begun.journalReceiptDigest,
      requestDigest: digest,
      authorizationReceiptDigest,
    })).rejects.toThrow("provider journal is unavailable");

    expect(beforeDispatchClaim).toHaveBeenCalledExactlyOnceWith({
      attemptId: begun.attemptId,
      requestDigest: digest,
    });
    expect(sequence).toEqual([
      "prepare_flight_consumer_duffel_order_attempt_v1",
      "capture_attestation",
    ]);
    expect(sequence).not.toContain("claim_flight_consumer_duffel_order_attempt_v1");
    expect(journal.readOutcome()).toMatchObject({ currentRevision: 0, terminalState: null });
  });

  it("refuses an unkeyed traffic decision before any durable write", async () => {
    const recorded = rpcRecorder();
    const journal = new FlightConsumerPreviewDuffelJournal({
      context: { kind: "search", customerId: randomUUID(), searchId: randomUUID() },
      rpc: recorded.rpc,
      secret,
    });
    await expect(journal.begin({
      version: "duffel-journal-begin-v1",
      metadata: metadata("create_offer_request"),
      authorizationReceiptDigest: digest,
    })).rejects.toThrow("provider journal is unavailable");
    expect(recorded.calls).toHaveLength(0);
  });
});
