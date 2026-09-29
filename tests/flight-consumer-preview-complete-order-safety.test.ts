import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "lib/flights/consumer-preview/complete-order-workflow.server.ts"),
  "utf8",
);

describe("Flight Consumer Preview complete-order safety wiring", () => {
  it("acquires one order-scoped completion lease before any resumable mutation", () => {
    const wrapperStart = source.indexOf("export async function completeFlightConsumerPreviewOrder");
    const recoveryStart = source.indexOf("export async function recoverFlightConsumerPreviewOrder");
    const wrapper = source.slice(wrapperStart, recoveryStart);
    const acquire = wrapper.indexOf("await coordinator.acquire({");
    const execute = wrapper.indexOf("await completeFlightConsumerPreviewOrderAsLeaseOwner(");
    const complete = wrapper.indexOf("await coordinator.complete(lease.handle, result);");
    const release = wrapper.indexOf("await coordinator.release(lease.handle);");
    expect(acquire).toBeGreaterThan(0);
    expect(execute).toBeGreaterThan(acquire);
    expect(complete).toBeGreaterThan(execute);
    expect(release).toBeGreaterThan(complete);
    expect(wrapper).toContain('if (lease.decision === "replayed") return lease.result;');
    expect(wrapper).toContain("idempotencyKey: uuidSchema");
  });

  it("recovery reclaims the immutable lease identity before executing or releasing", () => {
    const recovery = source.slice(source.indexOf(
      "export async function recoverFlightConsumerPreviewOrder",
    ));
    const acquire = recovery.indexOf("await coordinator.acquireRecovery({");
    const execute = recovery.indexOf("await completeFlightConsumerPreviewOrderAsLeaseOwner(");
    const complete = recovery.indexOf("await coordinator.complete(lease.handle, result);");
    const release = recovery.indexOf("await coordinator.release(lease.handle);");
    expect(acquire).toBeGreaterThan(0);
    expect(execute).toBeGreaterThan(acquire);
    expect(complete).toBeGreaterThan(execute);
    expect(release).toBeGreaterThan(complete);
    expect(recovery).toContain('if (lease.decision === "replayed") return lease.result;');
    expect(recovery).not.toContain("idempotencyKey: uuidSchema");
  });

  it("fences long-lived capture and provider boundaries with owner heartbeats", () => {
    expect(source).toContain("heartbeat: () => Promise<void>");
    expect(source).toMatch(/await heartbeat\(\);\s*await capturePayment\(\{/);
    expect(source).toMatch(/await heartbeat\(\);\s*return createAndFinalizeDuffelOrder\(\{/);
    expect(source).toMatch(
      /status === "order_creating"[\s\S]+?await heartbeat\(\);[\s\S]+?return recoverOrResumeDuffelOrder\(\{/,
    );
  });

  it("keeps Stripe capture ahead of the single Duffel dispatch and durable finalization", () => {
    const capture = source.indexOf("await capturePayment({");
    const provider = source.lastIndexOf("return createAndFinalizeDuffelOrder({");
    expect(capture).toBeGreaterThan(0);
    expect(provider).toBeGreaterThan(capture);
    expect(source).toContain("createDuffelTestHttpTransport(");
    expect(source.match(/transport\.execute\(/g)).toHaveLength(1);
    expect(source).toContain("record_flight_consumer_duffel_order_terminal_v1");
    expect(source).toContain("finalize_flight_consumer_duffel_order_v1");
  });

  it("requires exact issued-ticket evidence and routes every provider failure to review", () => {
    expect(source).toContain('projected.ticketState !== "issued"');
    expect(source).toContain("extractVerifiedDuffelPreviewOrderReferences");
    expect(source).toContain("issued_ticket_count !== input.passengers.length");
    expect(source).toContain("mark_flight_consumer_order_ambiguous_v1");
    expect(source).toContain("mark_flight_consumer_captured_order_unstarted_v1");
    expect(source).not.toMatch(/automaticRetry|retry\s*:/i);
  });

  it("keeps a proven stored provider success replayable after local finalization fails", () => {
    const createStart = source.indexOf("async function createAndFinalizeDuffelOrder");
    const createEnd = source.indexOf("async function recoverOrResumeDuffelOrder", createStart);
    const create = source.slice(createStart, createEnd);
    const recorded = create.indexOf("terminalResponseEvidenceRecorded = true;");
    const finalized = create.indexOf("await finalizeDuffelOrderResponse({");
    const guardedReview = create.indexOf(
      "if (!terminalResponseEvidenceRecorded && !preparedAndUnclaimed)",
    );
    expect(recorded).toBeGreaterThan(create.indexOf("record_flight_consumer_duffel_order_terminal_v1"));
    expect(finalized).toBeGreaterThan(recorded);
    expect(guardedReview).toBeGreaterThan(finalized);
    expect(create.slice(guardedReview)).not.toContain("readOrderRecovery(");

    const recoveryStart = source.indexOf("async function recoverOrResumeDuffelOrder");
    const recoveryEnd = source.indexOf(
      "type FlightConsumerPreviewCompleteOrderIdentity",
      recoveryStart,
    );
    expect(recoveryStart).toBeGreaterThanOrEqual(0);
    expect(recoveryEnd).toBeGreaterThan(recoveryStart);
    const recoveryReplay = source.slice(recoveryStart, recoveryEnd);
    const replayBodyStart = recoveryReplay.indexOf("let rawBody: Buffer");
    expect(replayBodyStart).toBeGreaterThanOrEqual(0);
    const replayBody = recoveryReplay.slice(replayBodyStart);
    expect(replayBody).toContain("replay_succeeded already proves");
    expect(replayBody).not.toContain("markRecoveredAttemptForReview(");
  });

  it("recovers only the exact prepared attempt and never races an active dispatch", () => {
    expect(source).toContain("dispatch_not_after: z.string().datetime");
    expect(source).toContain("evidence_available: z.boolean()");
    expect(source).toContain("preparedAttemptRecovery: {");
    expect(source).toContain("attemptId: recovery.attempt_id");
    expect(source).toContain("dispatchNotAfter: recovery.dispatch_not_after");
    expect(source).toContain('decision === "processing"');
    expect(source).toContain("Do not race it or");
    expect(source).toContain("throw new FlightConsumerPreviewCompletionProcessingError()");
    expect(source).toContain(
      "if (error instanceof FlightConsumerPreviewCompletionProcessingError) throw error;",
    );
    expect(source).toContain("successful_provider_attempt_missing_response_evidence");
    expect(source).toContain("captured_order_package_unavailable_before_provider_attempt");
    expect(source).toContain("mark_flight_consumer_captured_order_unstarted_v1");
  });

  it("checks review RPC results and logs only categorical durable state", () => {
    expect(source.match(/reviewResult\.error !== null/g)).toHaveLength(2);
    expect(source).toContain('category: "database_rpc_rejected"');
    expect(source).toContain('category: "database_rpc_unavailable"');
    expect(source).toContain("durableState: input.durableState");
    const loggerStart = source.indexOf("function logReviewProjectionFailure");
    const loggerEnd = source.indexOf("async function markOrderForReview", loggerStart);
    const logger = source.slice(loggerStart, loggerEnd);
    expect(logger).not.toMatch(/customerId|orderId|attemptId|reason|error:/);
    expect(source).toMatch(
      /await markRecoveredAttemptForReview\([\s\S]+?throw new FlightConsumerPreviewCompleteOrderError\(\)/,
    );
  });

  it("never accepts live modes, live Stripe intent evidence, or plaintext provider references", () => {
    expect(source).toContain('execution_mode: z.literal("test")');
    expect(source).toContain('provider_code: z.literal("duffel")');
    expect(source).toContain("decryptFlightConsumerPreviewReference");
    expect(source).toContain("encryptFlightConsumerPreviewReference");
    expect(source).toContain("encryptFlightConsumerOrderResponseEvidence");
    expect(source).not.toContain("sk_live_");
    expect(source).not.toContain("DUFFEL_ACCESS_TOKEN");
  });
});
