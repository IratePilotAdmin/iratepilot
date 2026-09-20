import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

import { createAdminClient } from "../../supabase/admin";
import { sha256FlightEvidence } from "../runtime-safety";
import { FlightConsumerPreviewCompletionProcessingError } from "./completion-lease-contract";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const leaseDurationSeconds = 240;

const acquireRowSchema = z.object({
  decision: z.enum(["acquired", "reclaimed", "processing", "replayed"]),
  lease_revision: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]).transform(Number),
  lease_state: z.enum(["processing", "released", "completed"]),
  lease_token_sha256: sha256Schema.nullable(),
  lease_expires_at: z.string().datetime({ offset: true }).nullable(),
  order_status: z.string(),
  issued_ticket_count: z.union([
    z.number().int().nonnegative(),
    z.string().regex(/^\d+$/),
  ]).transform(Number).nullable(),
  provider_attempt_state: z.string().nullable(),
  provider_attempt_revision: z.union([
    z.number().int().nonnegative(),
    z.string().regex(/^\d+$/),
  ]).transform(Number).nullable(),
  payment_attempt_state: z.string().nullable(),
  payment_attempt_revision: z.union([
    z.number().int().nonnegative(),
    z.string().regex(/^\d+$/),
  ]).transform(Number).nullable(),
  provider_redispatch_authorized: z.literal(false),
}).passthrough();

const recoveryAcquireRowSchema = acquireRowSchema.extend({
  request_sha256: sha256Schema,
});

const leaseMutationRowSchema = z.object({
  decision: z.enum(["heartbeat", "completed", "replayed", "released", "held"]),
  lease_revision: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]).transform(Number),
  lease_state: z.enum(["processing", "released", "completed"]),
  lease_expires_at: z.string().datetime({ offset: true }).nullable(),
  order_status: z.string(),
  issued_ticket_count: z.union([
    z.number().int().nonnegative(),
    z.string().regex(/^\d+$/),
  ]).transform(Number).nullable(),
}).passthrough();

export type FlightConsumerPreviewCompletionLeaseHandle = Readonly<{
  orderId: string;
  leaseRevision: number;
  leaseTokenSha256: string;
  requestSha256: string;
}>;

export type FlightConsumerPreviewCompletionResult = Readonly<{
  orderId: string;
  status: "ticketed";
  issuedTicketCount: number;
}>;

type RpcResult = Readonly<{ data: unknown; error: unknown }>;

export interface FlightConsumerPreviewCompletionLeaseRpc {
  rpc(name: string, parameters: Readonly<Record<string, unknown>>): Promise<RpcResult>;
}

class AdminCompletionLeaseRpc implements FlightConsumerPreviewCompletionLeaseRpc {
  async rpc(name: string, parameters: Readonly<Record<string, unknown>>) {
    const result = await createAdminClient().rpc(name, parameters);
    return { data: result.data, error: result.error };
  }
}

export class FlightConsumerPreviewCompletionLeaseError extends Error {
  constructor() {
    super("The test booking completion lease is unavailable.");
    this.name = "FlightConsumerPreviewCompletionLeaseError";
  }
}

function oneRow<T extends z.ZodTypeAny>(schema: T, value: unknown): z.output<T> {
  const parsed = z.array(schema).length(1).safeParse(value);
  if (!parsed.success) throw new FlightConsumerPreviewCompletionLeaseError();
  return parsed.data[0]! as z.output<T>;
}

function sha256String(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function leaseTokenSha256() {
  const token = randomBytes(32);
  try {
    return createHash("sha256").update(token).digest("hex");
  } finally {
    token.fill(0);
  }
}

export function buildFlightConsumerPreviewCompletionLeaseIdentity(input: Readonly<{
  customerId: string;
  orderId: string;
  idempotencyKey: string;
  paymentIntentId: string;
  executionScopeSha256: string;
}>) {
  const parsed = z.object({
    customerId: uuidSchema,
    orderId: uuidSchema,
    idempotencyKey: uuidSchema,
    paymentIntentId: z.string().regex(/^pi_[A-Za-z0-9]{8,252}$/),
    executionScopeSha256: sha256Schema,
  }).strict().parse(input);
  const idempotencyKeySha256 = sha256String(parsed.idempotencyKey);
  const paymentIntentIdSha256 = sha256FlightEvidence({
    version: "flight-consumer-preview-completion-payment-reference-v1",
    valueSha256: sha256String(parsed.paymentIntentId),
  });
  const requestSha256 = sha256FlightEvidence({
    version: "flight-consumer-preview-completion-request-v1",
    customerId: parsed.customerId,
    orderId: parsed.orderId,
    idempotencyKeySha256,
    paymentIntentIdSha256,
    executionScopeSha256: parsed.executionScopeSha256,
  });
  return Object.freeze({ idempotencyKeySha256, paymentIntentIdSha256, requestSha256 });
}

function logLeaseFailure(input: Readonly<{
  phase: "acquire" | "heartbeat" | "complete" | "release";
  category: "database_rpc_rejected" | "database_rpc_unavailable" | "invalid_projection";
  durableState: Readonly<{ leaseState: string; leaseRevision: number | null }>;
}>) {
  console.error("[flight-consumer-preview:completion-lease] operation failed", {
    phase: input.phase,
    category: input.category,
    durableState: input.durableState,
  });
}

export class FlightConsumerPreviewCompletionLeaseCoordinator {
  readonly #rpc: FlightConsumerPreviewCompletionLeaseRpc;

  constructor(rpc: FlightConsumerPreviewCompletionLeaseRpc) {
    if (typeof rpc?.rpc !== "function") throw new FlightConsumerPreviewCompletionLeaseError();
    this.#rpc = rpc;
  }

  async acquire(input: Readonly<{
    customerId: string;
    orderId: string;
    idempotencyKey: string;
    paymentIntentId: string;
    executionScopeSha256: string;
  }>): Promise<Readonly<{
    decision: "owner";
    handle: FlightConsumerPreviewCompletionLeaseHandle;
  }> | Readonly<{
    decision: "replayed";
    result: FlightConsumerPreviewCompletionResult;
  }>> {
    const identity = buildFlightConsumerPreviewCompletionLeaseIdentity(input);
    const tokenSha256 = leaseTokenSha256();
    let result: RpcResult;
    try {
      result = await this.#rpc.rpc("acquire_flight_consumer_completion_lease_v1", {
        p_customer_id: input.customerId,
        p_order_id: input.orderId,
        p_idempotency_key_sha256: identity.idempotencyKeySha256,
        p_request_sha256: identity.requestSha256,
        p_execution_scope_sha256: input.executionScopeSha256,
        p_lease_token_sha256: tokenSha256,
        p_lease_duration_seconds: leaseDurationSeconds,
      });
    } catch {
      logLeaseFailure({
        phase: "acquire",
        category: "database_rpc_unavailable",
        durableState: { leaseState: "unknown", leaseRevision: null },
      });
      throw new FlightConsumerPreviewCompletionLeaseError();
    }
    if (result.error !== null) {
      logLeaseFailure({
        phase: "acquire",
        category: "database_rpc_rejected",
        durableState: { leaseState: "unknown", leaseRevision: null },
      });
      throw new FlightConsumerPreviewCompletionLeaseError();
    }
    let row: z.infer<typeof acquireRowSchema>;
    try {
      row = oneRow(acquireRowSchema, result.data);
    } catch {
      logLeaseFailure({
        phase: "acquire",
        category: "invalid_projection",
        durableState: { leaseState: "unknown", leaseRevision: null },
      });
      throw new FlightConsumerPreviewCompletionLeaseError();
    }
    if (row.decision === "processing") {
      throw new FlightConsumerPreviewCompletionProcessingError();
    }
    if (row.decision === "replayed") {
      if (
        row.lease_state !== "completed"
        || row.order_status !== "ticketed"
        || row.issued_ticket_count === null
        || row.issued_ticket_count < 1
        || row.lease_token_sha256 !== null
      ) throw new FlightConsumerPreviewCompletionLeaseError();
      return Object.freeze({
        decision: "replayed" as const,
        result: Object.freeze({
          orderId: input.orderId,
          status: "ticketed" as const,
          issuedTicketCount: row.issued_ticket_count,
        }),
      });
    }
    if (
      !["acquired", "reclaimed"].includes(row.decision)
      || row.lease_state !== "processing"
      || row.lease_token_sha256 !== tokenSha256
      || row.lease_expires_at === null
      || Date.parse(row.lease_expires_at) <= Date.now()
      || row.provider_redispatch_authorized !== false
    ) throw new FlightConsumerPreviewCompletionLeaseError();
    return Object.freeze({
      decision: "owner" as const,
      handle: Object.freeze({
        orderId: input.orderId,
        leaseRevision: row.lease_revision,
        leaseTokenSha256: tokenSha256,
        requestSha256: identity.requestSha256,
      }),
    });
  }

  async acquireRecovery(input: Readonly<{
    customerId: string;
    orderId: string;
    executionScopeSha256: string;
  }>): Promise<Readonly<{
    decision: "owner";
    handle: FlightConsumerPreviewCompletionLeaseHandle;
  }> | Readonly<{
    decision: "replayed";
    result: FlightConsumerPreviewCompletionResult;
  }>> {
    const parsed = z.object({
      customerId: uuidSchema,
      orderId: uuidSchema,
      executionScopeSha256: sha256Schema,
    }).strict().parse(input);
    const tokenSha256 = leaseTokenSha256();
    let result: RpcResult;
    try {
      result = await this.#rpc.rpc("recover_flight_consumer_completion_lease_v1", {
        p_customer_id: parsed.customerId,
        p_order_id: parsed.orderId,
        p_execution_scope_sha256: parsed.executionScopeSha256,
        p_lease_token_sha256: tokenSha256,
        p_lease_duration_seconds: leaseDurationSeconds,
      });
    } catch {
      logLeaseFailure({
        phase: "acquire",
        category: "database_rpc_unavailable",
        durableState: { leaseState: "unknown", leaseRevision: null },
      });
      throw new FlightConsumerPreviewCompletionLeaseError();
    }
    if (result.error !== null) {
      logLeaseFailure({
        phase: "acquire",
        category: "database_rpc_rejected",
        durableState: { leaseState: "unknown", leaseRevision: null },
      });
      throw new FlightConsumerPreviewCompletionLeaseError();
    }
    let row: z.infer<typeof recoveryAcquireRowSchema>;
    try {
      row = oneRow(recoveryAcquireRowSchema, result.data);
    } catch {
      logLeaseFailure({
        phase: "acquire",
        category: "invalid_projection",
        durableState: { leaseState: "unknown", leaseRevision: null },
      });
      throw new FlightConsumerPreviewCompletionLeaseError();
    }
    if (row.decision === "processing") {
      throw new FlightConsumerPreviewCompletionProcessingError();
    }
    if (row.decision === "replayed") {
      if (
        row.lease_state !== "completed"
        || row.order_status !== "ticketed"
        || row.issued_ticket_count === null
        || row.issued_ticket_count < 1
        || row.lease_token_sha256 !== null
      ) throw new FlightConsumerPreviewCompletionLeaseError();
      return Object.freeze({
        decision: "replayed" as const,
        result: Object.freeze({
          orderId: parsed.orderId,
          status: "ticketed" as const,
          issuedTicketCount: row.issued_ticket_count,
        }),
      });
    }
    if (
      row.decision !== "reclaimed"
      || row.lease_state !== "processing"
      || row.lease_token_sha256 !== tokenSha256
      || row.lease_expires_at === null
      || Date.parse(row.lease_expires_at) <= Date.now()
      || row.provider_redispatch_authorized !== false
    ) throw new FlightConsumerPreviewCompletionLeaseError();
    return Object.freeze({
      decision: "owner" as const,
      handle: Object.freeze({
        orderId: parsed.orderId,
        leaseRevision: row.lease_revision,
        leaseTokenSha256: tokenSha256,
        requestSha256: row.request_sha256,
      }),
    });
  }

  async heartbeat(handle: FlightConsumerPreviewCompletionLeaseHandle) {
    const row = await this.#mutate("heartbeat", handle, {
      p_lease_duration_seconds: leaseDurationSeconds,
    });
    if (
      row.decision !== "heartbeat"
      || row.lease_state !== "processing"
      || row.lease_revision !== handle.leaseRevision
      || row.lease_expires_at === null
      || Date.parse(row.lease_expires_at) <= Date.now()
    ) throw new FlightConsumerPreviewCompletionLeaseError();
  }

  async complete(
    handle: FlightConsumerPreviewCompletionLeaseHandle,
    result: FlightConsumerPreviewCompletionResult,
  ) {
    const outcomeSha256 = sha256FlightEvidence({
      version: "flight-consumer-preview-completion-result-v1",
      status: result.status,
      issuedTicketCount: result.issuedTicketCount,
      requestSha256: handle.requestSha256,
    });
    const row = await this.#mutate("complete", handle, {
      p_outcome_sha256: outcomeSha256,
      p_issued_ticket_count: result.issuedTicketCount,
    });
    if (
      !["completed", "replayed"].includes(row.decision)
      || row.lease_state !== "completed"
      || row.order_status !== "ticketed"
      || row.issued_ticket_count !== result.issuedTicketCount
    ) throw new FlightConsumerPreviewCompletionLeaseError();
  }

  async release(handle: FlightConsumerPreviewCompletionLeaseHandle) {
    const failureSha256 = sha256FlightEvidence({
      version: "flight-consumer-preview-completion-release-v1",
      requestSha256: handle.requestSha256,
      leaseRevision: handle.leaseRevision,
    });
    try {
      await this.#mutate("release", handle, { p_failure_sha256: failureSha256 });
    } catch {
      // #mutate already emitted a categorical, identifier-free diagnostic.
    }
  }

  async #mutate(
    phase: "heartbeat" | "complete" | "release",
    handle: FlightConsumerPreviewCompletionLeaseHandle,
    extra: Readonly<Record<string, unknown>>,
  ) {
    const rpcName = phase === "heartbeat"
      ? "heartbeat_flight_consumer_completion_lease_v1"
      : phase === "complete"
        ? "complete_flight_consumer_completion_lease_v1"
        : "release_flight_consumer_completion_lease_v1";
    let result: RpcResult;
    try {
      result = await this.#rpc.rpc(rpcName, {
        p_order_id: handle.orderId,
        p_expected_revision: handle.leaseRevision,
        p_lease_token_sha256: handle.leaseTokenSha256,
        ...extra,
      });
    } catch {
      logLeaseFailure({
        phase,
        category: "database_rpc_unavailable",
        durableState: { leaseState: "processing", leaseRevision: handle.leaseRevision },
      });
      throw new FlightConsumerPreviewCompletionLeaseError();
    }
    if (result.error !== null) {
      logLeaseFailure({
        phase,
        category: "database_rpc_rejected",
        durableState: { leaseState: "processing", leaseRevision: handle.leaseRevision },
      });
      throw new FlightConsumerPreviewCompletionLeaseError();
    }
    try {
      return oneRow(leaseMutationRowSchema, result.data);
    } catch {
      logLeaseFailure({
        phase,
        category: "invalid_projection",
        durableState: { leaseState: "processing", leaseRevision: handle.leaseRevision },
      });
      throw new FlightConsumerPreviewCompletionLeaseError();
    }
  }
}

export function createFlightConsumerPreviewCompletionLeaseCoordinator() {
  return new FlightConsumerPreviewCompletionLeaseCoordinator(new AdminCompletionLeaseRpc());
}
