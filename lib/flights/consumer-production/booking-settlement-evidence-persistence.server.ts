import "server-only";

import { z } from "zod";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();

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
  blind_retry_authorized: z.literal(false),
} as const;

const prepareInputSchema = z.object({
  checkoutAggregateId: uuidSchema,
  authorizationBridgeReceiptSha256: sha256Schema,
  duffelOrderExecutionId: uuidSchema,
  duffelOrderStateReceiptSha256: sha256Schema,
  stripeCaptureAttemptId: uuidSchema,
  stripeCaptureStateReceiptSha256: sha256Schema,
  checkoutBindingSha256: sha256Schema,
  offerBindingSha256: sha256Schema,
  normalizedOfferSha256: sha256Schema,
  paymentBindingSha256: sha256Schema,
  paymentIntentReferenceSha256: sha256Schema,
  providerOrderReferenceSha256: sha256Schema,
  providerBookingReferenceSha256: sha256Schema,
  chargeReferenceSha256: sha256Schema,
  orderReferenceSha256: sha256Schema,
  customerReferenceSha256: sha256Schema,
  bookingBindingSha256: sha256Schema,
  bookingPrerequisiteSha256: sha256Schema,
  settlementEvidenceSha256: sha256Schema,
  capturedAmountCents: z.number().int().min(50).max(99_999_999),
  currency: z.literal("USD"),
}).strict().superRefine((value, context) => {
  const issue = (path: keyof typeof value, message: string) => {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [path],
      message,
    });
  };
  if (value.orderReferenceSha256 === value.customerReferenceSha256) {
    issue("orderReferenceSha256", "Order and customer bindings must differ.");
  }
  if (
    value.providerOrderReferenceSha256
      === value.providerBookingReferenceSha256
  ) {
    issue(
      "providerBookingReferenceSha256",
      "Provider order and booking bindings must differ.",
    );
  }
  if ([
    value.paymentIntentReferenceSha256,
    value.providerOrderReferenceSha256,
    value.providerBookingReferenceSha256,
  ].includes(value.chargeReferenceSha256)) {
    issue("chargeReferenceSha256", "Charge binding must be independent.");
  }
  const settlementDomains = [
    value.bookingBindingSha256,
    value.bookingPrerequisiteSha256,
    value.settlementEvidenceSha256,
  ];
  if (new Set(settlementDomains).size !== settlementDomains.length) {
    issue(
      "settlementEvidenceSha256",
      "Booking settlement evidence domains must be independent.",
    );
  }
});

const finalizeInputSchema = z.object({
  settlementId: uuidSchema,
  expectedRevision: z.literal(0),
  bookingBindingSha256: sha256Schema,
  preparedReceiptSha256: sha256Schema,
  finalBookingEvidenceSha256: sha256Schema,
}).strict().superRefine((value, context) => {
  if ([
    value.preparedReceiptSha256,
    value.bookingBindingSha256,
  ].includes(value.finalBookingEvidenceSha256)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["finalBookingEvidenceSha256"],
      message: "Final evidence must be domain-separated from settlement inputs.",
    });
  }
});

const baseResultShape = {
  settlement_id: uuidSchema,
  booking_state: z.enum(["prepared", "booked"]),
  booking_revision: z.union([z.literal(0), z.literal(1)]),
  ticketing_state: z.literal("pending"),
  checkout_binding_sha256: sha256Schema,
  offer_binding_sha256: sha256Schema,
  payment_intent_reference_sha256: sha256Schema,
  provider_order_reference_sha256: sha256Schema,
  provider_booking_reference_sha256: sha256Schema,
  charge_reference_sha256: sha256Schema,
  captured_amount_cents: z.number().int().min(50).max(99_999_999),
  currency: z.literal("USD"),
  duffel_livemode: z.literal(true),
  stripe_livemode: z.literal(true),
  state_receipt_sha256: sha256Schema,
  ...authorityResultShape,
} as const;

const prepareResultSchema = z.object({
  decision: z.enum(["created", "replay"]),
  ...baseResultShape,
}).strict().superRefine((value, context) => {
  const validRevision = value.booking_state === "prepared"
    ? value.booking_revision === 0
    : value.booking_revision === 1;
  if (!validRevision || (
    value.decision === "created" && value.booking_state !== "prepared"
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["booking_state"],
      message: "Booking settlement receipt state is invalid.",
    });
  }
});

const finalizeResultSchema = z.object({
  decision: z.enum(["booked", "replay"]),
  ...baseResultShape,
  booking_state: z.literal("booked"),
  booking_revision: z.literal(1),
}).strict();

export const FLIGHT_CONSUMER_LIVE_BOOKING_SETTLEMENT_MIGRATION_VERSION =
  "202608260113" as const;

export const FLIGHT_CONSUMER_LIVE_BOOKING_SETTLEMENT_RPC = Object.freeze({
  prepare: "prepare_flight_consumer_live_booking_settlement_v1",
  finalize: "finalize_flight_consumer_live_booking_settlement_v1",
} as const);

export type FlightConsumerLiveBookingSettlementRpcClient = Readonly<{
  rpc: (
    name: string,
    args: Readonly<Record<string, unknown>>,
  ) => Promise<Readonly<{
    data: unknown;
    error: Readonly<{ code?: string | null }> | null;
  }>>;
}>;

export type FlightConsumerLiveBookingSettlementPersistence = Readonly<{
  version: "flight-consumer-live-booking-settlement-persistence-v1";
  migrationVersion:
    typeof FLIGHT_CONSUMER_LIVE_BOOKING_SETTLEMENT_MIGRATION_VERSION;
  productionDark: true;
  evidenceOnly: true;
  routeExposed: false;
  duffelTransportImplemented: false;
  stripeTransportImplemented: false;
  databaseApplyAuthorized: false;
  exact108TerminalOrderRequired: true;
  exact110AuthorizationBridgeRequired: true;
  exact111TerminalCaptureRequired: true;
  ticketingState: "pending";
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
  blindRetryAuthorized: false;
  prepare: (
    input: z.input<typeof prepareInputSchema>,
  ) => Promise<z.output<typeof prepareResultSchema>>;
  finalize: (
    input: z.input<typeof finalizeInputSchema>,
  ) => Promise<z.output<typeof finalizeResultSchema>>;
}>;

export class FlightConsumerLiveBookingSettlementPersistenceError
  extends Error {
  readonly reason: "invalid_input" | "rpc_refused" | "invalid_result";

  constructor(
    reason: FlightConsumerLiveBookingSettlementPersistenceError["reason"],
  ) {
    super("Flight Consumer Live booking settlement persistence was refused.");
    this.name = "FlightConsumerLiveBookingSettlementPersistenceError";
    this.reason = reason;
  }
}

function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new FlightConsumerLiveBookingSettlementPersistenceError(
      "invalid_input",
    );
  }
  return parsed.data;
}

async function executeRpc<T>(
  client: FlightConsumerLiveBookingSettlementRpcClient,
  name: string,
  args: Readonly<Record<string, unknown>>,
  schema: z.ZodType<T>,
): Promise<T> {
  let response: Awaited<ReturnType<typeof client.rpc>>;
  try {
    response = await client.rpc(name, args);
  } catch {
    throw new FlightConsumerLiveBookingSettlementPersistenceError(
      "rpc_refused",
    );
  }
  if (response.error !== null) {
    throw new FlightConsumerLiveBookingSettlementPersistenceError(
      "rpc_refused",
    );
  }
  const rows = z.array(z.unknown()).length(1).safeParse(response.data);
  if (!rows.success) {
    throw new FlightConsumerLiveBookingSettlementPersistenceError(
      "invalid_result",
    );
  }
  const parsed = schema.safeParse(rows.data[0]);
  if (!parsed.success) {
    throw new FlightConsumerLiveBookingSettlementPersistenceError(
      "invalid_result",
    );
  }
  return Object.freeze(parsed.data);
}

export function createFlightConsumerLiveBookingSettlementPersistence(
  client: FlightConsumerLiveBookingSettlementRpcClient,
): FlightConsumerLiveBookingSettlementPersistence {
  return Object.freeze({
    version: "flight-consumer-live-booking-settlement-persistence-v1" as const,
    migrationVersion:
      FLIGHT_CONSUMER_LIVE_BOOKING_SETTLEMENT_MIGRATION_VERSION,
    productionDark: true as const,
    evidenceOnly: true as const,
    routeExposed: false as const,
    duffelTransportImplemented: false as const,
    stripeTransportImplemented: false as const,
    databaseApplyAuthorized: false as const,
    exact108TerminalOrderRequired: true as const,
    exact110AuthorizationBridgeRequired: true as const,
    exact111TerminalCaptureRequired: true as const,
    ticketingState: "pending" as const,
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
    blindRetryAuthorized: false as const,
    async prepare(input) {
      const value = parseInput(prepareInputSchema, input);
      return executeRpc(
        client,
        FLIGHT_CONSUMER_LIVE_BOOKING_SETTLEMENT_RPC.prepare,
        {
          p_checkout_aggregate_id: value.checkoutAggregateId,
          p_authorization_bridge_receipt_sha256:
            value.authorizationBridgeReceiptSha256,
          p_duffel_order_execution_id: value.duffelOrderExecutionId,
          p_duffel_order_state_receipt_sha256:
            value.duffelOrderStateReceiptSha256,
          p_stripe_capture_attempt_id: value.stripeCaptureAttemptId,
          p_stripe_capture_state_receipt_sha256:
            value.stripeCaptureStateReceiptSha256,
          p_checkout_binding_sha256: value.checkoutBindingSha256,
          p_offer_binding_sha256: value.offerBindingSha256,
          p_normalized_offer_sha256: value.normalizedOfferSha256,
          p_payment_binding_sha256: value.paymentBindingSha256,
          p_payment_intent_reference_sha256:
            value.paymentIntentReferenceSha256,
          p_provider_order_reference_sha256:
            value.providerOrderReferenceSha256,
          p_provider_booking_reference_sha256:
            value.providerBookingReferenceSha256,
          p_charge_reference_sha256: value.chargeReferenceSha256,
          p_order_reference_sha256: value.orderReferenceSha256,
          p_customer_reference_sha256: value.customerReferenceSha256,
          p_booking_binding_sha256: value.bookingBindingSha256,
          p_booking_prerequisite_sha256: value.bookingPrerequisiteSha256,
          p_settlement_evidence_sha256: value.settlementEvidenceSha256,
          p_captured_amount_cents: value.capturedAmountCents,
          p_currency: value.currency,
        },
        prepareResultSchema,
      );
    },
    async finalize(input) {
      const value = parseInput(finalizeInputSchema, input);
      return executeRpc(
        client,
        FLIGHT_CONSUMER_LIVE_BOOKING_SETTLEMENT_RPC.finalize,
        {
          p_settlement_id: value.settlementId,
          p_expected_revision: value.expectedRevision,
          p_booking_binding_sha256: value.bookingBindingSha256,
          p_prepared_receipt_sha256: value.preparedReceiptSha256,
          p_final_booking_evidence_sha256:
            value.finalBookingEvidenceSha256,
        },
        finalizeResultSchema,
      );
    },
  });
}
