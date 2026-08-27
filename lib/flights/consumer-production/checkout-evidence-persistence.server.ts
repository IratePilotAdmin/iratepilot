import "server-only";

import { z } from "zod";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const travelerCiphertextSchema = z.string().regex(
  /^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,16320}$/,
);
const compactCiphertextSchema = z.string().regex(
  /^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4080}$/,
);

const authorityResultShape = {
  provider_dispatch_authorized: z.literal(false),
  stripe_dispatch_authorized: z.literal(false),
  booking_authorized: z.literal(false),
  order_authorized: z.literal(false),
  payment_authorized: z.literal(false),
  capture_authorized: z.literal(false),
  refund_authorized: z.literal(false),
  settlement_authorized: z.literal(false),
  ticketing_authorized: z.literal(false),
  servicing_authorized: z.literal(false),
  consumer_release_enabled: z.literal(false),
} as const;

const prepareInputSchema = z.object({
  customerId: uuidSchema,
  orderId: uuidSchema,
  executionScopeSha256: sha256Schema,
  idempotencySha256: sha256Schema,
  checkoutBindingSha256: sha256Schema,
  checkoutPrerequisiteSha256: sha256Schema,
  offerRefreshAttemptId: uuidSchema,
  offerRefreshExecutionScopeSha256: sha256Schema,
  offerBindingSha256: sha256Schema,
  normalizedOfferSha256: sha256Schema,
  offerTerminalResponseSha256: sha256Schema,
  stripePlanId: uuidSchema,
  stripePlanSha256: sha256Schema,
  stripeExecutionAttemptId: uuidSchema,
  stripeExecutionWorkflowSha256: sha256Schema,
  stripeExecutionPrerequisiteSha256: sha256Schema,
  stripeExecutionStateReceiptSha256: sha256Schema,
  paymentBindingSha256: sha256Schema,
  orderReferenceSha256: sha256Schema,
  customerReferenceSha256: sha256Schema,
  amountCents: z.number().int().min(50).max(99_999_999),
  currency: z.literal("USD"),
  travelerPayloadCiphertext: travelerCiphertextSchema,
  travelerEvidenceSha256: sha256Schema,
  contactPayloadCiphertext: compactCiphertextSchema,
  contactEvidenceSha256: sha256Schema,
  billingAddressPayloadCiphertext: compactCiphertextSchema,
  billingAddressEvidenceSha256: sha256Schema,
  termsSnapshotSha256: sha256Schema,
  termsAcceptanceSha256: sha256Schema,
  termsAcceptedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((value, context) => {
  const domainDigests = [
    value.travelerEvidenceSha256,
    value.contactEvidenceSha256,
    value.billingAddressEvidenceSha256,
    value.termsSnapshotSha256,
    value.termsAcceptanceSha256,
  ];
  if (new Set(domainDigests).size !== domainDigests.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["travelerEvidenceSha256"],
      message: "Checkout evidence domains must use independent digests.",
    });
  }
  if (value.orderReferenceSha256 === value.customerReferenceSha256) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["orderReferenceSha256"],
      message: "Order and customer reference digests must be independent.",
    });
  }
});

const transitionInputShape = {
  aggregateId: uuidSchema,
  expectedRevision: z.literal(0),
  executionScopeSha256: sha256Schema,
  checkoutBindingSha256: sha256Schema,
} as const;

const finalizeInputSchema = z.object({
  ...transitionInputShape,
  finalizationEvidenceSha256: sha256Schema,
}).strict();

const abandonInputSchema = z.object({
  ...transitionInputShape,
  abandonmentCode: z.string().regex(/^[a-z0-9_]{1,96}$/),
  abandonmentEvidenceSha256: sha256Schema,
}).strict();

const checkoutStateSchema = z.enum(["prepared", "finalized", "abandoned"]);

const baseResultShape = {
  aggregate_id: uuidSchema,
  checkout_state: checkoutStateSchema,
  checkout_revision: z.union([z.literal(0), z.literal(1)]),
  amount_cents: z.number().int().min(50).max(99_999_999),
  currency: z.literal("USD"),
  state_receipt_sha256: sha256Schema,
  ...authorityResultShape,
} as const;

const prepareResultSchema = z.object({
  decision: z.enum(["created", "replay"]),
  ...baseResultShape,
}).strict().superRefine((value, context) => {
  const validRevision = value.checkout_state === "prepared"
    ? value.checkout_revision === 0
    : value.checkout_revision === 1;
  if (!validRevision || (
    value.decision === "created"
    && value.checkout_state !== "prepared"
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["checkout_state"],
      message: "Checkout evidence receipt state is invalid.",
    });
  }
});

const finalizeResultSchema = z.object({
  decision: z.enum(["finalized", "replay"]),
  ...baseResultShape,
  checkout_state: z.literal("finalized"),
  checkout_revision: z.literal(1),
}).strict();

const abandonResultSchema = z.object({
  decision: z.enum(["abandoned", "replay"]),
  ...baseResultShape,
  checkout_state: z.literal("abandoned"),
  checkout_revision: z.literal(1),
}).strict();

export const FLIGHT_CONSUMER_LIVE_CHECKOUT_EVIDENCE_MIGRATION_VERSION =
  "202608260107" as const;

export const FLIGHT_CONSUMER_LIVE_CHECKOUT_EVIDENCE_RPC = Object.freeze({
  prepare: "prepare_flight_consumer_live_checkout_evidence_v1",
  finalize: "finalize_flight_consumer_live_checkout_evidence_v1",
  abandon: "abandon_flight_consumer_live_checkout_evidence_v1",
} as const);

export type FlightConsumerLiveCheckoutEvidenceRpcClient = Readonly<{
  rpc: (
    name: string,
    args: Readonly<Record<string, unknown>>,
  ) => Promise<Readonly<{
    data: unknown;
    error: Readonly<{ code?: string | null }> | null;
  }>>;
}>;

export type FlightConsumerLiveCheckoutEvidencePersistence = Readonly<{
  version: "flight-consumer-live-checkout-evidence-persistence-v1";
  migrationVersion:
    typeof FLIGHT_CONSUMER_LIVE_CHECKOUT_EVIDENCE_MIGRATION_VERSION;
  productionLocal: true;
  routeExposed: false;
  duffelTransportImplemented: false;
  stripeTransportImplemented: false;
  databaseApplyAuthorized: false;
  providerDispatchAuthorized: false;
  stripeDispatchAuthorized: false;
  bookingAuthorized: false;
  orderAuthorized: false;
  paymentAuthorized: false;
  captureAuthorized: false;
  refundAuthorized: false;
  settlementAuthorized: false;
  ticketingAuthorized: false;
  servicingAuthorized: false;
  consumerReleaseEnabled: false;
  prepare: (
    input: z.input<typeof prepareInputSchema>,
  ) => Promise<z.output<typeof prepareResultSchema>>;
  finalize: (
    input: z.input<typeof finalizeInputSchema>,
  ) => Promise<z.output<typeof finalizeResultSchema>>;
  abandon: (
    input: z.input<typeof abandonInputSchema>,
  ) => Promise<z.output<typeof abandonResultSchema>>;
}>;

export class FlightConsumerLiveCheckoutEvidencePersistenceError
  extends Error {
  readonly reason: "invalid_input" | "rpc_refused" | "invalid_result";

  constructor(
    reason: FlightConsumerLiveCheckoutEvidencePersistenceError["reason"],
  ) {
    super("Flight Consumer Live checkout evidence persistence was refused.");
    this.name = "FlightConsumerLiveCheckoutEvidencePersistenceError";
    this.reason = reason;
  }
}

function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new FlightConsumerLiveCheckoutEvidencePersistenceError(
      "invalid_input",
    );
  }
  return parsed.data;
}

async function executeRpc<T>(
  client: FlightConsumerLiveCheckoutEvidenceRpcClient,
  name: string,
  args: Readonly<Record<string, unknown>>,
  schema: z.ZodType<T>,
): Promise<T> {
  let response: Awaited<ReturnType<typeof client.rpc>>;
  try {
    response = await client.rpc(name, args);
  } catch {
    throw new FlightConsumerLiveCheckoutEvidencePersistenceError(
      "rpc_refused",
    );
  }
  if (response.error !== null) {
    throw new FlightConsumerLiveCheckoutEvidencePersistenceError(
      "rpc_refused",
    );
  }
  const rows = z.array(z.unknown()).length(1).safeParse(response.data);
  if (!rows.success) {
    throw new FlightConsumerLiveCheckoutEvidencePersistenceError(
      "invalid_result",
    );
  }
  const parsed = schema.safeParse(rows.data[0]);
  if (!parsed.success) {
    throw new FlightConsumerLiveCheckoutEvidencePersistenceError(
      "invalid_result",
    );
  }
  return Object.freeze(parsed.data);
}

export function createFlightConsumerLiveCheckoutEvidencePersistence(
  client: FlightConsumerLiveCheckoutEvidenceRpcClient,
): FlightConsumerLiveCheckoutEvidencePersistence {
  return Object.freeze({
    version: "flight-consumer-live-checkout-evidence-persistence-v1" as const,
    migrationVersion: FLIGHT_CONSUMER_LIVE_CHECKOUT_EVIDENCE_MIGRATION_VERSION,
    productionLocal: true as const,
    routeExposed: false as const,
    duffelTransportImplemented: false as const,
    stripeTransportImplemented: false as const,
    databaseApplyAuthorized: false as const,
    providerDispatchAuthorized: false as const,
    stripeDispatchAuthorized: false as const,
    bookingAuthorized: false as const,
    orderAuthorized: false as const,
    paymentAuthorized: false as const,
    captureAuthorized: false as const,
    refundAuthorized: false as const,
    settlementAuthorized: false as const,
    ticketingAuthorized: false as const,
    servicingAuthorized: false as const,
    consumerReleaseEnabled: false as const,
    async prepare(input) {
      const value = parseInput(prepareInputSchema, input);
      return executeRpc(
        client,
        FLIGHT_CONSUMER_LIVE_CHECKOUT_EVIDENCE_RPC.prepare,
        {
          p_customer_id: value.customerId,
          p_order_id: value.orderId,
          p_execution_scope_sha256: value.executionScopeSha256,
          p_idempotency_sha256: value.idempotencySha256,
          p_checkout_binding_sha256: value.checkoutBindingSha256,
          p_checkout_prerequisite_sha256: value.checkoutPrerequisiteSha256,
          p_offer_refresh_attempt_id: value.offerRefreshAttemptId,
          p_offer_refresh_execution_scope_sha256:
            value.offerRefreshExecutionScopeSha256,
          p_offer_binding_sha256: value.offerBindingSha256,
          p_normalized_offer_sha256: value.normalizedOfferSha256,
          p_offer_terminal_response_sha256:
            value.offerTerminalResponseSha256,
          p_stripe_plan_id: value.stripePlanId,
          p_stripe_plan_sha256: value.stripePlanSha256,
          p_stripe_execution_attempt_id: value.stripeExecutionAttemptId,
          p_stripe_execution_workflow_sha256:
            value.stripeExecutionWorkflowSha256,
          p_stripe_execution_prerequisite_sha256:
            value.stripeExecutionPrerequisiteSha256,
          p_stripe_execution_state_receipt_sha256:
            value.stripeExecutionStateReceiptSha256,
          p_payment_binding_sha256: value.paymentBindingSha256,
          p_order_reference_sha256: value.orderReferenceSha256,
          p_customer_reference_sha256: value.customerReferenceSha256,
          p_amount_cents: value.amountCents,
          p_currency: value.currency,
          p_traveler_payload_ciphertext: value.travelerPayloadCiphertext,
          p_traveler_evidence_sha256: value.travelerEvidenceSha256,
          p_contact_payload_ciphertext: value.contactPayloadCiphertext,
          p_contact_evidence_sha256: value.contactEvidenceSha256,
          p_billing_address_payload_ciphertext:
            value.billingAddressPayloadCiphertext,
          p_billing_address_evidence_sha256:
            value.billingAddressEvidenceSha256,
          p_terms_snapshot_sha256: value.termsSnapshotSha256,
          p_terms_acceptance_sha256: value.termsAcceptanceSha256,
          p_terms_accepted_at: value.termsAcceptedAt,
        },
        prepareResultSchema,
      );
    },
    async finalize(input) {
      const value = parseInput(finalizeInputSchema, input);
      return executeRpc(
        client,
        FLIGHT_CONSUMER_LIVE_CHECKOUT_EVIDENCE_RPC.finalize,
        {
          p_aggregate_id: value.aggregateId,
          p_expected_revision: value.expectedRevision,
          p_execution_scope_sha256: value.executionScopeSha256,
          p_checkout_binding_sha256: value.checkoutBindingSha256,
          p_finalization_evidence_sha256:
            value.finalizationEvidenceSha256,
        },
        finalizeResultSchema,
      );
    },
    async abandon(input) {
      const value = parseInput(abandonInputSchema, input);
      return executeRpc(
        client,
        FLIGHT_CONSUMER_LIVE_CHECKOUT_EVIDENCE_RPC.abandon,
        {
          p_aggregate_id: value.aggregateId,
          p_expected_revision: value.expectedRevision,
          p_execution_scope_sha256: value.executionScopeSha256,
          p_checkout_binding_sha256: value.checkoutBindingSha256,
          p_abandonment_code: value.abandonmentCode,
          p_abandonment_evidence_sha256:
            value.abandonmentEvidenceSha256,
        },
        abandonResultSchema,
      );
    },
  });
}
