import "server-only";

import { z } from "zod";

import { createAdminClient } from "../../supabase/admin";
import { recoverFlightConsumerPreviewOrder } from "./complete-order-workflow.server";
import { FlightConsumerPreviewCompletionProcessingError } from "./completion-lease-contract";
import {
  decryptFlightConsumerPreviewReference,
  readFlightConsumerPreviewReferenceKeyring,
  type FlightConsumerPreviewReferenceKeyring,
} from "./reference-crypto.server";
import { requireFlightConsumerPreviewRequestRuntime } from "./runtime-authority.server";

const uuidSchema = z.string().uuid();
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const positiveIntegerSchema = z.union([
  z.number().int().positive(),
  z.string().regex(/^[1-9]\d*$/),
]).transform(Number).refine(Number.isSafeInteger);

const orderStatusSchema = z.enum([
  "pending_payment",
  "payment_authorized",
  "order_creating",
  "booked",
  "ticketing_pending",
  "ticketed",
  "requires_review",
  "refund_pending",
  "refunded",
  "cancelled",
  "failed",
]);

const paymentStatusSchema = z.enum([
  "requires_payment_method",
  "requires_action",
  "authorized",
  "captured",
  "refund_pending",
  "partially_refunded",
  "refunded",
  "cancelled",
  "failed",
  "ambiguous",
]);

const recoveryRowSchema = z.object({
  order_id: uuidSchema,
  customer_id: uuidSchema,
  order_status: orderStatusSchema,
  payment_id: uuidSchema.nullable(),
  payment_status: paymentStatusSchema.nullable(),
  processor_reference_ciphertext: z.string().min(16).max(4_096).nullable(),
  processor_reference_sha256: sha256Schema.nullable(),
  amount_cents: positiveIntegerSchema,
  currency: z.literal("USD"),
  execution_scope_sha256: sha256Schema,
}).strict();

const recoveryInputSchema = z.object({
  customerId: uuidSchema,
  orderId: uuidSchema,
}).strict();

const completedOrderSchema = z.object({
  orderId: uuidSchema,
  status: z.literal("ticketed"),
  issuedTicketCount: z.number().int().positive(),
}).strict();

type RecoveryRow = z.infer<typeof recoveryRowSchema>;

export type FlightConsumerPreviewCompletionRecoveryResult = Readonly<{
  decision: "completed" | "terminal" | "pending" | "waiting_for_payment";
  orderId: string;
  status: z.infer<typeof orderStatusSchema>;
  issuedTicketCount: number | null;
}>;

export interface FlightConsumerPreviewCompletionRecoveryStore {
  load(input: Readonly<{
    customerId: string;
    orderId: string;
  }>): Promise<unknown>;
}

export type FlightConsumerPreviewCompletionRecoveryDependencies = Readonly<{
  store: FlightConsumerPreviewCompletionRecoveryStore;
  executionScopeSha256: string;
  referenceKeyring: FlightConsumerPreviewReferenceKeyring;
  complete: typeof recoverFlightConsumerPreviewOrder;
}>;

export class FlightConsumerPreviewCompletionRecoveryError extends Error {
  constructor() {
    super("The test booking could not be resumed safely.");
    this.name = "FlightConsumerPreviewCompletionRecoveryError";
  }
}

class SupabaseCompletionRecoveryStore implements FlightConsumerPreviewCompletionRecoveryStore {
  async load(input: Readonly<{ customerId: string; orderId: string }>) {
    const { data, error } = await createAdminClient().rpc(
      "get_flight_consumer_completion_recovery_v1",
      {
        p_customer_id: input.customerId,
        p_order_id: input.orderId,
      },
    );
    if (error) throw new FlightConsumerPreviewCompletionRecoveryError();
    return data;
  }
}

function oneRecoveryRow(value: unknown) {
  const parsed = z.array(recoveryRowSchema).length(1).safeParse(value);
  if (!parsed.success) throw new FlightConsumerPreviewCompletionRecoveryError();
  return parsed.data[0]!;
}

function assertPaymentReference(row: RecoveryRow) {
  if (
    row.payment_id === null
    || row.payment_status === null
    || row.processor_reference_ciphertext === null
    || row.processor_reference_sha256 === null
  ) throw new FlightConsumerPreviewCompletionRecoveryError();
  return Object.freeze({
    paymentId: row.payment_id,
    paymentStatus: row.payment_status,
    ciphertext: row.processor_reference_ciphertext,
    referenceSha256: row.processor_reference_sha256,
  });
}

export function createInjectedFlightConsumerPreviewCompletionRecovery(
  dependencies: FlightConsumerPreviewCompletionRecoveryDependencies,
) {
  const scope = sha256Schema.safeParse(dependencies.executionScopeSha256);
  if (
    !scope.success
    || typeof dependencies.store?.load !== "function"
    || typeof dependencies.complete !== "function"
  ) throw new FlightConsumerPreviewCompletionRecoveryError();

  return async function recover(
    untrustedInput: z.input<typeof recoveryInputSchema>,
  ): Promise<FlightConsumerPreviewCompletionRecoveryResult> {
    try {
      const input = recoveryInputSchema.parse(structuredClone(untrustedInput));
      const row = oneRecoveryRow(await dependencies.store.load(input));
      if (
        row.order_id !== input.orderId
        || row.customer_id !== input.customerId
        || row.execution_scope_sha256 !== scope.data
      ) throw new Error();

      if (["requires_review", "refunded", "cancelled", "failed"].includes(row.order_status)) {
        return Object.freeze({
          decision: "terminal" as const,
          orderId: row.order_id,
          status: row.order_status,
          issuedTicketCount: null,
        });
      }
      if (["booked", "ticketing_pending", "refund_pending"].includes(row.order_status)) {
        return Object.freeze({
          decision: "pending" as const,
          orderId: row.order_id,
          status: row.order_status,
          issuedTicketCount: null,
        });
      }
      if (row.payment_id === null) {
        if (
          row.payment_status !== null
          || row.processor_reference_ciphertext !== null
          || row.processor_reference_sha256 !== null
        ) throw new Error();
        return Object.freeze({
          decision: "waiting_for_payment" as const,
          orderId: row.order_id,
          status: row.order_status,
          issuedTicketCount: null,
        });
      }

      const payment = assertPaymentReference(row);
      const paymentIntentId = decryptFlightConsumerPreviewReference({
        ciphertext: payment.ciphertext,
        expectedReferenceSha256: payment.referenceSha256,
        context: {
          kind: "stripe_payment_intent",
          customerId: input.customerId,
          resourceId: input.orderId,
          executionScopeSha256: scope.data,
        },
        keyring: dependencies.referenceKeyring,
      });
      if (!/^pi_[A-Za-z0-9]{8,252}$/.test(paymentIntentId)) throw new Error();
      const completed = completedOrderSchema.parse(await dependencies.complete({
        customerId: input.customerId,
        orderId: input.orderId,
        paymentIntentId,
      }));
      if (completed.orderId !== input.orderId) throw new Error();
      return Object.freeze({
        decision: "completed" as const,
        orderId: completed.orderId,
        status: completed.status,
        issuedTicketCount: completed.issuedTicketCount,
      });
    } catch (error) {
      if (error instanceof FlightConsumerPreviewCompletionProcessingError) throw error;
      if (error instanceof FlightConsumerPreviewCompletionRecoveryError) throw error;
      throw new FlightConsumerPreviewCompletionRecoveryError();
    }
  };
}

export async function recoverFlightConsumerPreviewCompletion(input: Readonly<{
  customerId: string;
  orderId: string;
}>) {
  try {
    const runtime = await requireFlightConsumerPreviewRequestRuntime();
    const recover = createInjectedFlightConsumerPreviewCompletionRecovery({
      store: Object.freeze(new SupabaseCompletionRecoveryStore()),
      executionScopeSha256: runtime.binding.executionScopeSha256,
      referenceKeyring: readFlightConsumerPreviewReferenceKeyring(),
      complete: recoverFlightConsumerPreviewOrder,
    });
    return await recover(input);
  } catch (error) {
    if (error instanceof FlightConsumerPreviewCompletionProcessingError) throw error;
    if (error instanceof FlightConsumerPreviewCompletionRecoveryError) throw error;
    throw new FlightConsumerPreviewCompletionRecoveryError();
  }
}
