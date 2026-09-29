import "server-only";

import { z } from "zod";

import { createAdminClient } from "../../supabase/admin";
import {
  prepareDuffelSandboxCreateOrderBridge,
  projectDuffelSandboxCreateOrderResult,
  readDuffelSandboxProjectedOrderEvidence,
} from "../duffel-sandbox-bridge";
import {
  rehydrateDuffelSandboxOfferEvidence,
  type DuffelDurableOfferEvidenceRecord,
  type DuffelRehydratedOfferEvidence,
  type DuffelTerminalRecoveryOfferEvidence,
} from "../duffel-sandbox-contract";
import {
  copyDuffelHttpTransportRawBody,
  createDuffelTestHttpTransport,
} from "../duffel/http-transport.server";
import {
  createDuffelPreviewTransportDependencies,
} from "../duffel/preview-ports.server";
import type { FlightProviderCreateOrderInput } from "../provider-adapter";
import {
  buildFlightIdempotencyIntent,
  canonicalFlightJson,
  sha256FlightEvidence,
  type FlightCanonicalJsonValue,
} from "../runtime-safety";
import { createFlightConsumerPreviewAuthority } from "./authority.server";
import {
  createFlightConsumerPreviewCompletionLeaseCoordinator,
  type FlightConsumerPreviewCompletionResult,
} from "./completion-lease.server";
import { FlightConsumerPreviewCompletionProcessingError } from "./completion-lease-contract";
import {
  extractVerifiedDuffelPreviewOrderReferences,
  extractVerifiedDuffelPreviewPassengerIds,
} from "./duffel-evidence.server";
import { decideFlightConsumerPreviewDuffelOrderRecovery } from "./duffel-order-recovery-policy";
import {
  createFlightConsumerPreviewDuffelJournal,
  type FlightConsumerPreviewDuffelJournal,
} from "./duffel-journal.server";
import {
  decryptFlightConsumerOrderResponseEvidence,
  encryptFlightConsumerOrderResponseEvidence,
  readFlightConsumerPreviewOfferEvidenceKeyring,
} from "./evidence-crypto.server";
import {
  createFlightConsumerPreviewOfferEvidenceRepository,
  createFlightConsumerPreviewTerminalRecoveryOfferEvidenceRepository,
} from "./offer-evidence-repository.server";
import {
  resolveFlightConsumerPreviewPendingDuffelWebhookLinks,
} from "./pending-duffel-webhook-link.server";
import { createFlightConsumerPreviewPiiRepository } from "./pii-repository.server";
import {
  decryptFlightConsumerPreviewReference,
  encryptFlightConsumerPreviewReference,
  readFlightConsumerPreviewReferenceKeyring,
} from "./reference-crypto.server";
import { requireFlightConsumerPreviewRequestRuntime } from "./runtime-authority.server";
import {
  projectFlightConsumerPreviewTerminalOrderResponse,
  type FlightConsumerPreviewTerminalFinalizationArtifact,
} from "./terminal-response-finalization.server";
import {
  FlightConsumerPreviewStripePaymentError,
  createFlightConsumerPreviewStripePayment,
  type FlightConsumerPreviewStripeCaptureAttestationMismatchReason,
} from "./stripe-payment.server";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();

const orderSchema = z.object({
  id: uuidSchema,
  customer_id: uuidSchema,
  search_id: uuidSchema,
  offer_id: uuidSchema,
  reprice_receipt_id: uuidSchema,
  execution_mode: z.literal("test"),
  execution_scope_sha256: sha256Schema,
  provider_code: z.literal("duffel"),
  currency: z.literal("USD"),
  total_cents: z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform(Number),
  status: z.enum([
    "pending_payment",
    "payment_authorized",
    "order_creating",
    "booked",
    "ticketing_pending",
    "ticketed",
    "requires_review",
    "failed",
    "refunded",
  ]),
  provider_order_ref_sha256: sha256Schema.nullable(),
}).passthrough();

const searchSchema = z.object({
  departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adult_count: z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform(Number),
  child_count: z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform(Number),
  infant_in_seat_count: z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform(Number),
  infant_on_lap_count: z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform(Number),
}).passthrough();

const offerSchema = z.object({
  validating_carrier: z.string().regex(/^[A-Z0-9]{2,3}$/),
}).passthrough();

const paymentSchema = z.object({
  id: uuidSchema,
  processor_reference_ciphertext: z.string().min(16),
  processor_reference_sha256: sha256Schema,
  status: z.enum([
    "requires_payment_method",
    "requires_action",
    "authorized",
    "captured",
    "refund_pending",
    "refunded",
    "cancelled",
    "failed",
    "ambiguous",
  ]),
  authorized_cents: z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform(Number),
  captured_cents: z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform(Number),
  refunded_cents: z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform(Number),
  updated_at: z.string(),
}).passthrough();

const passengerSchema = z.object({
  id: uuidSchema,
  traveler_sequence: z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform(Number),
  traveler_type: z.literal("adult"),
  secure_pii_record_ref: z.string().regex(/^fp_[A-Za-z0-9_-]{16,200}$/),
  pii_record_sha256: sha256Schema,
}).passthrough();

const evidenceContextSchema = z.object({
  receipt_sha256: sha256Schema,
  local_offer_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/),
  reprice_receipt_id: uuidSchema,
  retention_expires_at: z.string(),
}).passthrough();

const operationAttemptSchema = z.object({
  decision: z.enum(["prepared", "replay"]),
  attempt_id: uuidSchema,
  attempt_revision: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  attempt_state: z.enum(["prepared", "dispatching", "blocked", "succeeded", "failed", "ambiguous"]),
}).passthrough();

const captureOperationSchema = z.object({
  attempt_id: uuidSchema,
  customer_id: uuidSchema,
  order_id: uuidSchema,
  payment_id: uuidSchema,
  operation: z.literal("capture"),
  execution_scope_sha256: sha256Schema,
  processor_account_sha256: sha256Schema,
  processor_source_sha256: sha256Schema,
  processor_adapter_version_sha256: sha256Schema,
  payment_binding_receipt_sha256: sha256Schema,
  adapter_source_sha256: sha256Schema,
  operation_authority_receipt_sha256: sha256Schema,
  idempotency_key_sha256: sha256Schema,
  idempotency_request_sha256: sha256Schema,
  request_plan_sha256: sha256Schema,
  request_sha256: sha256Schema,
  request_body_sha256: sha256Schema,
  amount_cents: z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform(Number),
  currency: z.literal("USD"),
  dispatch_not_after: z.string().datetime({ offset: true }),
  attempt_revision: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  attempt_state: z.enum(["prepared", "dispatching", "blocked", "succeeded", "failed", "ambiguous"]),
  processor_object_ref_sha256: sha256Schema.nullable(),
  terminal_http_status: z.number().int().nullable(),
  terminal_response_sha256: sha256Schema.nullable(),
  terminal_response_bytes: z.union([
    z.number().int().nonnegative(),
    z.string().regex(/^\d+$/),
  ]).transform(Number).nullable(),
  terminal_receipt_sha256: sha256Schema.nullable(),
}).passthrough();

const captureApplicationSchema = z.object({
  order_id: uuidSchema,
  order_status: z.literal("payment_authorized"),
  payment_id: uuidSchema,
  payment_status: z.literal("captured"),
}).passthrough();

const captureAttestationMismatchSchema = z.object({
  order_id: uuidSchema,
  order_status: z.literal("requires_review"),
  payment_id: uuidSchema,
  payment_status: z.literal("ambiguous"),
  reconciliation_case_id: uuidSchema,
}).passthrough();

const attemptReceiptSchema = z.object({
  attempt_id: uuidSchema,
  attempt_revision: z.union([z.literal(1), z.literal(2)]),
  attempt_state: z.enum(["dispatching", "blocked", "succeeded", "failed", "ambiguous"]),
}).passthrough();

const finalizationSchema = z.object({
  order_id: uuidSchema,
  order_status: z.literal("ticketed"),
  issued_ticket_count: z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform(Number),
}).passthrough();

const orderRecoverySchema = z.object({
  attempt_id: uuidSchema,
  customer_id: uuidSchema,
  order_id: uuidSchema,
  attempt_revision: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  attempt_state: z.enum(["prepared", "dispatching", "blocked", "succeeded", "failed", "ambiguous"]),
  request_sha256: sha256Schema,
  operation_authority_receipt_sha256: sha256Schema,
  terminal_http_status: z.number().int().nullable(),
  terminal_response_sha256: sha256Schema.nullable(),
  terminal_response_bytes: z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform(Number).nullable(),
  terminal_receipt_sha256: sha256Schema.nullable(),
  dispatch_not_after: z.string().datetime({ offset: true }),
  evidence_available: z.boolean(),
  response_evidence_receipt_sha256: sha256Schema.nullable(),
  response_evidence_retention_expires_at: z.string().nullable(),
}).passthrough();

const orderResponseEvidenceSchema = z.object({
  evidence_id: uuidSchema,
  attempt_id: uuidSchema,
  order_id: uuidSchema,
  customer_id: uuidSchema,
  execution_scope_sha256: sha256Schema,
  provider_response_sha256: sha256Schema,
  evidence_receipt_sha256: sha256Schema,
  key_version: z.string().min(1).max(64),
  iv_base64url: z.string().min(1),
  auth_tag_base64url: z.string().min(1),
  ciphertext_base64url: z.string().min(1),
  aad_sha256: sha256Schema,
  ciphertext_sha256: sha256Schema,
  retention_expires_at: z.string(),
}).passthrough();

const terminalOrderAttemptSchema = z.object({
  id: uuidSchema,
  customer_id: uuidSchema,
  search_id: uuidSchema,
  offer_id: uuidSchema,
  order_id: uuidSchema,
  operation: z.literal("create_order"),
  provider_code: z.literal("duffel"),
  execution_mode: z.literal("test"),
  execution_scope_sha256: sha256Schema,
  consumer_flow_version: z.union([z.literal(1), z.literal("1")]).transform(Number),
  offer_evidence_receipt_sha256: sha256Schema,
  state: z.literal("succeeded"),
  revision: z.union([z.literal(2), z.literal("2")]).transform(Number),
  terminal_response_sha256: sha256Schema,
  terminal_response_bytes: z.union([
    z.number().int().positive(),
    z.string().regex(/^\d+$/),
  ]).transform(Number),
  terminal_receipt_sha256: sha256Schema,
  dispatch_started_at: z.string().datetime({ offset: true }),
  completed_at: z.string().datetime({ offset: true }),
}).passthrough();

type Order = z.infer<typeof orderSchema>;
type Search = z.infer<typeof searchSchema>;
type Payment = z.infer<typeof paymentSchema>;
type Passenger = z.infer<typeof passengerSchema>;

export class FlightConsumerPreviewCompleteOrderError extends Error {
  constructor() {
    super("The test booking could not be finalized automatically.");
    this.name = "FlightConsumerPreviewCompleteOrderError";
  }
}

function oneRow<T>(schema: z.ZodType<T>, value: unknown) {
  const parsed = z.array(schema).length(1).safeParse(value);
  if (!parsed.success) throw new FlightConsumerPreviewCompleteOrderError();
  return parsed.data[0]!;
}

async function loadState(customerId: string, orderId: string, executionScopeSha256: string) {
  const admin = createAdminClient();
  const orderResult = await admin.from("flight_orders")
    .select("id,customer_id,search_id,offer_id,reprice_receipt_id,execution_mode,execution_scope_sha256,provider_code,currency,total_cents,status,provider_order_ref_sha256")
    .eq("id", orderId)
    .eq("customer_id", customerId)
    .eq("execution_mode", "test")
    .eq("execution_scope_sha256", executionScopeSha256)
    .eq("provider_code", "duffel")
    .maybeSingle();
  if (orderResult.error || !orderResult.data) throw new FlightConsumerPreviewCompleteOrderError();
  const order = orderSchema.parse(orderResult.data);
  const [searchResult, offerResult, paymentResult, passengerResult] = await Promise.all([
    admin.from("flight_searches")
      .select("departure_date,adult_count,child_count,infant_in_seat_count,infant_on_lap_count")
      .eq("id", order.search_id)
      .eq("customer_id", customerId)
      .eq("execution_mode", "test")
      .eq("execution_scope_sha256", executionScopeSha256)
      .maybeSingle(),
    admin.from("flight_offers")
      .select("validating_carrier")
      .eq("id", order.offer_id)
      .eq("search_id", order.search_id)
      .eq("provider_code", "duffel")
      .eq("execution_mode", "test")
      .eq("execution_scope_sha256", executionScopeSha256)
      .maybeSingle(),
    admin.from("flight_payments")
      .select("id,processor_reference_ciphertext,processor_reference_sha256,status,authorized_cents,captured_cents,refunded_cents,updated_at")
      .eq("order_id", order.id)
      .eq("processor_code", "stripe")
      .eq("execution_mode", "test")
      .eq("execution_scope_sha256", executionScopeSha256)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from("flight_passenger_refs")
      .select("id,traveler_sequence,traveler_type,secure_pii_record_ref,pii_record_sha256")
      .eq("order_id", order.id)
      .eq("execution_mode", "test")
      .eq("execution_scope_sha256", executionScopeSha256)
      .order("traveler_sequence", { ascending: true }),
  ]);
  if (
    searchResult.error || !searchResult.data
    || offerResult.error || !offerResult.data
    || paymentResult.error || !paymentResult.data
    || passengerResult.error || !Array.isArray(passengerResult.data)
  ) throw new FlightConsumerPreviewCompleteOrderError();
  const passengers = z.array(passengerSchema).min(1).max(9).parse(passengerResult.data);
  return Object.freeze({
    order,
    search: searchSchema.parse(searchResult.data),
    offer: offerSchema.parse(offerResult.data),
    payment: paymentSchema.parse(paymentResult.data),
    passengers: Object.freeze(passengers),
  });
}

function travelerCount(search: Search) {
  return search.adult_count + search.child_count
    + search.infant_in_seat_count + search.infant_on_lap_count;
}

async function evidenceContext(order: Order) {
  const result = await createAdminClient().rpc("get_flight_consumer_offer_evidence_context_v1", {
    p_customer_id: order.customer_id,
    p_search_id: order.search_id,
    p_offer_id: order.offer_id,
    p_stage: "refreshed",
  });
  if (result.error) throw new FlightConsumerPreviewCompleteOrderError();
  const context = oneRow(evidenceContextSchema, result.data);
  if (context.reprice_receipt_id !== order.reprice_receipt_id) {
    throw new FlightConsumerPreviewCompleteOrderError();
  }
  return context;
}

async function buildOrderPackage(input: Readonly<{
  order: Order;
  search: Search;
  payment: Payment;
  passengers: readonly Passenger[];
  runtime: Awaited<ReturnType<typeof requireFlightConsumerPreviewRequestRuntime>>;
}>) {
  if (
    input.search.child_count !== 0
    || input.search.infant_in_seat_count !== 0
    || input.search.infant_on_lap_count !== 0
    || input.passengers.length !== travelerCount(input.search)
    || input.passengers.some((row, index) => row.traveler_sequence !== index + 1)
  ) throw new FlightConsumerPreviewCompleteOrderError();
  const context = await evidenceContext(input.order);
  const repository = await createFlightConsumerPreviewOfferEvidenceRepository({
    customerId: input.order.customer_id,
    searchId: input.order.search_id,
    offerId: input.order.offer_id,
    localOfferId: context.local_offer_id,
  });
  const scope = Object.freeze({
    tenantId: "tenant_iratepilot_preview_0001" as const,
    commerceId: input.order.search_id,
    actorId: input.order.customer_id,
  });
  const loaded = await repository.verifyAndLoadOfferEvidence(context.receipt_sha256, scope);
  if (loaded.decision !== "verified" || loaded.record.stage !== "refreshed") {
    throw new FlightConsumerPreviewCompleteOrderError();
  }
  const refreshedBytes = Buffer.from(loaded.record.rawBodyBase64, "base64");
  try {
    const refreshed = await rehydrateDuffelSandboxOfferEvidence(
      repository,
      context.receipt_sha256,
      scope,
    );
    if (
      refreshed.evidence.version !== "duffel-refreshed-offer-v1"
      || refreshed.snapshot.total.currency !== input.order.currency
      || refreshed.snapshot.total.amountMinor !== input.order.total_cents
      || refreshed.snapshot.segments.length < 1
    ) throw new FlightConsumerPreviewCompleteOrderError();
    const providerPassengerIds = extractVerifiedDuffelPreviewPassengerIds({
      rawBody: refreshedBytes,
      expectedPassengerIdDigests: refreshed.evidence.providerPassengerIdDigests,
      expectedCount: input.passengers.length,
    });
    const piiRepository = await createFlightConsumerPreviewPiiRepository({
      customerId: input.order.customer_id,
      orderId: input.order.id,
    });
    const travelerBindings = input.passengers.map((passenger) => Object.freeze({
      travelerRef: passenger.secure_pii_record_ref,
      piiRecordDigest: passenger.pii_record_sha256,
    }));
    const resolver = piiRepository.createTravelerResolver(input.passengers.map((passenger, index) => ({
      travelerSequence: passenger.traveler_sequence,
      providerPassengerId: providerPassengerIds[index]!,
      departureDate: input.search.departure_date,
      scope,
      binding: travelerBindings[index]!,
    })));
    const authority = createFlightConsumerPreviewAuthority(input.runtime.binding);
    const settlement = authority.settlement({
      customerId: input.order.customer_id,
      orderId: input.order.id,
      amountCents: input.order.total_cents,
      currency: input.order.currency,
    });
    const termsAcceptanceReceiptSha256 = authority.termsAcceptanceReceipt({
      customerId: input.order.customer_id,
      orderId: input.order.id,
      repriceReceiptId: input.order.reprice_receipt_id,
      refreshedOfferReceiptSha256: context.receipt_sha256,
      termsDigest: refreshed.evidence.termsDigest,
      amountCents: input.order.total_cents,
      currency: input.order.currency,
    });
    const withoutIdempotency = Object.freeze({
      offerId: refreshed.snapshot.offerId,
      acceptedTermsDigest: refreshed.evidence.termsDigest,
      offerRefreshReceiptDigest: refreshed.receiptDigest,
      total: refreshed.snapshot.total,
      travelers: Object.freeze(travelerBindings),
      settlementIntent: Object.freeze({
        method: "provider_balance" as const,
        amount: refreshed.snapshot.total,
        settlementBindingDigest: settlement.settlementBindingDigest,
      }),
    });
    const providerInput: FlightProviderCreateOrderInput = Object.freeze({
      ...withoutIdempotency,
      idempotency: buildFlightIdempotencyIntent({
        operation: "create_order",
        scopeId: scope.commerceId,
        requestId: input.order.id,
        payload: withoutIdempotency as unknown as FlightCanonicalJsonValue,
      }),
    });
    const evaluatedAt = new Date().toISOString();
    const bridgePackage = await prepareDuffelSandboxCreateOrderBridge({
      repository,
      refreshedOfferReceiptDigest: context.receipt_sha256,
      providerInput,
      settlementBinding: settlement.settlementBinding,
      travelerResolver: resolver,
      authorityVerifier: authority.orderCreateVerifier(evaluatedAt),
      termsAcceptanceReceiptDigest: termsAcceptanceReceiptSha256,
      settlementAuthorityReceiptDigest: settlement.settlementAuthorityReceiptSha256,
      scope,
    });
    const paymentBindingReceiptSha256 = authority.paymentBindingReceipt({
      customerId: input.order.customer_id,
      orderId: input.order.id,
      paymentId: input.payment.id,
      processorReferenceSha256: input.payment.processor_reference_sha256,
      amountCents: input.order.total_cents,
      currency: input.order.currency,
    });
    return Object.freeze({
      authority,
      bridgePackage,
      context,
      outboundDepartureAt: refreshed.snapshot.segments[0]!.departsAt,
      providerPassengerIds,
      paymentBindingReceiptSha256,
      providerSettlementBindingReceiptSha256:
        settlement.providerSettlementBindingReceiptSha256,
    });
  } finally {
    refreshedBytes.fill(0);
  }
}

export async function loadFlightConsumerPreviewOrderFinalizationState(input: Readonly<{
  customerId: string;
  orderId: string;
  executionScopeSha256: string;
}>) {
  return loadState(input.customerId, input.orderId, input.executionScopeSha256);
}

export async function buildFlightConsumerPreviewOrderFinalizationPackage(input: Readonly<{
  state: Awaited<ReturnType<typeof loadState>>;
  runtime: Awaited<ReturnType<typeof requireFlightConsumerPreviewRequestRuntime>>;
}>) {
  return buildOrderPackage({ ...input.state, runtime: input.runtime });
}

function paymentIntentId(input: Readonly<{
  customerId: string;
  orderId: string;
  payment: Payment;
  executionScopeSha256: string;
}>) {
  return decryptFlightConsumerPreviewReference({
    ciphertext: input.payment.processor_reference_ciphertext,
    expectedReferenceSha256: input.payment.processor_reference_sha256,
    context: {
      kind: "stripe_payment_intent",
      customerId: input.customerId,
      resourceId: input.orderId,
      executionScopeSha256: input.executionScopeSha256,
    },
    keyring: readFlightConsumerPreviewReferenceKeyring(),
  });
}

async function observeAuthorization(input: Readonly<{
  order: Order;
  payment: Payment;
  paymentIntentId: string;
  stripe: Awaited<ReturnType<typeof createFlightConsumerPreviewStripePayment>>;
}>) {
  const snapshot = await input.stripe.retrievePaymentIntent({ paymentIntentId: input.paymentIntentId });
  let observedStatus:
    | "requires_payment_method"
    | "requires_action"
    | "requires_capture"
    | "failed"
    | "cancelled"
    | "uncertain";
  let authorizedCents = 0;
  if (snapshot.decision === "authorized") {
    observedStatus = "requires_capture";
    authorizedCents = snapshot.amountCapturableCents;
  } else if (snapshot.decision === "awaiting_payment_method" || snapshot.decision === "awaiting_confirmation") {
    observedStatus = "requires_payment_method";
  } else if (snapshot.decision === "action_required") {
    observedStatus = "requires_action";
  } else if (snapshot.decision === "canceled") {
    observedStatus = "cancelled";
  } else {
    observedStatus = "uncertain";
  }
  const observationSha256 = sha256FlightEvidence({
    version: "flight-consumer-preview-stripe-authorization-observation-v1",
    customerId: input.order.customer_id,
    orderId: input.order.id,
    paymentId: input.payment.id,
    processorReferenceSha256: input.payment.processor_reference_sha256,
    observedStatus,
    authorizedCents,
    snapshot: snapshot as unknown as FlightCanonicalJsonValue,
  });
  const result = await createAdminClient().rpc("record_flight_consumer_payment_authorization_v1", {
    p_order_id: input.order.id,
    p_payment_id: input.payment.id,
    p_expected_updated_at: input.payment.updated_at,
    p_processor_reference_sha256: input.payment.processor_reference_sha256,
    p_observation_sha256: observationSha256,
    p_observed_status: observedStatus,
    p_authorized_cents: authorizedCents,
  });
  if (result.error || observedStatus !== "requires_capture") {
    throw new FlightConsumerPreviewCompleteOrderError();
  }
}

type CaptureOperation = z.infer<typeof captureOperationSchema>;

async function readCaptureOperation(customerId: string, orderId: string) {
  const result = await createAdminClient().rpc("get_flight_consumer_payment_operation_v1", {
    p_customer_id: customerId,
    p_order_id: orderId,
    p_operation: "capture",
  });
  if (result.error) throw new FlightConsumerPreviewCompleteOrderError();
  const parsed = z.array(captureOperationSchema).max(1).safeParse(result.data);
  if (!parsed.success) throw new FlightConsumerPreviewCompleteOrderError();
  return parsed.data[0] ?? null;
}

function captureOperationStateIsValid(operation: CaptureOperation) {
  const responseEvidencePresent = operation.terminal_http_status !== null
    && operation.terminal_response_sha256 !== null
    && operation.terminal_response_bytes !== null;
  const responseEvidenceAbsent = operation.terminal_http_status === null
    && operation.terminal_response_sha256 === null
    && operation.terminal_response_bytes === null;
  if (operation.processor_object_ref_sha256 !== null) return false;
  if (operation.attempt_state === "prepared") {
    return operation.attempt_revision === 0
      && responseEvidenceAbsent
      && operation.terminal_receipt_sha256 === null;
  }
  if (operation.attempt_state === "dispatching") {
    return operation.attempt_revision === 1
      && responseEvidenceAbsent
      && operation.terminal_receipt_sha256 === null;
  }
  if (operation.attempt_state === "blocked") {
    return operation.attempt_revision === 1
      && responseEvidenceAbsent
      && operation.terminal_receipt_sha256 !== null;
  }
  if (operation.attempt_state === "ambiguous") {
    return operation.attempt_revision === 2
      && responseEvidenceAbsent
      && operation.terminal_receipt_sha256 !== null;
  }
  if (operation.attempt_state === "succeeded") {
    return operation.attempt_revision === 2
      && responseEvidencePresent
      && operation.terminal_http_status! >= 200
      && operation.terminal_http_status! <= 299
      && operation.terminal_receipt_sha256 !== null;
  }
  return operation.attempt_revision === 2
    && responseEvidencePresent
    && operation.terminal_http_status! >= 300
    && operation.terminal_http_status! <= 599
    && operation.terminal_receipt_sha256 !== null;
}

function captureOperationMatches(input: Readonly<{
  operation: CaptureOperation;
  order: Order;
  payment: Payment;
  keySha256: string;
  requestSha256: string;
  paymentBindingReceiptSha256: string;
  operationAuthorityReceiptSha256: string;
  runtime: Awaited<ReturnType<typeof requireFlightConsumerPreviewRequestRuntime>>;
  requireCurrentMutationAuthority: boolean;
}>) {
  const { operation, order, payment, runtime } = input;
  return captureOperationStateIsValid(operation)
    && operation.customer_id === order.customer_id
    && operation.order_id === order.id
    && operation.payment_id === payment.id
    && operation.execution_scope_sha256 === runtime.binding.executionScopeSha256
    && (!input.requireCurrentMutationAuthority
      || (
        operation.processor_account_sha256 === runtime.binding.paymentAccountSha256
        && operation.processor_source_sha256 === runtime.binding.paymentSourceSha256
        && operation.processor_adapter_version_sha256
          === runtime.binding.paymentAdapterVersionSha256
        && operation.payment_binding_receipt_sha256 === input.paymentBindingReceiptSha256
        && operation.adapter_source_sha256 === runtime.binding.paymentSourceSha256
        && operation.operation_authority_receipt_sha256
          === input.operationAuthorityReceiptSha256
      ))
    && operation.idempotency_key_sha256 === input.keySha256
    && operation.idempotency_request_sha256 === input.requestSha256
    && operation.request_plan_sha256 === input.requestSha256
    && operation.request_sha256 === input.requestSha256
    && operation.request_body_sha256 === input.requestSha256
    && operation.amount_cents === order.total_cents
    && operation.currency === order.currency;
}

function logCaptureWorkflowFailure(
  phase: string,
  error: unknown,
  durable: Readonly<{ state: string; revision: number }> | null,
) {
  console.error("[flight-consumer-preview:complete-order] capture workflow failed", {
    phase,
    category: error instanceof FlightConsumerPreviewStripePaymentError
      ? "stripe_adapter_guard"
      : error instanceof z.ZodError
        ? "schema_projection_rejected"
        : error instanceof FlightConsumerPreviewCompleteOrderError
          ? "workflow_guard"
          : "unexpected_failure",
    stripePhase: error instanceof FlightConsumerPreviewStripePaymentError
      ? error.phase
      : null,
    durableState: durable?.state ?? null,
    durableRevision: durable?.revision ?? null,
  });
}

async function applyCapturedPayment(input: Readonly<{
  attemptId: string;
  order: Order;
  payment: Payment;
}>) {
  const appliedResult = await createAdminClient().rpc("apply_flight_consumer_capture_v1", {
    p_attempt_id: input.attemptId,
    p_expected_terminal_revision: 2,
    p_payment_id: input.payment.id,
    p_processor_reference_sha256: input.payment.processor_reference_sha256,
  });
  if (appliedResult.error) throw new FlightConsumerPreviewCompleteOrderError();
  const applied = oneRow(captureApplicationSchema, appliedResult.data);
  if (applied.order_id !== input.order.id || applied.payment_id !== input.payment.id) {
    throw new FlightConsumerPreviewCompleteOrderError();
  }
}

type CaptureAttestationMismatchReason =
  | FlightConsumerPreviewStripeCaptureAttestationMismatchReason
  | "historical_binding_mismatch";

async function recordCaptureAttestationMismatch(input: Readonly<{
  order: Order;
  payment: Payment;
  captureAttemptId: string;
  reason: CaptureAttestationMismatchReason;
  observationSha256: string;
}>) {
  const result = await createAdminClient().rpc(
    "record_flight_consumer_capture_attestation_mismatch_v1",
    {
      p_order_id: input.order.id,
      p_payment_id: input.payment.id,
      p_capture_attempt_id: input.captureAttemptId,
      p_expected_capture_revision: 2,
      p_processor_reference_sha256: input.payment.processor_reference_sha256,
      p_mismatch_reason: input.reason,
      p_observation_sha256: input.observationSha256,
    },
  );
  if (result.error) throw new FlightConsumerPreviewCompleteOrderError();
  const recorded = oneRow(captureAttestationMismatchSchema, result.data);
  if (recorded.order_id !== input.order.id || recorded.payment_id !== input.payment.id) {
    throw new FlightConsumerPreviewCompleteOrderError();
  }
}

async function attestCapturedPaymentBeforeDuffelClaim(input: Readonly<{
  order: Order;
  payment: Payment;
  paymentIntentId: string;
  paymentBindingReceiptSha256: string;
  authority: ReturnType<typeof createFlightConsumerPreviewAuthority>;
  runtime: Awaited<ReturnType<typeof requireFlightConsumerPreviewRequestRuntime>>;
  stripe: Awaited<ReturnType<typeof createFlightConsumerPreviewStripePayment>>;
}>) {
  const operation = await readCaptureOperation(input.order.customer_id, input.order.id);
  if (operation === null) throw new FlightConsumerPreviewCompleteOrderError();
  const keySha256 = sha256FlightEvidence({
    version: "flight-consumer-preview-capture-identity-v1",
    orderId: input.order.id,
    paymentId: input.payment.id,
    processorReferenceSha256: input.payment.processor_reference_sha256,
  });
  const requestSha256 = sha256FlightEvidence({
    version: "flight-consumer-preview-capture-request-v1",
    customerId: input.order.customer_id,
    orderId: input.order.id,
    paymentId: input.payment.id,
    amountCents: input.order.total_cents,
    currency: input.order.currency,
    executionScopeSha256: input.runtime.binding.executionScopeSha256,
  });
  const operationAuthorityReceiptSha256 = input.authority.operationReceipt(
    "stripe-capture-authority",
    {
      requestSha256,
      runtimeControlReceiptSha256: input.runtime.binding.runtimeControlReceiptSha256,
    },
  );
  const immutableTerminalMatches = captureOperationMatches({
    operation,
    order: input.order,
    payment: input.payment,
    keySha256,
    requestSha256,
    paymentBindingReceiptSha256: input.paymentBindingReceiptSha256,
    operationAuthorityReceiptSha256,
    runtime: input.runtime,
    requireCurrentMutationAuthority: false,
  }) && operation.attempt_state === "succeeded" && operation.attempt_revision === 2;
  if (!immutableTerminalMatches) throw new FlightConsumerPreviewCompleteOrderError();
  const currentDispatchBindingMatches = captureOperationMatches({
    operation,
    order: input.order,
    payment: input.payment,
    keySha256,
    requestSha256,
    paymentBindingReceiptSha256: input.paymentBindingReceiptSha256,
    operationAuthorityReceiptSha256,
    runtime: input.runtime,
    requireCurrentMutationAuthority: true,
  });
  if (!currentDispatchBindingMatches) {
    await recordCaptureAttestationMismatch({
      order: input.order,
      payment: input.payment,
      captureAttemptId: operation.attempt_id,
      reason: "historical_binding_mismatch",
      observationSha256: sha256FlightEvidence({
        version: "flight-consumer-preview-capture-dispatch-binding-mismatch-v1",
        captureAttemptId: operation.attempt_id,
        storedProcessorAccountSha256: operation.processor_account_sha256,
        storedProcessorSourceSha256: operation.processor_source_sha256,
        storedProcessorAdapterVersionSha256: operation.processor_adapter_version_sha256,
        storedPaymentBindingReceiptSha256: operation.payment_binding_receipt_sha256,
        currentProcessorAccountSha256: input.runtime.binding.paymentAccountSha256,
        currentProcessorSourceSha256: input.runtime.binding.paymentSourceSha256,
        currentProcessorAdapterVersionSha256:
          input.runtime.binding.paymentAdapterVersionSha256,
        currentPaymentBindingReceiptSha256: input.paymentBindingReceiptSha256,
      }),
    });
    throw new FlightConsumerPreviewCompleteOrderError();
  }
  const attestation = await input.stripe.attestCapturedPaymentIntent({
    paymentIntentId: input.paymentIntentId,
  });
  if (attestation.decision === "unavailable") {
    // Availability and malformed-response failures remain retryable. They
    // refuse this claim but are not false financial mismatch evidence.
    throw new FlightConsumerPreviewCompleteOrderError();
  }
  if (attestation.decision === "mismatch") {
    await recordCaptureAttestationMismatch({
      order: input.order,
      payment: input.payment,
      captureAttemptId: operation.attempt_id,
      reason: attestation.reason,
      observationSha256: attestation.evidenceSha256,
    });
    throw new FlightConsumerPreviewCompleteOrderError();
  }
}

export async function capturePayment(input: Readonly<{
  order: Order;
  payment: Payment;
  paymentIntentId: string;
  paymentBindingReceiptSha256: string;
  authority: ReturnType<typeof createFlightConsumerPreviewAuthority>;
  runtime: Awaited<ReturnType<typeof requireFlightConsumerPreviewRequestRuntime>>;
  stripe: Awaited<ReturnType<typeof createFlightConsumerPreviewStripePayment>>;
}>) {
  const keySha256 = sha256FlightEvidence({
    version: "flight-consumer-preview-capture-identity-v1",
    orderId: input.order.id,
    paymentId: input.payment.id,
    processorReferenceSha256: input.payment.processor_reference_sha256,
  });
  const requestSha256 = sha256FlightEvidence({
    version: "flight-consumer-preview-capture-request-v1",
    customerId: input.order.customer_id,
    orderId: input.order.id,
    paymentId: input.payment.id,
    amountCents: input.order.total_cents,
    currency: input.order.currency,
    executionScopeSha256: input.runtime.binding.executionScopeSha256,
  });
  const operationAuthorityReceiptSha256 = input.authority.operationReceipt("stripe-capture-authority", {
    requestSha256,
    runtimeControlReceiptSha256: input.runtime.binding.runtimeControlReceiptSha256,
  });
  let phase = "read_capture_operation";
  let durable: { state: string; revision: number } | null = null;
  let operation: CaptureOperation | null = null;
  let terminalizationAttempted = false;
  try {
    operation = await readCaptureOperation(input.order.customer_id, input.order.id);
    if (operation === null) {
      phase = "prepare_capture_operation";
      const preparedResult = await createAdminClient().rpc("prepare_flight_consumer_capture_v1", {
        p_order_id: input.order.id,
        p_payment_id: input.payment.id,
        p_key_sha256: keySha256,
        p_request_sha256: requestSha256,
        p_adapter_source_sha256: input.runtime.binding.paymentSourceSha256,
        p_payment_binding_receipt_sha256: input.paymentBindingReceiptSha256,
        p_operation_authority_receipt_sha256: operationAuthorityReceiptSha256,
        p_dispatch_not_after: new Date(Date.now() + 4 * 60_000).toISOString(),
      });
      if (preparedResult.error) throw new FlightConsumerPreviewCompleteOrderError();
      const prepared = oneRow(operationAttemptSchema, preparedResult.data);
      phase = "read_prepared_capture_operation";
      operation = await readCaptureOperation(input.order.customer_id, input.order.id);
      if (operation === null || operation.attempt_id !== prepared.attempt_id) {
        throw new FlightConsumerPreviewCompleteOrderError();
      }
    }

    durable = { state: operation.attempt_state, revision: operation.attempt_revision };
    const dispatchDeadlineMs = Date.parse(operation.dispatch_not_after);
    const authorityExpired = dispatchDeadlineMs <= Date.now();
    // Prepared/current dispatches require the live binding because they may
    // still mutate Stripe. Terminal or expired journals are historical: they
    // may only retrieve the exact PaymentIntent through the current connector.
    // If that connector cannot see the old object, recovery fails closed and
    // never retains an old secret or sends another capture.
    const mutationEligible = !authorityExpired
      && ["prepared", "dispatching"].includes(operation.attempt_state);
    phase = "validate_capture_operation";
    if (!captureOperationMatches({
      operation,
      order: input.order,
      payment: input.payment,
      keySha256,
      requestSha256,
      paymentBindingReceiptSha256: input.paymentBindingReceiptSha256,
      operationAuthorityReceiptSha256,
      runtime: input.runtime,
      requireCurrentMutationAuthority: mutationEligible,
    })) throw new FlightConsumerPreviewCompleteOrderError();

    if (operation.attempt_state === "prepared" && authorityExpired) {
      phase = "block_expired_prepared_capture";
      terminalizationAttempted = true;
      const blockedResult = await createAdminClient().rpc(
        "complete_flight_consumer_payment_operation_v1",
        {
          p_attempt_id: operation.attempt_id,
          p_expected_revision: 0,
          p_terminal_state: "blocked",
          p_terminal_http_status: null,
          p_terminal_response_sha256: null,
          p_terminal_response_bytes: null,
          p_terminal_receipt_sha256: input.authority.operationReceipt("stripe-capture-expired", {
            attemptId: operation.attempt_id,
            requestSha256,
            dispatchNotAfter: operation.dispatch_not_after,
          }),
        },
      );
      if (blockedResult.error) throw new FlightConsumerPreviewCompleteOrderError();
      durable = { state: "blocked", revision: 1 };
      const blocked = oneRow(attemptReceiptSchema, blockedResult.data);
      if (
        blocked.attempt_id !== operation.attempt_id
        || blocked.attempt_state !== "blocked"
        || blocked.attempt_revision !== 1
      ) {
        throw new FlightConsumerPreviewCompleteOrderError();
      }
      throw new FlightConsumerPreviewCompleteOrderError();
    }

    if (["blocked", "failed", "ambiguous"].includes(operation.attempt_state)) {
      throw new FlightConsumerPreviewCompleteOrderError();
    }

    if (operation.attempt_state === "prepared") {
      phase = "claim_capture_operation";
      const claimResult = await createAdminClient().rpc("claim_flight_consumer_payment_operation_v1", {
        p_attempt_id: operation.attempt_id,
        p_expected_revision: 0,
        p_payment_binding_receipt_sha256: operation.payment_binding_receipt_sha256,
        p_operation_authority_receipt_sha256: operation.operation_authority_receipt_sha256,
      });
      if (claimResult.error) throw new FlightConsumerPreviewCompleteOrderError();
      durable = { state: "dispatching", revision: 1 };
      const claimed = oneRow(attemptReceiptSchema, claimResult.data);
      if (
        claimed.attempt_id !== operation.attempt_id
        || claimed.attempt_state !== "dispatching"
        || claimed.attempt_revision !== 1
      ) throw new FlightConsumerPreviewCompleteOrderError();
    }

    // Claim/database latency can consume the remaining window. Re-read the
    // trusted projected deadline immediately before choosing a provider path.
    const dispatchAuthorityExpired = dispatchDeadlineMs <= Date.now();
    let terminalProjection: FlightCanonicalJsonValue | null = null;
    if (operation.attempt_state === "succeeded") {
      phase = "attest_succeeded_capture";
      const attestation = await input.stripe.attestCapturedPaymentIntent({
        paymentIntentId: input.paymentIntentId,
      });
      if (attestation.decision === "unavailable") {
        throw new FlightConsumerPreviewCompleteOrderError();
      }
      if (attestation.decision === "mismatch") {
        phase = "record_succeeded_capture_attestation_mismatch";
        await recordCaptureAttestationMismatch({
          order: input.order,
          payment: input.payment,
          captureAttemptId: operation.attempt_id,
          reason: attestation.reason,
          observationSha256: attestation.evidenceSha256,
        });
        throw new FlightConsumerPreviewCompleteOrderError();
      }
    } else if (durable?.state === "dispatching" && dispatchAuthorityExpired) {
      phase = "retrieve_expired_dispatching_capture";
      const snapshot = await input.stripe.retrievePaymentIntent({
        paymentIntentId: input.paymentIntentId,
      });
      if (
        snapshot.paymentIntentId !== input.paymentIntentId
        || snapshot.amountCents !== input.order.total_cents
        || snapshot.currency !== "usd"
      ) throw new FlightConsumerPreviewCompleteOrderError();
      if (
        snapshot.decision === "captured"
        && snapshot.amountReceivedCents === input.order.total_cents
      ) {
        terminalProjection = Object.freeze({
          version: "flight-consumer-preview-stripe-capture-recovery-terminal-v1",
          decision: "observed_captured",
          paymentIntentId: snapshot.paymentIntentId,
          amountCapturedCents: snapshot.amountReceivedCents,
          currency: snapshot.currency,
        });
      } else {
        phase = "review_expired_uncaptured_dispatch";
        terminalizationAttempted = true;
        const ambiguousResult = await createAdminClient().rpc(
          "complete_flight_consumer_payment_operation_v1",
          {
            p_attempt_id: operation.attempt_id,
            p_expected_revision: 1,
            p_terminal_state: "ambiguous",
            p_terminal_http_status: null,
            p_terminal_response_sha256: null,
            p_terminal_response_bytes: null,
            p_terminal_receipt_sha256: input.authority.operationReceipt(
              "stripe-capture-expired-dispatch",
              {
                attemptId: operation.attempt_id,
                requestSha256,
                observedDecision: snapshot.decision,
              },
            ),
          },
        );
        if (ambiguousResult.error) throw new FlightConsumerPreviewCompleteOrderError();
        durable = { state: "ambiguous", revision: 2 };
        const ambiguous = oneRow(attemptReceiptSchema, ambiguousResult.data);
        if (
          ambiguous.attempt_id !== operation.attempt_id
          || ambiguous.attempt_state !== "ambiguous"
          || ambiguous.attempt_revision !== 2
        ) throw new FlightConsumerPreviewCompleteOrderError();
        throw new FlightConsumerPreviewCompleteOrderError();
      }
    } else {
      // The Stripe port retrieves first and reuses the exact attempt UUID for
      // its idempotency key, so only this still-current dispatch is recoverable.
      if (durable?.state !== "dispatching" || dispatchDeadlineMs <= Date.now()) {
        throw new FlightConsumerPreviewCompleteOrderError();
      }
      phase = "recover_current_dispatching_capture";
      const captured = await input.stripe.capturePaymentIntent({
        paymentIntentId: input.paymentIntentId,
        attemptId: operation.attempt_id,
      });
      if (
        captured.paymentIntentId !== input.paymentIntentId
        || captured.amountCapturedCents !== input.order.total_cents
        || captured.currency !== "usd"
      ) throw new FlightConsumerPreviewCompleteOrderError();
      terminalProjection = Object.freeze({
        version: "flight-consumer-preview-stripe-capture-terminal-v1",
        paymentIntentId: captured.paymentIntentId,
        amountCapturedCents: captured.amountCapturedCents,
        currency: captured.currency,
        paymentIdempotencyKeySha256: captured.paymentIdempotencyKeySha256,
      });
    }

    if (operation.attempt_state !== "succeeded") {
      if (terminalProjection === null) throw new FlightConsumerPreviewCompleteOrderError();
      phase = "complete_capture_operation";
      const terminalBody = Buffer.from(canonicalFlightJson(terminalProjection), "utf8");
      try {
        const terminalResponseSha256 = sha256FlightEvidence({
          version: "flight-consumer-preview-stripe-capture-response-v1",
          projection: terminalProjection,
        });
        const terminalReceiptSha256 = input.authority.operationReceipt("stripe-capture-terminal", {
          attemptId: operation.attempt_id,
          terminalResponseSha256,
          terminalResponseBytes: terminalBody.byteLength,
        });
        terminalizationAttempted = true;
        const completedResult = await createAdminClient().rpc(
          "complete_flight_consumer_payment_operation_v1",
          {
            p_attempt_id: operation.attempt_id,
            p_expected_revision: 1,
            p_terminal_state: "succeeded",
            p_terminal_http_status: 200,
            p_terminal_response_sha256: terminalResponseSha256,
            p_terminal_response_bytes: terminalBody.byteLength,
            p_terminal_receipt_sha256: terminalReceiptSha256,
          },
        );
        if (completedResult.error) throw new FlightConsumerPreviewCompleteOrderError();
        // The durable CAS has committed. Update local state before parsing or
        // applying so no later catch can attempt a revision-one overwrite.
        durable = { state: "succeeded", revision: 2 };
        const terminal = oneRow(attemptReceiptSchema, completedResult.data);
        if (
          terminal.attempt_id !== operation.attempt_id
          || terminal.attempt_state !== "succeeded"
          || terminal.attempt_revision !== 2
        ) throw new FlightConsumerPreviewCompleteOrderError();
      } finally {
        terminalBody.fill(0);
      }
    }

    phase = "apply_captured_payment";
    await applyCapturedPayment({
      attemptId: operation.attempt_id,
      order: input.order,
      payment: input.payment,
    });
  } catch (error) {
    logCaptureWorkflowFailure(phase, error, durable);
    if (
      operation !== null
      && durable?.state === "dispatching"
      && durable.revision === 1
      && !terminalizationAttempted
    ) {
      if (
        error instanceof FlightConsumerPreviewStripePaymentError
        && error.disposition === "definitive_failure"
        && error.httpStatus !== null
      ) {
        const failureProjection = Object.freeze({
          version: "flight-consumer-preview-stripe-capture-failure-v1" as const,
          phase: error.phase,
          httpStatus: error.httpStatus,
        });
        const failureJson = canonicalFlightJson(
          failureProjection as unknown as FlightCanonicalJsonValue,
        );
        const failureSha256 = sha256FlightEvidence(
          failureProjection as unknown as FlightCanonicalJsonValue,
        );
        const failedResult = await createAdminClient().rpc(
          "complete_flight_consumer_payment_operation_v1",
          {
            p_attempt_id: operation.attempt_id,
            p_expected_revision: 1,
            p_terminal_state: "failed",
            p_terminal_http_status: error.httpStatus,
            p_terminal_response_sha256: failureSha256,
            p_terminal_response_bytes: Buffer.byteLength(failureJson, "utf8"),
            p_terminal_receipt_sha256: input.authority.operationReceipt("stripe-capture-failed", {
              attemptId: operation.attempt_id,
              requestSha256,
              failureSha256,
            }),
          },
        );
        if (!failedResult.error) durable = { state: "failed", revision: 2 };
        if (failedResult.error) throw new FlightConsumerPreviewCompleteOrderError();
        const failed = oneRow(attemptReceiptSchema, failedResult.data);
        if (
          failed.attempt_id !== operation.attempt_id
          || failed.attempt_state !== "failed"
          || failed.attempt_revision !== 2
        ) {
          throw new FlightConsumerPreviewCompleteOrderError();
        }
      } else {
        const ambiguousReceiptSha256 = input.authority.operationReceipt("stripe-capture-ambiguous", {
          attemptId: operation.attempt_id,
          requestSha256,
        });
        const ambiguousResult = await createAdminClient().rpc(
          "complete_flight_consumer_payment_operation_v1",
          {
            p_attempt_id: operation.attempt_id,
            p_expected_revision: 1,
            p_terminal_state: "ambiguous",
            p_terminal_http_status: null,
            p_terminal_response_sha256: null,
            p_terminal_response_bytes: null,
            p_terminal_receipt_sha256: ambiguousReceiptSha256,
          },
        );
        if (ambiguousResult.error) {
          console.error("[flight-consumer-preview:complete-order] capture terminalization failed", {
            phase: "record_ambiguous_capture",
            category: "database_rpc_rejected",
          });
        } else {
          durable = { state: "ambiguous", revision: 2 };
        }
      }
    }
    if (error instanceof FlightConsumerPreviewCompleteOrderError) throw error;
    throw new FlightConsumerPreviewCompleteOrderError();
  }
}

function logReviewProjectionFailure(input: Readonly<{
  phase: "mark_provider_attempt_review" | "mark_captured_order_unstarted"
    | "mark_recovered_provider_attempt_review";
  category: "database_rpc_rejected" | "database_rpc_unavailable";
  durableState: Readonly<{
    attemptState: string;
    attemptRevision: number | null;
  }>;
}>) {
  console.error("[flight-consumer-preview:complete-order] review projection failed", {
    phase: input.phase,
    category: input.category,
    durableState: input.durableState,
  });
}

async function markOrderForReview(input: Readonly<{
  customerId: string;
  orderId: string;
  journal: FlightConsumerPreviewDuffelJournal | null;
  reason: string;
}>) {
  const outcome = input.journal?.readOutcome() ?? null;
  const expectedStateSha256 = sha256FlightEvidence({
    version: "flight-consumer-preview-order-review-expected-v1",
    customerId: input.customerId,
    orderId: input.orderId,
    expected: "ticketed",
  });
  const observedStateSha256 = sha256FlightEvidence({
    version: "flight-consumer-preview-order-review-observed-v1",
    orderId: input.orderId,
    attemptId: outcome?.attemptId ?? null,
    currentRevision: outcome?.currentRevision ?? null,
    terminalState: outcome?.terminalState ?? null,
    terminalRevision: outcome?.terminalRevision ?? null,
    reason: input.reason,
  });
  const durableState = Object.freeze({
    attemptState: outcome?.terminalState ?? (outcome === null ? "unstarted" : "prepared"),
    attemptRevision: outcome?.currentRevision ?? null,
  });
  const phase = outcome === null
    ? "mark_captured_order_unstarted" as const
    : "mark_provider_attempt_review" as const;
  try {
    let reviewResult: Readonly<{ error: unknown }>;
    if (outcome) {
      reviewResult = await createAdminClient().rpc("mark_flight_consumer_order_ambiguous_v1", {
        p_attempt_id: outcome.attemptId,
        p_expected_terminal_revision: outcome.currentRevision,
        p_expected_state_sha256: expectedStateSha256,
        p_observed_state_sha256: observedStateSha256,
      });
    } else {
      reviewResult = await createAdminClient().rpc(
        "mark_flight_consumer_captured_order_unstarted_v1",
        {
        p_order_id: input.orderId,
        p_expected_state_sha256: expectedStateSha256,
        p_observed_state_sha256: observedStateSha256,
        },
      );
    }
    if (reviewResult.error !== null) {
      logReviewProjectionFailure({
        phase,
        category: "database_rpc_rejected",
        durableState,
      });
    }
  } catch {
    logReviewProjectionFailure({
      phase,
      category: "database_rpc_unavailable",
      durableState,
    });
  }
}

function ticketingDeadline(
  outboundDepartureAt: string,
  providerCreatedAt: string,
) {
  const departureMilliseconds = Date.parse(outboundDepartureAt);
  const providerCreatedMilliseconds = Date.parse(providerCreatedAt);
  const deadline = new Date(departureMilliseconds - 60_000);
  if (
    !Number.isFinite(departureMilliseconds)
    || new Date(departureMilliseconds).toISOString() !== outboundDepartureAt
    || !Number.isFinite(providerCreatedMilliseconds)
    || new Date(providerCreatedMilliseconds).toISOString() !== providerCreatedAt
    || !Number.isFinite(deadline.getTime())
    || deadline.getTime() <= Date.now()
    || deadline.getTime() <= providerCreatedMilliseconds
    || deadline.getTime() >= departureMilliseconds
  ) throw new FlightConsumerPreviewCompleteOrderError();
  return deadline.toISOString();
}

export function calculateFlightConsumerPreviewTicketingDeadline(
  outboundDepartureAt: string,
  providerCreatedAt: string,
) {
  return ticketingDeadline(outboundDepartureAt, providerCreatedAt);
}

async function readOrderRecovery(customerId: string, orderId: string) {
  const result = await createAdminClient().rpc("get_flight_consumer_duffel_order_recovery_v1", {
    p_customer_id: customerId,
    p_order_id: orderId,
  });
  if (result.error) throw new FlightConsumerPreviewCompleteOrderError();
  const parsed = z.array(orderRecoverySchema).max(1).safeParse(result.data);
  if (!parsed.success) throw new FlightConsumerPreviewCompleteOrderError();
  return parsed.data[0] ?? null;
}

async function markRecoveredAttemptForReview(input: Readonly<{
  customerId: string;
  orderId: string;
  recovery: z.infer<typeof orderRecoverySchema>;
  reason: string;
}>) {
  const expectedStateSha256 = sha256FlightEvidence({
    version: "flight-consumer-preview-order-review-expected-v1",
    customerId: input.customerId,
    orderId: input.orderId,
    expected: "ticketed",
  });
  const observedStateSha256 = sha256FlightEvidence({
    version: "flight-consumer-preview-order-review-observed-v1",
    orderId: input.orderId,
    attemptId: input.recovery.attempt_id,
    currentRevision: input.recovery.attempt_revision,
    terminalState: input.recovery.attempt_state,
    terminalRevision: input.recovery.attempt_revision,
    reason: input.reason,
  });
  const durableState = Object.freeze({
    attemptState: input.recovery.attempt_state,
    attemptRevision: input.recovery.attempt_revision,
  });
  try {
    const reviewResult = await createAdminClient().rpc(
      "mark_flight_consumer_order_ambiguous_v1",
      {
      p_attempt_id: input.recovery.attempt_id,
      p_expected_terminal_revision: input.recovery.attempt_revision,
      p_expected_state_sha256: expectedStateSha256,
      p_observed_state_sha256: observedStateSha256,
      },
    );
    if (reviewResult.error !== null) {
      logReviewProjectionFailure({
        phase: "mark_recovered_provider_attempt_review",
        category: "database_rpc_rejected",
        durableState,
      });
    }
  } catch {
    logReviewProjectionFailure({
      phase: "mark_recovered_provider_attempt_review",
      category: "database_rpc_unavailable",
      durableState,
    });
  }
}

async function loadRecoveredOrderResponse(input: Readonly<{
  customerId: string;
  orderId: string;
  recovery: z.infer<typeof orderRecoverySchema>;
  executionScopeSha256: string;
}>) {
  const receiptSha256 = input.recovery.response_evidence_receipt_sha256;
  const providerResponseSha256 = input.recovery.terminal_response_sha256;
  if (
    input.recovery.attempt_state !== "succeeded"
    || input.recovery.attempt_revision !== 2
    || receiptSha256 === null
    || providerResponseSha256 === null
    || input.recovery.terminal_receipt_sha256 === null
  ) throw new FlightConsumerPreviewCompleteOrderError();
  const result = await createAdminClient().rpc("load_flight_consumer_order_response_evidence_v1", {
    p_customer_id: input.customerId,
    p_order_id: input.orderId,
    p_attempt_id: input.recovery.attempt_id,
    p_evidence_receipt_sha256: receiptSha256,
  });
  if (result.error) throw new FlightConsumerPreviewCompleteOrderError();
  const evidence = oneRow(orderResponseEvidenceSchema, result.data);
  if (
    evidence.attempt_id !== input.recovery.attempt_id
    || evidence.order_id !== input.orderId
    || evidence.customer_id !== input.customerId
    || evidence.execution_scope_sha256 !== input.executionScopeSha256
    || evidence.provider_response_sha256 !== providerResponseSha256
    || evidence.evidence_receipt_sha256 !== receiptSha256
    || Date.parse(evidence.retention_expires_at) <= Date.now()
  ) throw new FlightConsumerPreviewCompleteOrderError();
  return decryptFlightConsumerOrderResponseEvidence({
    envelope: {
      keyVersion: evidence.key_version,
      ivBase64Url: evidence.iv_base64url,
      authTagBase64Url: evidence.auth_tag_base64url,
      ciphertextBase64Url: evidence.ciphertext_base64url,
      aadSha256: evidence.aad_sha256,
      ciphertextSha256: evidence.ciphertext_sha256,
      receiptSha256: evidence.evidence_receipt_sha256,
    },
    providerResponseSha256,
    context: {
      customerId: input.customerId,
      orderId: input.orderId,
      attemptId: input.recovery.attempt_id,
      executionScopeSha256: input.executionScopeSha256,
    },
    keyring: readFlightConsumerPreviewOfferEvidenceKeyring(),
  });
}

export async function buildFlightConsumerPreviewTerminalResponseFinalizationArtifact(
  input: Readonly<{
    customerId: string;
    order: Order;
    search: Search;
    offer: z.infer<typeof offerSchema>;
    payment: Payment;
    passengers: readonly Passenger[];
    runtime: Awaited<ReturnType<typeof requireFlightConsumerPreviewRequestRuntime>>;
    attemptId: string;
    rawBody: Uint8Array;
    providerResponseSha256: string;
    responseObservation:
      | Readonly<{ kind: "create_terminal" }>
      | Readonly<{ kind: "terminal_replay" }>
      | Readonly<{ kind: "async_recovery"; observedAt: string }>;
  }>,
): Promise<FlightConsumerPreviewTerminalFinalizationArtifact> {
  let phase = "identity_contract";
  try {
  const identity = z.object({
    customerId: uuidSchema,
    attemptId: uuidSchema,
    providerResponseSha256: sha256Schema,
  }).strict().parse({
    customerId: input.customerId,
    attemptId: input.attemptId,
    providerResponseSha256: input.providerResponseSha256,
  });
  if (
    input.runtime.binding.executionScopeSha256 !== input.order.execution_scope_sha256
    || input.order.customer_id !== identity.customerId
  ) throw new FlightConsumerPreviewCompleteOrderError();

  phase = "attempt_lookup";
  const admin = createAdminClient();
  const attemptResult = await admin.from("flight_provider_request_attempts")
    .select("id,customer_id,search_id,offer_id,order_id,operation,provider_code,execution_mode,execution_scope_sha256,consumer_flow_version,offer_evidence_receipt_sha256,state,revision,terminal_response_sha256,terminal_response_bytes,terminal_receipt_sha256,dispatch_started_at,completed_at")
    .eq("id", identity.attemptId)
    .eq("customer_id", identity.customerId)
    .eq("order_id", input.order.id)
    .eq("search_id", input.order.search_id)
    .eq("offer_id", input.order.offer_id)
    .eq("operation", "create_order")
    .eq("provider_code", "duffel")
    .eq("execution_mode", "test")
    .eq("execution_scope_sha256", input.order.execution_scope_sha256)
    .eq("consumer_flow_version", 1)
    .eq("state", "succeeded")
    .eq("revision", 2)
    .maybeSingle();
  if (attemptResult.error || !attemptResult.data) {
    throw new FlightConsumerPreviewCompleteOrderError();
  }
  phase = "attempt_contract";
  const attempt = terminalOrderAttemptSchema.parse(attemptResult.data);
  phase = "response_observation";
  const historicalRecovery = input.responseObservation.kind !== "create_terminal";
  const responseObservedAt = input.responseObservation.kind === "async_recovery"
    ? z.string().datetime({ offset: true }).parse(input.responseObservation.observedAt)
    : attempt.completed_at;
  if (
    input.responseObservation.kind === "async_recovery"
      ? Date.parse(responseObservedAt) < Date.parse(attempt.completed_at)
      : attempt.terminal_response_sha256 !== identity.providerResponseSha256
        || attempt.terminal_response_bytes !== input.rawBody.byteLength
  ) throw new FlightConsumerPreviewCompleteOrderError();

  phase = "offer_evidence_lookup";
  const currentEvidenceContext = historicalRecovery
    ? null
    : await evidenceContext(input.order);
  const context = currentEvidenceContext
    ?? Object.freeze({
      receipt_sha256: attempt.offer_evidence_receipt_sha256,
      reprice_receipt_id: input.order.reprice_receipt_id,
    });
  phase = "offer_evidence_contract";
  if (
    context.receipt_sha256 !== attempt.offer_evidence_receipt_sha256
    || context.reprice_receipt_id !== input.order.reprice_receipt_id
  ) throw new FlightConsumerPreviewCompleteOrderError();

  const scope = Object.freeze({
    tenantId: "tenant_iratepilot_preview_0001" as const,
    commerceId: input.order.search_id,
    actorId: identity.customerId,
  });
  let loadedRecord: DuffelDurableOfferEvidenceRecord;
  let refreshedOffer: DuffelRehydratedOfferEvidence | DuffelTerminalRecoveryOfferEvidence;
  if (currentEvidenceContext === null) {
    phase = "terminal_offer_evidence_reader";
    const reader = await createFlightConsumerPreviewTerminalRecoveryOfferEvidenceRepository({
      customerId: identity.customerId,
      orderId: input.order.id,
      searchId: input.order.search_id,
      offerId: input.order.offer_id,
      attemptId: attempt.id,
      attemptDispatchedAt: attempt.dispatch_started_at,
      receiptSha256: context.receipt_sha256,
    });
    phase = "terminal_offer_evidence_projection";
    const projected = await reader.projectTerminalOfferEvidence(
      context.receipt_sha256,
      scope,
    );
    if (
      projected.decision !== "verified"
      || projected.receiptDigest !== context.receipt_sha256
      || projected.record.stage !== "refreshed"
      || projected.offer.terminalStage !== "refreshed"
      || projected.offer.evidence.version
        !== "duffel-terminal-recovery-refreshed-offer-evidence-v1"
    ) throw new FlightConsumerPreviewCompleteOrderError();
    loadedRecord = projected.record;
    refreshedOffer = projected.offer;
  } else {
    phase = "offer_evidence_repository";
    const repository = await createFlightConsumerPreviewOfferEvidenceRepository({
      customerId: identity.customerId,
      searchId: input.order.search_id,
      offerId: input.order.offer_id,
      localOfferId: currentEvidenceContext.local_offer_id,
    });
    phase = "offer_evidence_load";
    const loaded = await repository.verifyAndLoadOfferEvidence(
      context.receipt_sha256,
      scope,
    );
    if (
      loaded.decision !== "verified"
      || loaded.receiptDigest !== context.receipt_sha256
      || loaded.record.stage !== "refreshed"
    ) throw new FlightConsumerPreviewCompleteOrderError();
    phase = "offer_evidence_rehydration";
    const rehydrated = await rehydrateDuffelSandboxOfferEvidence(
      repository,
      context.receipt_sha256,
      scope,
    );
    if (rehydrated.evidence.version !== "duffel-refreshed-offer-v1") {
      throw new FlightConsumerPreviewCompleteOrderError();
    }
    loadedRecord = loaded.record;
    refreshedOffer = rehydrated;
  }
  const refreshedBytes = Buffer.from(loadedRecord.rawBodyBase64, "base64");
  try {
    phase = "offer_passenger_evidence";
    const providerPassengerIds = extractVerifiedDuffelPreviewPassengerIds({
      rawBody: refreshedBytes,
      expectedPassengerIdDigests: refreshedOffer.evidence.providerPassengerIdDigests,
      expectedCount: input.passengers.length,
    });
    phase = "terminal_response_projection";
    return projectFlightConsumerPreviewTerminalOrderResponse({
      customerId: identity.customerId,
      executionScopeSha256: input.order.execution_scope_sha256,
      order: input.order,
      search: input.search,
      offer: input.offer,
      payment: input.payment,
      passengers: input.passengers,
      refreshedOffer,
      expectedOfferEvidenceReceiptSha256: context.receipt_sha256,
      expectedProviderPassengerIds: providerPassengerIds,
      rawBody: input.rawBody,
      providerResponseSha256: identity.providerResponseSha256,
      responseObservedAt,
      referenceKeyring: readFlightConsumerPreviewReferenceKeyring(),
    });
  } catch (error) {
    if (error instanceof FlightConsumerPreviewCompleteOrderError) throw error;
    throw new FlightConsumerPreviewCompleteOrderError();
  } finally {
    refreshedBytes.fill(0);
  }
  } catch (error) {
    console.error("[flight-consumer-preview] Terminal response artifact failed", {
      diagnostic: "terminal_response_artifact_failed",
      phase,
      category: error instanceof z.ZodError
        ? "schema_contract"
        : error instanceof Error
          ? error.name
          : "unknown",
    });
    if (error instanceof FlightConsumerPreviewCompleteOrderError) throw error;
    throw new FlightConsumerPreviewCompleteOrderError();
  }
}

export function buildFlightConsumerPreviewDuffelFinalizationArtifact(input: Readonly<{
  customerId: string;
  order: Order;
  search: Search;
  offer: z.infer<typeof offerSchema>;
  passengers: readonly Passenger[];
  package: Awaited<ReturnType<typeof buildOrderPackage>>;
  runtime: Awaited<ReturnType<typeof requireFlightConsumerPreviewRequestRuntime>>;
  providerOperationRequestReceiptDigest: string;
  providerOperationReceiptDigest: string;
  rawBody: Uint8Array;
  retrievedAt: string;
}>) {
  const projected = projectDuffelSandboxCreateOrderResult(input.rawBody, {
    bridgePackage: input.package.bridgePackage,
    retrievedAt: input.retrievedAt,
    providerOperationRequestReceiptDigest: input.providerOperationRequestReceiptDigest,
    providerOperationReceiptDigest: input.providerOperationReceiptDigest,
  });
  if (projected.ticketState !== "issued") {
    throw new FlightConsumerPreviewCompleteOrderError();
  }
  const orderEvidence = readDuffelSandboxProjectedOrderEvidence({
    bridgePackage: input.package.bridgePackage,
    result: projected,
  });
  const references = extractVerifiedDuffelPreviewOrderReferences({
    rawBody: input.rawBody,
    orderEvidence,
    expectedProviderPassengerIds: input.package.providerPassengerIds,
  });
  const referenceKeyring = readFlightConsumerPreviewReferenceKeyring();
  const providerOrder = encryptFlightConsumerPreviewReference({
    value: references.providerOrderId,
    context: {
      kind: "duffel_order",
      customerId: input.customerId,
      resourceId: input.order.id,
      executionScopeSha256: input.runtime.binding.executionScopeSha256,
    },
    keyring: referenceKeyring,
  });
  const passengerByProviderId = new Map(input.package.providerPassengerIds.map(
    (providerPassengerId, index) => [providerPassengerId, input.passengers[index]!] as const,
  ));
  const passengerBindings = references.providerPassengerIds.map((providerPassengerId) => {
    const passenger = passengerByProviderId.get(providerPassengerId);
    if (!passenger) throw new FlightConsumerPreviewCompleteOrderError();
    const encrypted = encryptFlightConsumerPreviewReference({
      value: providerPassengerId,
      context: {
        kind: "duffel_passenger",
        customerId: input.customerId,
        resourceId: passenger.id,
        executionScopeSha256: input.runtime.binding.executionScopeSha256,
      },
      keyring: referenceKeyring,
    });
    return Object.freeze({
      passenger_ref_id: passenger.id,
      provider_passenger_ref_ciphertext: encrypted.ciphertext,
      provider_passenger_ref_sha256: encrypted.referenceSha256,
    });
  });
  const ticketDocuments = references.tickets.map((ticket) => {
    const passenger = passengerByProviderId.get(ticket.providerPassengerId);
    if (!passenger) throw new FlightConsumerPreviewCompleteOrderError();
    const encrypted = encryptFlightConsumerPreviewReference({
      value: ticket.documentReference,
      context: {
        kind: "duffel_ticket",
        customerId: input.customerId,
        resourceId: `ticket:${passenger.id}`,
        executionScopeSha256: input.runtime.binding.executionScopeSha256,
      },
      keyring: referenceKeyring,
    });
    return Object.freeze({
      passenger_ref_id: passenger.id,
      document_ref_ciphertext: encrypted.ciphertext,
      document_ref_sha256: encrypted.referenceSha256,
      issuing_carrier: input.offer.validating_carrier,
    });
  });
  return Object.freeze({
    providerOrderRefCiphertext: providerOrder.ciphertext,
    providerOrderRefSha256: providerOrder.referenceSha256,
    providerCreatedAt: orderEvidence.createdAt,
    ticketingDeadlineAt: ticketingDeadline(
      input.package.outboundDepartureAt,
      orderEvidence.createdAt,
    ),
    passengerBindings: Object.freeze(passengerBindings),
    ticketDocuments: Object.freeze(ticketDocuments),
  });
}

async function finalizeDuffelOrderArtifact(input: Readonly<{
  order: Order;
  passengers: readonly Passenger[];
  attemptId: string;
  responseEvidenceReceiptSha256: string;
  artifact: Readonly<{
    providerOrderRefCiphertext: string;
    providerOrderRefSha256: string;
    providerCreatedAt: string;
    ticketingDeadlineAt: string;
    passengerBindings: readonly Readonly<Record<string, unknown>>[];
    ticketDocuments: readonly Readonly<Record<string, unknown>>[];
  }>;
}>) {
  const finalResult = await createAdminClient().rpc(
    "finalize_flight_consumer_duffel_order_v1",
    {
      p_attempt_id: input.attemptId,
      p_expected_terminal_revision: 2,
      p_response_evidence_receipt_sha256: input.responseEvidenceReceiptSha256,
      p_provider_order_ref_ciphertext: input.artifact.providerOrderRefCiphertext,
      p_provider_order_ref_sha256: input.artifact.providerOrderRefSha256,
      p_provider_created_at: input.artifact.providerCreatedAt,
      p_ticketing_deadline_at: input.artifact.ticketingDeadlineAt,
      p_passenger_bindings: input.artifact.passengerBindings,
      p_ticket_documents: input.artifact.ticketDocuments,
    },
  );
  if (finalResult.error) throw new FlightConsumerPreviewCompleteOrderError();
  const finalized = oneRow(finalizationSchema, finalResult.data);
  if (
    finalized.order_id !== input.order.id
    || finalized.issued_ticket_count !== input.passengers.length
  ) throw new FlightConsumerPreviewCompleteOrderError();
  return Object.freeze({
    orderId: finalized.order_id,
    status: finalized.order_status,
    issuedTicketCount: finalized.issued_ticket_count,
  });
}

async function finalizeDuffelOrderResponse(input: Readonly<{
  customerId: string;
  order: Order;
  search: Search;
  offer: z.infer<typeof offerSchema>;
  passengers: readonly Passenger[];
  package: Awaited<ReturnType<typeof buildOrderPackage>>;
  runtime: Awaited<ReturnType<typeof requireFlightConsumerPreviewRequestRuntime>>;
  attemptId: string;
  responseEvidenceReceiptSha256: string;
  providerOperationRequestReceiptDigest: string;
  providerOperationReceiptDigest: string;
  rawBody: Uint8Array;
}>) {
  const artifact = buildFlightConsumerPreviewDuffelFinalizationArtifact({
    ...input,
    retrievedAt: new Date().toISOString(),
  });
  return finalizeDuffelOrderArtifact({
    order: input.order,
    passengers: input.passengers,
    attemptId: input.attemptId,
    responseEvidenceReceiptSha256: input.responseEvidenceReceiptSha256,
    artifact,
  });
}

export async function createAndFinalizeDuffelOrder(input: Readonly<{
  customerId: string;
  paymentIntentId: string;
  order: Order;
  search: Search;
  offer: z.infer<typeof offerSchema>;
  payment: Payment;
  passengers: readonly Passenger[];
  package: Awaited<ReturnType<typeof buildOrderPackage>>;
  runtime: Awaited<ReturnType<typeof requireFlightConsumerPreviewRequestRuntime>>;
  stripe?: Awaited<ReturnType<typeof createFlightConsumerPreviewStripePayment>>;
  preparedAttemptRecovery?: Readonly<{
    attemptId: string;
    dispatchNotAfter: string;
  }> | null;
}>) {
  let journal: FlightConsumerPreviewDuffelJournal | null = null;
  let rawBody: Uint8Array | null = null;
  let terminalResponseEvidenceRecorded = false;
  let attestationStripe = input.stripe ?? null;
  try {
    journal = createFlightConsumerPreviewDuffelJournal(
      {
        kind: "order",
        customerId: input.customerId,
        searchId: input.order.search_id,
        offerId: input.order.offer_id,
        orderId: input.order.id,
        offerEvidenceReceiptSha256: input.package.context.receipt_sha256,
        paymentBindingReceiptSha256: input.package.paymentBindingReceiptSha256,
        providerSettlementBindingReceiptSha256:
          input.package.providerSettlementBindingReceiptSha256,
      },
      process.env,
      input.preparedAttemptRecovery ?? null,
      input.package.bridgePackage.orderCreatePlan.dispatchNotAfter,
      async () => {
        attestationStripe ??= await createFlightConsumerPreviewStripePayment({
          orderId: input.order.id,
          customerId: input.order.customer_id,
          amountCents: input.order.total_cents,
          runtimeBinding: input.runtime.binding,
        });
        await attestCapturedPaymentBeforeDuffelClaim({
          order: input.order,
          payment: input.payment,
          paymentIntentId: input.paymentIntentId,
          paymentBindingReceiptSha256: input.package.paymentBindingReceiptSha256,
          authority: input.package.authority,
          runtime: input.runtime,
          stripe: attestationStripe,
        });
      },
    );
    const transport = createDuffelTestHttpTransport(
      createDuffelPreviewTransportDependencies(journal),
    );
    const transportResult = await transport.execute(input.package.bridgePackage.orderCreatePlan);
    rawBody = copyDuffelHttpTransportRawBody(transportResult);
    const outcome = journal.readOutcome();
    if (
      outcome?.terminalState !== "succeeded"
      || outcome.terminalRevision !== 2
      || !outcome.completionReceiptDigest
    ) throw new FlightConsumerPreviewCompleteOrderError();

    const encryptedResponse = encryptFlightConsumerOrderResponseEvidence({
      rawBody,
      providerResponseSha256: transportResult.responseDigest,
      context: {
        customerId: input.customerId,
        orderId: input.order.id,
        attemptId: outcome.attemptId,
        executionScopeSha256: input.runtime.binding.executionScopeSha256,
      },
      keyring: readFlightConsumerPreviewOfferEvidenceKeyring(),
    });
    const recordedResult = await createAdminClient().rpc(
      "record_flight_consumer_duffel_order_terminal_v1",
      {
        p_attempt_id: outcome.attemptId,
        p_expected_revision: 2,
        p_terminal_state: "succeeded",
        p_terminal_http_status: transportResult.status,
        p_terminal_response_sha256: transportResult.responseDigest,
        p_terminal_response_bytes: transportResult.inboundBodyBytes,
        p_terminal_receipt_sha256: outcome.completionReceiptDigest,
        p_key_version: encryptedResponse.keyVersion,
        p_iv_base64url: encryptedResponse.ivBase64Url,
        p_auth_tag_base64url: encryptedResponse.authTagBase64Url,
        p_ciphertext_base64url: encryptedResponse.ciphertextBase64Url,
        p_aad_sha256: encryptedResponse.aadSha256,
        p_ciphertext_sha256: encryptedResponse.ciphertextSha256,
        p_evidence_receipt_sha256: encryptedResponse.receiptSha256,
        p_retention_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
      },
    );
    if (recordedResult.error) throw new FlightConsumerPreviewCompleteOrderError();
    const recorded = oneRow(attemptReceiptSchema, recordedResult.data);
    if (recorded.attempt_state !== "succeeded" || recorded.attempt_revision !== 2) {
      throw new FlightConsumerPreviewCompleteOrderError();
    }
    // From this point the exact provider success and encrypted response are
    // durable. Any later local projection failure must leave order_creating
    // available for evidence replay; review would strand a proven booking.
    terminalResponseEvidenceRecorded = true;
    await resolveFlightConsumerPreviewPendingDuffelWebhookLinks({
      attemptId: outcome.attemptId,
      phase: "post_terminal",
    });
    const finalized = await finalizeDuffelOrderResponse({
      ...input,
      attemptId: outcome.attemptId,
      responseEvidenceReceiptSha256: encryptedResponse.receiptSha256,
      providerOperationRequestReceiptDigest: input.package.authority.operationReceipt(
        "duffel-order-request",
        { attemptId: outcome.attemptId, requestDigest: transportResult.requestDigest },
      ),
      providerOperationReceiptDigest: outcome.completionReceiptDigest,
      rawBody,
    });
    await resolveFlightConsumerPreviewPendingDuffelWebhookLinks({
      attemptId: outcome.attemptId,
      phase: "post_finalization",
    });
    return finalized;
  } catch {
    const outcome = journal?.readOutcome() ?? null;
    const preparedAndUnclaimed = outcome?.currentRevision === 0
      && outcome.terminalState === null
      && outcome.terminalRevision === null;
    if (!terminalResponseEvidenceRecorded && !preparedAndUnclaimed) {
      await markOrderForReview({
        customerId: input.customerId,
        orderId: input.order.id,
        journal,
        reason: "provider_order_not_safely_finalized",
      });
    }
    throw new FlightConsumerPreviewCompleteOrderError();
  } finally {
    rawBody?.fill(0);
  }
}

export async function recoverOrResumeDuffelOrder(input: Readonly<{
  customerId: string;
  paymentIntentId: string;
  order: Order;
  search: Search;
  offer: z.infer<typeof offerSchema>;
  payment: Payment;
  passengers: readonly Passenger[];
  runtime: Awaited<ReturnType<typeof requireFlightConsumerPreviewRequestRuntime>>;
}>) {
  const recovery = await readOrderRecovery(input.customerId, input.order.id);
  if (
    recovery === null
    || recovery.customer_id !== input.customerId
    || recovery.order_id !== input.order.id
  ) throw new FlightConsumerPreviewCompleteOrderError();
  const decision = decideFlightConsumerPreviewDuffelOrderRecovery({
    attemptRevision: recovery.attempt_revision,
    attemptState: recovery.attempt_state,
    dispatchNotAfter: recovery.dispatch_not_after,
    evidenceAvailable: recovery.evidence_available,
  });
  if (decision === "resume_prepared" || decision === "block_expired_prepared") {
    let orderPackage: Awaited<ReturnType<typeof buildOrderPackage>>;
    try {
      orderPackage = await buildOrderPackage({
        ...input,
      });
    } catch {
      await markRecoveredAttemptForReview({
        customerId: input.customerId,
        orderId: input.order.id,
        recovery,
        reason: "prepared_provider_attempt_package_unavailable",
      });
      throw new FlightConsumerPreviewCompleteOrderError();
    }
    return createAndFinalizeDuffelOrder({
      ...input,
      package: orderPackage,
      preparedAttemptRecovery: {
        attemptId: recovery.attempt_id,
        dispatchNotAfter: recovery.dispatch_not_after,
      },
    });
  }
  if (decision === "processing") {
    // Another request owns the exact provider dispatch. Do not race it or
    // mutate its durable journal into review while its outcome is unresolved.
    throw new FlightConsumerPreviewCompletionProcessingError();
  }
  if (decision === "review") {
    await markRecoveredAttemptForReview({
      customerId: input.customerId,
      orderId: input.order.id,
      recovery,
      reason: recovery.attempt_state === "succeeded" && !recovery.evidence_available
        ? "successful_provider_attempt_missing_response_evidence"
        : "existing_provider_attempt_not_safely_replayable",
    });
    throw new FlightConsumerPreviewCompleteOrderError();
  }
  let rawBody: Buffer | null = null;
  try {
    rawBody = await loadRecoveredOrderResponse({
      customerId: input.customerId,
      orderId: input.order.id,
      recovery,
      executionScopeSha256: input.runtime.binding.executionScopeSha256,
    });
    if (
      recovery.terminal_receipt_sha256 === null
      || recovery.terminal_response_sha256 === null
      || recovery.response_evidence_receipt_sha256 === null
    ) throw new FlightConsumerPreviewCompleteOrderError();
    const artifact = await buildFlightConsumerPreviewTerminalResponseFinalizationArtifact({
      ...input,
      attemptId: recovery.attempt_id,
      rawBody,
      providerResponseSha256: recovery.terminal_response_sha256,
      responseObservation: { kind: "terminal_replay" },
    });
    const finalized = await finalizeDuffelOrderArtifact({
      order: input.order,
      passengers: input.passengers,
      attemptId: recovery.attempt_id,
      responseEvidenceReceiptSha256: recovery.response_evidence_receipt_sha256,
      artifact,
    });
    await resolveFlightConsumerPreviewPendingDuffelWebhookLinks({
      attemptId: recovery.attempt_id,
      phase: "terminal_response_recovery",
    });
    return finalized;
  } catch {
    // replay_succeeded already proves an immutable rev2 provider success and
    // exact retained response evidence. A local decrypt/projection/finalizer
    // outage must leave order_creating intact so a later request can replay it;
    // moving it to review here would strand the durable booking evidence.
    throw new FlightConsumerPreviewCompleteOrderError();
  } finally {
    rawBody?.fill(0);
  }
}

type FlightConsumerPreviewCompleteOrderIdentity = Readonly<{
  customerId: string;
  orderId: string;
  paymentIntentId: string;
}>;

async function completeFlightConsumerPreviewOrderAsLeaseOwner(
  identity: FlightConsumerPreviewCompleteOrderIdentity,
  runtime: Awaited<ReturnType<typeof requireFlightConsumerPreviewRequestRuntime>>,
  heartbeat: () => Promise<void>,
): Promise<FlightConsumerPreviewCompletionResult> {
  await heartbeat();
  let state = await loadState(
    identity.customerId,
    identity.orderId,
    runtime.binding.executionScopeSha256,
  );
  if (state.order.status === "ticketed" && state.order.provider_order_ref_sha256 !== null) {
    return Object.freeze({
      orderId: state.order.id,
      status: "ticketed" as const,
      issuedTicketCount: state.passengers.length,
    });
  }
  if (!["pending_payment", "payment_authorized", "order_creating"].includes(state.order.status)) {
    throw new FlightConsumerPreviewCompleteOrderError();
  }
  const verifiedPaymentIntentId = paymentIntentId({
    customerId: identity.customerId,
    orderId: identity.orderId,
    payment: state.payment,
    executionScopeSha256: runtime.binding.executionScopeSha256,
  });
  if (verifiedPaymentIntentId !== identity.paymentIntentId) {
    throw new FlightConsumerPreviewCompleteOrderError();
  }
  if (state.order.status === "order_creating") {
    if (
      state.payment.status !== "captured"
      || state.payment.authorized_cents !== state.order.total_cents
      || state.payment.captured_cents !== state.order.total_cents
      || state.payment.refunded_cents !== 0
    ) throw new FlightConsumerPreviewCompleteOrderError();
    await heartbeat();
    return recoverOrResumeDuffelOrder({
      customerId: identity.customerId,
      paymentIntentId: verifiedPaymentIntentId,
      ...state,
      runtime,
    });
  }
  const stripe = await createFlightConsumerPreviewStripePayment({
    orderId: state.order.id,
    customerId: state.order.customer_id,
    amountCents: state.order.total_cents,
    runtimeBinding: runtime.binding,
  });
  if (state.payment.status === "requires_payment_method" || state.payment.status === "requires_action") {
    await heartbeat();
    await observeAuthorization({
      order: state.order,
      payment: state.payment,
      paymentIntentId: verifiedPaymentIntentId,
      stripe,
    });
    state = await loadState(
      identity.customerId,
      identity.orderId,
      runtime.binding.executionScopeSha256,
    );
  }
  if (
    state.order.status !== "payment_authorized"
    || !["authorized", "captured"].includes(state.payment.status)
    || state.payment.authorized_cents !== state.order.total_cents
    || state.payment.refunded_cents !== 0
  ) throw new FlightConsumerPreviewCompleteOrderError();

  let orderPackage: Awaited<ReturnType<typeof buildOrderPackage>> | null = null;
  if (state.payment.status !== "captured") {
    const existingCapture = await readCaptureOperation(
      identity.customerId,
      identity.orderId,
    );
    const canRecoverBeforePackage = existingCapture !== null
      && existingCapture.customer_id === identity.customerId
      && existingCapture.order_id === identity.orderId
      && existingCapture.payment_id === state.payment.id
      && (
        (existingCapture.attempt_state === "succeeded"
          && existingCapture.attempt_revision === 2)
        || (["prepared", "dispatching"].includes(existingCapture.attempt_state)
          && existingCapture.attempt_revision
            === (existingCapture.attempt_state === "prepared" ? 0 : 1)
          && Date.parse(existingCapture.dispatch_not_after) <= Date.now())
      );
    if (canRecoverBeforePackage) {
      await heartbeat();
      await capturePayment({
        order: state.order,
        payment: state.payment,
        paymentIntentId: verifiedPaymentIntentId,
        paymentBindingReceiptSha256: existingCapture.payment_binding_receipt_sha256,
        authority: createFlightConsumerPreviewAuthority(runtime.binding),
        runtime,
        stripe,
      });
    } else {
      orderPackage = await buildOrderPackage({
        ...state,
        runtime,
      });
      await heartbeat();
      await capturePayment({
        order: state.order,
        payment: state.payment,
        paymentIntentId: verifiedPaymentIntentId,
        paymentBindingReceiptSha256: orderPackage.paymentBindingReceiptSha256,
        authority: orderPackage.authority,
        runtime,
        stripe,
      });
    }
    state = await loadState(
      identity.customerId,
      identity.orderId,
      runtime.binding.executionScopeSha256,
    );
  }
  if (
    state.order.status !== "payment_authorized"
    || state.payment.status !== "captured"
    || state.payment.captured_cents !== state.order.total_cents
    || state.payment.refunded_cents !== 0
  ) throw new FlightConsumerPreviewCompleteOrderError();
  if (orderPackage === null) {
    try {
      orderPackage = await buildOrderPackage({
        ...state,
        runtime,
      });
    } catch {
      await markOrderForReview({
        customerId: identity.customerId,
        orderId: identity.orderId,
        journal: null,
        reason: "captured_order_package_unavailable_before_provider_attempt",
      });
      throw new FlightConsumerPreviewCompleteOrderError();
    }
  }
  await heartbeat();
  return createAndFinalizeDuffelOrder({
    customerId: identity.customerId,
    paymentIntentId: verifiedPaymentIntentId,
    ...state,
    package: orderPackage,
    runtime,
    stripe,
  });
}

export async function completeFlightConsumerPreviewOrder(input: Readonly<{
  customerId: string;
  orderId: string;
  idempotencyKey: string;
  paymentIntentId: string;
}>) {
  const identity = z.object({
    customerId: uuidSchema,
    orderId: uuidSchema,
    idempotencyKey: uuidSchema,
    paymentIntentId: z.string().regex(/^pi_[A-Za-z0-9]{8,252}$/),
  }).strict().parse(input);
  const runtime = await requireFlightConsumerPreviewRequestRuntime();
  const coordinator = createFlightConsumerPreviewCompletionLeaseCoordinator();
  const lease = await coordinator.acquire({
    ...identity,
    executionScopeSha256: runtime.binding.executionScopeSha256,
  });
  if (lease.decision === "replayed") return lease.result;
  try {
    const result = await completeFlightConsumerPreviewOrderAsLeaseOwner(
      identity,
      runtime,
      () => coordinator.heartbeat(lease.handle),
    );
    await coordinator.complete(lease.handle, result);
    return result;
  } catch (error) {
    await coordinator.release(lease.handle);
    if (error instanceof FlightConsumerPreviewCompletionProcessingError) throw error;
    if (error instanceof FlightConsumerPreviewCompleteOrderError) throw error;
    throw new FlightConsumerPreviewCompleteOrderError();
  }
}

/**
 * Resumes a server-owned completion using the immutable lease identity created
 * by the browser request. The recovery lease RPC may transfer local workflow
 * ownership, but it never grants a second supplier dispatch.
 */
export async function recoverFlightConsumerPreviewOrder(input: Readonly<{
  customerId: string;
  orderId: string;
  paymentIntentId: string;
}>) {
  const identity = z.object({
    customerId: uuidSchema,
    orderId: uuidSchema,
    paymentIntentId: z.string().regex(/^pi_[A-Za-z0-9]{8,252}$/),
  }).strict().parse(input);
  const runtime = await requireFlightConsumerPreviewRequestRuntime();
  const coordinator = createFlightConsumerPreviewCompletionLeaseCoordinator();
  const lease = await coordinator.acquireRecovery({
    customerId: identity.customerId,
    orderId: identity.orderId,
    executionScopeSha256: runtime.binding.executionScopeSha256,
  });
  if (lease.decision === "replayed") return lease.result;
  try {
    const result = await completeFlightConsumerPreviewOrderAsLeaseOwner(
      identity,
      runtime,
      () => coordinator.heartbeat(lease.handle),
    );
    await coordinator.complete(lease.handle, result);
    return result;
  } catch (error) {
    await coordinator.release(lease.handle);
    if (error instanceof FlightConsumerPreviewCompletionProcessingError) throw error;
    if (error instanceof FlightConsumerPreviewCompleteOrderError) throw error;
    throw new FlightConsumerPreviewCompleteOrderError();
  }
}
