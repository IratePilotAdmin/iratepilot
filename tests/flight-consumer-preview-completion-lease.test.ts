import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildFlightConsumerPreviewCompletionLeaseIdentity,
  FlightConsumerPreviewCompletionLeaseCoordinator,
  FlightConsumerPreviewCompletionLeaseError,
  type FlightConsumerPreviewCompletionLeaseRpc,
} from "../lib/flights/consumer-preview/completion-lease.server";
import { FlightConsumerPreviewCompletionProcessingError } from "../lib/flights/consumer-preview/completion-lease-contract";

const customerId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const idempotencyKey = "33333333-3333-4333-8333-333333333333";
const paymentIntentId = "pi_completionlease0001";
const executionScopeSha256 = "a".repeat(64);
const future = "2099-08-26T20:04:00.000Z";

function input() {
  return { customerId, orderId, idempotencyKey, paymentIntentId, executionScopeSha256 };
}

function acquired(overrides: Record<string, unknown> = {}) {
  return {
    decision: "acquired",
    lease_revision: 0,
    lease_state: "processing",
    lease_token_sha256: null,
    lease_expires_at: future,
    order_status: "payment_authorized",
    issued_ticket_count: null,
    provider_attempt_state: null,
    provider_attempt_revision: null,
    payment_attempt_state: null,
    payment_attempt_revision: null,
    provider_redispatch_authorized: false,
    ...overrides,
  };
}

describe("Consumer Preview completion lease coordinator", () => {
  it("binds the HTTP key and payment identity only through digests", async () => {
    const calls: Array<{ name: string; parameters: Readonly<Record<string, unknown>> }> = [];
    const rpc: FlightConsumerPreviewCompletionLeaseRpc = {
      async rpc(name, parameters) {
        calls.push({ name, parameters });
        return {
          data: [acquired({ lease_token_sha256: parameters.p_lease_token_sha256 })],
          error: null,
        };
      },
    };
    const coordinator = new FlightConsumerPreviewCompletionLeaseCoordinator(rpc);
    await expect(coordinator.acquire(input())).resolves.toMatchObject({
      decision: "owner",
      handle: {
        orderId,
        leaseRevision: 0,
        leaseTokenSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        requestSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe("acquire_flight_consumer_completion_lease_v1");
    expect(calls[0]!.parameters).toMatchObject({
      p_customer_id: customerId,
      p_order_id: orderId,
      p_idempotency_key_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_request_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_execution_scope_sha256: executionScopeSha256,
      p_lease_token_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_lease_duration_seconds: 240,
    });
    expect(JSON.stringify(calls[0]!.parameters)).not.toContain(idempotencyKey);
    expect(JSON.stringify(calls[0]!.parameters)).not.toContain(paymentIntentId);
  });

  it("reclaims server recovery with the existing immutable request identity", async () => {
    const calls: Array<{ name: string; parameters: Readonly<Record<string, unknown>> }> = [];
    const requestSha256 = "b".repeat(64);
    const rpc: FlightConsumerPreviewCompletionLeaseRpc = {
      async rpc(name, parameters) {
        calls.push({ name, parameters });
        return {
          data: [acquired({
            decision: "reclaimed",
            lease_revision: 2,
            lease_token_sha256: parameters.p_lease_token_sha256,
            request_sha256: requestSha256,
            order_status: "order_creating",
            payment_attempt_state: "succeeded",
            payment_attempt_revision: 2,
          })],
          error: null,
        };
      },
    };
    const coordinator = new FlightConsumerPreviewCompletionLeaseCoordinator(rpc);
    await expect(coordinator.acquireRecovery({
      customerId,
      orderId,
      executionScopeSha256,
    })).resolves.toEqual({
      decision: "owner",
      handle: {
        orderId,
        leaseRevision: 2,
        leaseTokenSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        requestSha256,
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe("recover_flight_consumer_completion_lease_v1");
    expect(calls[0]!.parameters).toEqual({
      p_customer_id: customerId,
      p_order_id: orderId,
      p_execution_scope_sha256: executionScopeSha256,
      p_lease_token_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_lease_duration_seconds: 240,
    });
    expect(calls[0]!.parameters).not.toHaveProperty("p_idempotency_key_sha256");
    expect(calls[0]!.parameters).not.toHaveProperty("p_request_sha256");
  });

  it("does not take recovery ownership while another exact dispatch remains active", async () => {
    const coordinator = new FlightConsumerPreviewCompletionLeaseCoordinator({
      async rpc() {
        return {
          data: [acquired({
            decision: "processing",
            lease_revision: 1,
            lease_token_sha256: null,
            request_sha256: "b".repeat(64),
            provider_attempt_state: "dispatching",
            provider_attempt_revision: 1,
          })],
          error: null,
        };
      },
    });
    await expect(coordinator.acquireRecovery({
      customerId,
      orderId,
      executionScopeSha256,
    })).rejects.toBeInstanceOf(FlightConsumerPreviewCompletionProcessingError);
  });

  it("replays exact ticket evidence through recovery without issuing an owner token", async () => {
    const coordinator = new FlightConsumerPreviewCompletionLeaseCoordinator({
      async rpc() {
        return {
          data: [acquired({
            decision: "replayed",
            lease_revision: 3,
            lease_state: "completed",
            lease_expires_at: null,
            request_sha256: "b".repeat(64),
            order_status: "ticketed",
            issued_ticket_count: 2,
          })],
          error: null,
        };
      },
    });
    await expect(coordinator.acquireRecovery({
      customerId,
      orderId,
      executionScopeSha256,
    })).resolves.toEqual({
      decision: "replayed",
      result: { orderId, status: "ticketed", issuedTicketCount: 2 },
    });
  });

  it("rejects any recovery projection that purports to authorize redispatch", async () => {
    const coordinator = new FlightConsumerPreviewCompletionLeaseCoordinator({
      async rpc(_name, parameters) {
        return {
          data: [acquired({
            decision: "reclaimed",
            lease_token_sha256: parameters.p_lease_token_sha256,
            request_sha256: "b".repeat(64),
            provider_redispatch_authorized: true,
          })],
          error: null,
        };
      },
    });
    await expect(coordinator.acquireRecovery({
      customerId,
      orderId,
      executionScopeSha256,
    })).rejects.toBeInstanceOf(FlightConsumerPreviewCompletionLeaseError);
  });

  it("heartbeats and completes only with the exact owner token and revision", async () => {
    const calls: Array<{ name: string; parameters: Readonly<Record<string, unknown>> }> = [];
    const rpc: FlightConsumerPreviewCompletionLeaseRpc = {
      async rpc(name, parameters) {
        calls.push({ name, parameters });
        if (name === "acquire_flight_consumer_completion_lease_v1") {
          return {
            data: [acquired({ lease_token_sha256: parameters.p_lease_token_sha256 })],
            error: null,
          };
        }
        if (name === "heartbeat_flight_consumer_completion_lease_v1") {
          return {
            data: [{
              decision: "heartbeat",
              lease_revision: 0,
              lease_state: "processing",
              lease_expires_at: future,
              order_status: "order_creating",
              issued_ticket_count: null,
            }],
            error: null,
          };
        }
        return {
          data: [{
            decision: "completed",
            lease_revision: 1,
            lease_state: "completed",
            lease_expires_at: null,
            order_status: "ticketed",
            issued_ticket_count: 1,
          }],
          error: null,
        };
      },
    };
    const coordinator = new FlightConsumerPreviewCompletionLeaseCoordinator(rpc);
    const acquiredLease = await coordinator.acquire(input());
    if (acquiredLease.decision !== "owner") throw new Error("owner expected");
    await coordinator.heartbeat(acquiredLease.handle);
    await coordinator.complete(acquiredLease.handle, {
      orderId,
      status: "ticketed",
      issuedTicketCount: 1,
    });
    expect(calls.map((call) => call.name)).toEqual([
      "acquire_flight_consumer_completion_lease_v1",
      "heartbeat_flight_consumer_completion_lease_v1",
      "complete_flight_consumer_completion_lease_v1",
    ]);
    expect(calls[1]!.parameters.p_lease_token_sha256)
      .toBe(calls[0]!.parameters.p_lease_token_sha256);
    expect(calls[2]!.parameters).toMatchObject({
      p_expected_revision: 0,
      p_lease_token_sha256: calls[0]!.parameters.p_lease_token_sha256,
      p_outcome_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_issued_ticket_count: 1,
    });
  });

  it("returns processing without exposing or mutating the active owner", async () => {
    const rpc: FlightConsumerPreviewCompletionLeaseRpc = {
      async rpc() {
        return {
          data: [acquired({
            decision: "processing",
            lease_revision: 3,
            lease_token_sha256: null,
            provider_attempt_state: "dispatching",
            provider_attempt_revision: 1,
          })],
          error: null,
        };
      },
    };
    const coordinator = new FlightConsumerPreviewCompletionLeaseCoordinator(rpc);
    await expect(coordinator.acquire(input()))
      .rejects.toBeInstanceOf(FlightConsumerPreviewCompletionProcessingError);
  });

  it("returns the exact durable ticketed replay without a lease token", async () => {
    const rpc: FlightConsumerPreviewCompletionLeaseRpc = {
      async rpc() {
        return {
          data: [acquired({
            decision: "replayed",
            lease_revision: 2,
            lease_state: "completed",
            lease_token_sha256: null,
            lease_expires_at: null,
            order_status: "ticketed",
            issued_ticket_count: 2,
          })],
          error: null,
        };
      },
    };
    const coordinator = new FlightConsumerPreviewCompletionLeaseCoordinator(rpc);
    await expect(coordinator.acquire(input())).resolves.toEqual({
      decision: "replayed",
      result: { orderId, status: "ticketed", issuedTicketCount: 2 },
    });
  });

  it("uses a collision-sensitive request digest and never embeds raw PI", () => {
    const first = buildFlightConsumerPreviewCompletionLeaseIdentity(input());
    const second = buildFlightConsumerPreviewCompletionLeaseIdentity({
      ...input(),
      idempotencyKey: randomUUID(),
    });
    const third = buildFlightConsumerPreviewCompletionLeaseIdentity({
      ...input(),
      paymentIntentId: "pi_completionlease0002",
    });
    expect(first.requestSha256).not.toBe(second.requestSha256);
    expect(first.requestSha256).not.toBe(third.requestSha256);
    expect(JSON.stringify(first)).not.toContain(paymentIntentId);
    expect(JSON.stringify(first)).not.toContain(idempotencyKey);
  });

  it("logs only categorical durable state when a database RPC rejects", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const coordinator = new FlightConsumerPreviewCompletionLeaseCoordinator({
        async rpc() {
          return { data: null, error: { message: `secret ${paymentIntentId}` } };
        },
      });
      await expect(coordinator.acquire(input()))
        .rejects.toBeInstanceOf(FlightConsumerPreviewCompletionLeaseError);
      expect(spy).toHaveBeenCalledWith(
        "[flight-consumer-preview:completion-lease] operation failed",
        {
          phase: "acquire",
          category: "database_rpc_rejected",
          durableState: { leaseState: "unknown", leaseRevision: null },
        },
      );
      expect(JSON.stringify(spy.mock.calls)).not.toContain(paymentIntentId);
      expect(JSON.stringify(spy.mock.calls)).not.toContain(customerId);
      expect(JSON.stringify(spy.mock.calls)).not.toContain(orderId);
    } finally {
      spy.mockRestore();
    }
  });
});
