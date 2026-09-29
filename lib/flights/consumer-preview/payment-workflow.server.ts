import "server-only";

import { z } from "zod";

import { createAdminClient } from "../../supabase/admin";
import { rehydrateDuffelSandboxOfferEvidence } from "../duffel-sandbox-contract";
import { canonicalFlightJson, sha256FlightEvidence, type FlightCanonicalJsonValue } from "../runtime-safety";
import { createFlightConsumerPreviewAuthority } from "./authority.server";
import { extractVerifiedDuffelPreviewPassengerIds } from "./duffel-evidence.server";
import { verifyFlightConsumerPreviewFictionalTravelerDisclosure } from "./fictional-travelers";
import { createFlightConsumerPreviewOfferEvidenceRepository } from "./offer-evidence-repository.server";
import {
  createStagedFlightConsumerPreviewPiiRepository,
  normalizedStagedFlightConsumerPassenger,
} from "./pii-staging.server";
import type { FlightConsumerPiiStoreResult } from "./pii-repository.server";
import {
  decryptFlightConsumerPreviewReference,
  encryptFlightConsumerPreviewReference,
  readFlightConsumerPreviewReferenceKeyring,
} from "./reference-crypto.server";
import { requireFlightConsumerPreviewRequestRuntime } from "./runtime-authority.server";
import {
  FlightConsumerPreviewStripePaymentError,
  createFlightConsumerPreviewStripePayment,
} from "./stripe-payment.server";

const orderRowSchema = z.object({
  id: z.string().uuid(),
  customer_id: z.string().uuid(),
  search_id: z.string().uuid(),
  offer_id: z.string().uuid(),
  reprice_receipt_id: z.string().uuid(),
  execution_mode: z.literal("test"),
  execution_scope_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  provider_code: z.literal("duffel"),
  currency: z.literal("USD"),
  total_cents: z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform(Number),
  status: z.enum(["pending_payment", "payment_authorized", "order_creating", "booked", "ticketing_pending", "ticketed", "requires_review", "failed"]),
}).passthrough();

const searchRowSchema = z.object({
  adult_count: z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform(Number),
  child_count: z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform(Number),
  infant_in_seat_count: z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform(Number),
  infant_on_lap_count: z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform(Number),
  departure_date: z.string(),
}).passthrough();

const evidenceContextSchema = z.object({
  receipt_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  local_offer_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/),
  reprice_receipt_id: z.string().uuid(),
  retention_expires_at: z.string(),
}).passthrough();

const attemptRowSchema = z.object({
  decision: z.enum(["prepared", "replay"]),
  payment_attempt_id: z.string().uuid(),
  attempt_revision: z.literal(0),
  attempt_state: z.literal("prepared"),
  amount_cents: z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform(Number),
  currency: z.literal("USD"),
}).passthrough();

const claimRowSchema = z.object({
  attempt_id: z.string().uuid(),
  attempt_revision: z.literal(1),
  attempt_state: z.literal("dispatching"),
}).passthrough();

const paymentRowSchema = z.object({
  decision: z.enum(["completed", "replay"]),
  attempt_id: z.string().uuid(),
  attempt_revision: z.literal(2),
  attempt_state: z.literal("succeeded"),
  payment_id: z.string().uuid(),
  payment_status: z.literal("requires_payment_method"),
}).passthrough();

const existingAttemptSchema = z.object({
  attempt_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  order_id: z.string().uuid(),
  payment_id: z.string().uuid().nullable(),
  operation: z.literal("create_intent"),
  execution_scope_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  processor_account_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  processor_source_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  processor_adapter_version_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  payment_binding_receipt_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  adapter_source_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  operation_authority_receipt_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  idempotency_key_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  idempotency_request_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  request_plan_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  request_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  request_body_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  amount_cents: z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform(Number),
  currency: z.literal("USD"),
  dispatch_not_after: z.string().datetime({ offset: true }),
  attempt_state: z.enum(["prepared", "dispatching", "succeeded", "failed", "ambiguous", "blocked"]),
  attempt_revision: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  processor_object_ref_sha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  terminal_http_status: z.number().int().nullable(),
  terminal_response_sha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  terminal_response_bytes: z.number().int().nonnegative().nullable(),
  terminal_receipt_sha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
}).passthrough();

const existingPaymentSchema = z.object({
  id: z.string().uuid(),
  processor_reference_ciphertext: z.string().min(16),
  processor_reference_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  status: z.enum(["requires_payment_method", "requires_action", "authorized", "captured"]),
}).passthrough();

export class FlightConsumerPreviewPaymentWorkflowError extends Error {
  constructor() {
    super("Stripe test payment could not be prepared.");
    this.name = "FlightConsumerPreviewPaymentWorkflowError";
  }
}

function oneRow<T>(schema: z.ZodType<T>, value: unknown) {
  const parsed = z.array(schema).length(1).safeParse(value);
  if (!parsed.success) throw new FlightConsumerPreviewPaymentWorkflowError();
  return parsed.data[0]!;
}

async function internalOrder(customerId: string, orderId: string, executionScopeSha256: string) {
  const admin = createAdminClient();
  const orderResult = await admin.from("flight_orders")
    .select("id,customer_id,search_id,offer_id,reprice_receipt_id,execution_mode,execution_scope_sha256,provider_code,currency,total_cents,status")
    .eq("id", orderId)
    .eq("customer_id", customerId)
    .eq("execution_mode", "test")
    .eq("execution_scope_sha256", executionScopeSha256)
    .eq("provider_code", "duffel")
    .maybeSingle();
  if (orderResult.error || !orderResult.data) throw new FlightConsumerPreviewPaymentWorkflowError();
  const order = orderRowSchema.parse(orderResult.data);
  const searchResult = await admin.from("flight_searches")
    .select("adult_count,child_count,infant_in_seat_count,infant_on_lap_count,departure_date")
    .eq("id", order.search_id)
    .eq("customer_id", customerId)
    .eq("execution_mode", "test")
    .eq("execution_scope_sha256", executionScopeSha256)
    .maybeSingle();
  if (searchResult.error || !searchResult.data) throw new FlightConsumerPreviewPaymentWorkflowError();
  return Object.freeze({ order, search: searchRowSchema.parse(searchResult.data) });
}

async function readExistingPaymentAttempt(input: Readonly<{
  customerId: string;
  orderId: string;
}>) {
  const result = await createAdminClient().rpc("get_flight_consumer_payment_operation_v1", {
    p_customer_id: input.customerId,
    p_order_id: input.orderId,
    p_operation: "create_intent",
  });
  if (result.error) throw new FlightConsumerPreviewPaymentWorkflowError();
  const parsed = z.array(existingAttemptSchema).max(1).safeParse(result.data);
  if (!parsed.success) throw new FlightConsumerPreviewPaymentWorkflowError();
  return parsed.data[0] ?? null;
}

async function loadExistingPayment(input: Readonly<{
  paymentId: string;
  orderId: string;
  executionScopeSha256: string;
}>) {
  const result = await createAdminClient().from("flight_payments")
    .select("id,processor_reference_ciphertext,processor_reference_sha256,status")
    .eq("id", input.paymentId)
    .eq("order_id", input.orderId)
    .eq("processor_code", "stripe")
    .eq("execution_mode", "test")
    .eq("execution_scope_sha256", input.executionScopeSha256)
    .maybeSingle();
  if (result.error || !result.data) throw new FlightConsumerPreviewPaymentWorkflowError();
  return existingPaymentSchema.parse(result.data);
}

async function recoverExistingPaymentAttempt(input: Readonly<{
  customerId: string;
  order: z.infer<typeof orderRowSchema>;
  runtime: Awaited<ReturnType<typeof requireFlightConsumerPreviewRequestRuntime>>;
  attempt: z.infer<typeof existingAttemptSchema>;
  idempotencyKeySha256: string;
}>) {
  const { attempt, order, runtime } = input;
  if (
    attempt.customer_id !== input.customerId
    || attempt.order_id !== order.id
    || attempt.amount_cents !== order.total_cents
    || attempt.currency !== order.currency
    || attempt.processor_account_sha256 !== runtime.binding.paymentAccountSha256
    || attempt.processor_source_sha256 !== runtime.binding.paymentSourceSha256
    || attempt.processor_adapter_version_sha256 !== runtime.binding.paymentAdapterVersionSha256
     || attempt.adapter_source_sha256 !== runtime.binding.paymentSourceSha256
     || attempt.idempotency_key_sha256 !== input.idempotencyKeySha256
     || (attempt.attempt_state === "prepared" && attempt.attempt_revision !== 0)
     || (attempt.attempt_state === "dispatching" && attempt.attempt_revision !== 1)
     || (["succeeded", "failed", "ambiguous"].includes(attempt.attempt_state)
       && attempt.attempt_revision !== 2)
     || (attempt.attempt_state === "blocked" && attempt.attempt_revision !== 1)
  ) throw new FlightConsumerPreviewPaymentWorkflowError();
  if (
    attempt.attempt_state === "prepared"
    && Date.parse(attempt.dispatch_not_after) <= Date.now()
  ) {
    const authority = createFlightConsumerPreviewAuthority(runtime.binding);
    const blockedResult = await createAdminClient().rpc(
      "complete_flight_consumer_payment_operation_v1",
      {
        p_attempt_id: attempt.attempt_id,
        p_expected_revision: 0,
        p_terminal_state: "blocked",
        p_terminal_http_status: null,
        p_terminal_response_sha256: null,
        p_terminal_response_bytes: null,
        p_terminal_receipt_sha256: authority.operationReceipt("stripe-create-intent-expired", {
          attemptId: attempt.attempt_id,
          orderId: order.id,
          dispatchNotAfter: attempt.dispatch_not_after,
        }),
      },
    );
    if (blockedResult.error) throw new FlightConsumerPreviewPaymentWorkflowError();
    const blocked = oneRow(z.object({
      attempt_id: z.string().uuid(),
      attempt_revision: z.literal(1),
      attempt_state: z.literal("blocked"),
    }).passthrough(), blockedResult.data);
    if (blocked.attempt_id !== attempt.attempt_id) throw new FlightConsumerPreviewPaymentWorkflowError();
    throw new FlightConsumerPreviewPaymentWorkflowError();
  }
  if (
    attempt.attempt_state === "dispatching"
    && Date.parse(attempt.dispatch_not_after) <= Date.now()
  ) {
    throw new FlightConsumerPreviewPaymentWorkflowError();
  }
  const stripe = await createFlightConsumerPreviewStripePayment({
    orderId: order.id,
    customerId: input.customerId,
    amountCents: order.total_cents,
    runtimeBinding: runtime.binding,
  });
  if (attempt.attempt_state === "succeeded") {
    if (attempt.payment_id === null) throw new FlightConsumerPreviewPaymentWorkflowError();
    const payment = await loadExistingPayment({
      paymentId: attempt.payment_id,
      orderId: order.id,
      executionScopeSha256: runtime.binding.executionScopeSha256,
    });
    const paymentIntentId = decryptFlightConsumerPreviewReference({
      ciphertext: payment.processor_reference_ciphertext,
      expectedReferenceSha256: payment.processor_reference_sha256,
      context: {
        kind: "stripe_payment_intent",
        customerId: input.customerId,
        resourceId: order.id,
        executionScopeSha256: runtime.binding.executionScopeSha256,
      },
      keyring: readFlightConsumerPreviewReferenceKeyring(),
    });
    const recovered = await stripe.retrievePaymentIntentForCheckout({ paymentIntentId });
    return Object.freeze({
      orderId: order.id,
      paymentId: payment.id,
      paymentIntentId: recovered.paymentIntentId,
      clientSecret: recovered.clientSecret,
    });
  }
  if (["failed", "ambiguous", "blocked"].includes(attempt.attempt_state)) {
    throw new FlightConsumerPreviewPaymentWorkflowError();
  }
  let dispatching = attempt.attempt_state === "dispatching";
  if (attempt.attempt_state === "prepared") {
    const claimResult = await createAdminClient().rpc("claim_flight_consumer_payment_operation_v1", {
      p_attempt_id: attempt.attempt_id,
      p_expected_revision: 0,
      p_payment_binding_receipt_sha256: attempt.payment_binding_receipt_sha256,
      p_operation_authority_receipt_sha256: attempt.operation_authority_receipt_sha256,
    });
    if (claimResult.error) throw new FlightConsumerPreviewPaymentWorkflowError();
    const claim = oneRow(claimRowSchema, claimResult.data);
    if (claim.attempt_id !== attempt.attempt_id) throw new FlightConsumerPreviewPaymentWorkflowError();
    dispatching = true;
  }
  try {
    const created = await stripe.createPaymentIntent({ attemptId: attempt.attempt_id });
    const encryptedReference = encryptFlightConsumerPreviewReference({
      value: created.paymentIntentId,
      context: {
        kind: "stripe_payment_intent",
        customerId: input.customerId,
        resourceId: order.id,
        executionScopeSha256: runtime.binding.executionScopeSha256,
      },
      keyring: readFlightConsumerPreviewReferenceKeyring(),
    });
    const responseJson = canonicalFlightJson(created as unknown as FlightCanonicalJsonValue);
    const responseSha256 = sha256FlightEvidence(created as unknown as FlightCanonicalJsonValue);
    const authority = createFlightConsumerPreviewAuthority(runtime.binding);
    const terminalReceiptSha256 = authority.operationReceipt("stripe-create-intent-terminal", {
      attemptId: attempt.attempt_id,
      responseSha256,
      paymentIdempotencyKeySha256: created.paymentIdempotencyKeySha256,
    });
    const completedResult = await createAdminClient().rpc(
      "complete_flight_consumer_payment_intent_v1",
      {
        p_attempt_id: attempt.attempt_id,
        p_expected_revision: 1,
        p_terminal_state: "succeeded",
        p_terminal_http_status: 200,
        p_terminal_response_sha256: responseSha256,
        p_terminal_response_bytes: Buffer.byteLength(responseJson, "utf8"),
        p_terminal_receipt_sha256: terminalReceiptSha256,
        p_processor_reference_ciphertext: encryptedReference.ciphertext,
        p_processor_reference_sha256: encryptedReference.referenceSha256,
      },
    );
    if (completedResult.error) throw new FlightConsumerPreviewPaymentWorkflowError();
    const payment = oneRow(paymentRowSchema, completedResult.data);
    if (payment.attempt_id !== attempt.attempt_id) throw new FlightConsumerPreviewPaymentWorkflowError();
    return Object.freeze({
      orderId: order.id,
      paymentId: payment.payment_id,
      paymentIntentId: created.paymentIntentId,
      clientSecret: created.clientSecret,
    });
  } catch {
    if (dispatching) {
      const authority = createFlightConsumerPreviewAuthority(runtime.binding);
      await recordAmbiguousPaymentAttempt({
        attemptId: attempt.attempt_id,
        terminalReceiptSha256: authority.operationReceipt("stripe-create-intent-ambiguous", {
          attemptId: attempt.attempt_id,
          orderId: order.id,
        }),
      });
    }
    throw new FlightConsumerPreviewPaymentWorkflowError();
  }
}

async function recordAmbiguousPaymentAttempt(input: Readonly<{
  attemptId: string;
  terminalReceiptSha256: string;
}>) {
  try {
    const result = await createAdminClient().rpc("complete_flight_consumer_payment_operation_v1", {
      p_attempt_id: input.attemptId,
      p_expected_revision: 1,
      p_terminal_state: "ambiguous",
      p_terminal_http_status: null,
      p_terminal_response_sha256: null,
      p_terminal_response_bytes: null,
      p_terminal_receipt_sha256: input.terminalReceiptSha256,
    });
    if (result.error) {
      console.error("[flight-consumer-preview:payment] terminalization failed", {
        phase: "record_ambiguous_attempt",
        category: "database_rpc_rejected",
      });
      return false;
    }
    return true;
  } catch {
    // The dispatching operation remains reconciliation-only if terminal CAS fails.
    console.error("[flight-consumer-preview:payment] terminalization failed", {
      phase: "record_ambiguous_attempt",
      category: "database_rpc_unavailable",
    });
    return false;
  }
}

function logPaymentWorkflowFailure(phase: string, error: unknown) {
  console.error("[flight-consumer-preview:payment] workflow failed", {
    phase,
    category: error instanceof FlightConsumerPreviewStripePaymentError
      ? "stripe_adapter_guard"
      : error instanceof z.ZodError
        ? "schema_projection_rejected"
        : error instanceof FlightConsumerPreviewPaymentWorkflowError
          ? "workflow_guard"
          : "unexpected_failure",
    stripePhase: error instanceof FlightConsumerPreviewStripePaymentError
      ? error.phase
      : null,
  });
}

export async function prepareFlightConsumerPreviewPayment(input: Readonly<{
  customerId: string;
  orderId: string;
  idempotencyKey: string;
  travelerDisclosures: unknown;
}>) {
  const runtime = await requireFlightConsumerPreviewRequestRuntime();
  const { order, search } = await internalOrder(
    input.customerId,
    input.orderId,
    runtime.binding.executionScopeSha256,
  );
  if (
    order.status !== "pending_payment"
    || search.child_count !== 0
    || search.infant_in_seat_count !== 0
    || search.infant_on_lap_count !== 0
    || !verifyFlightConsumerPreviewFictionalTravelerDisclosure(
      input.travelerDisclosures,
      search.adult_count,
    )
  ) throw new FlightConsumerPreviewPaymentWorkflowError();

  const keySha256 = sha256FlightEvidence({
    version: "flight-consumer-preview-checkout-idempotency-v1",
    customerId: input.customerId,
    orderId: input.orderId,
    key: input.idempotencyKey,
  });

  const existingAttempt = await readExistingPaymentAttempt({
    customerId: input.customerId,
    orderId: input.orderId,
  });
  if (existingAttempt) {
    return recoverExistingPaymentAttempt({
      customerId: input.customerId,
      order,
      runtime,
      attempt: existingAttempt,
      idempotencyKeySha256: keySha256,
    });
  }

  const contextResult = await createAdminClient().rpc(
    "get_flight_consumer_offer_evidence_context_v1",
    {
      p_customer_id: input.customerId,
      p_search_id: order.search_id,
      p_offer_id: order.offer_id,
      p_stage: "refreshed",
    },
  );
  if (contextResult.error) throw new FlightConsumerPreviewPaymentWorkflowError();
  const evidenceContext = oneRow(evidenceContextSchema, contextResult.data);
  if (evidenceContext.reprice_receipt_id !== order.reprice_receipt_id) {
    throw new FlightConsumerPreviewPaymentWorkflowError();
  }
  const evidenceRepository = await createFlightConsumerPreviewOfferEvidenceRepository({
    customerId: input.customerId,
    searchId: order.search_id,
    offerId: order.offer_id,
    localOfferId: evidenceContext.local_offer_id,
  });
  const scope = {
    tenantId: "tenant_iratepilot_preview_0001" as const,
    commerceId: order.search_id,
    actorId: input.customerId,
  };
  const loaded = await evidenceRepository.verifyAndLoadOfferEvidence(
    evidenceContext.receipt_sha256,
    scope,
  );
  if (loaded.decision !== "verified" || loaded.record.stage !== "refreshed") {
    throw new FlightConsumerPreviewPaymentWorkflowError();
  }
  const rawOffer = Buffer.from(loaded.record.rawBodyBase64, "base64");
  let paymentAttemptId: string | null = null;
  let phase = "rehydrate_offer_evidence";
  try {
    // Rehydrate only after the authenticated raw record is loaded; this binds
    // the passenger digests and prevents a raw-response-only interpretation.
    const rehydrated = await rehydrateDuffelSandboxOfferEvidence(
      evidenceRepository,
      evidenceContext.receipt_sha256,
      scope,
    );
    if (rehydrated.evidence.version !== "duffel-refreshed-offer-v1") {
      throw new FlightConsumerPreviewPaymentWorkflowError();
    }
    phase = "extract_passenger_bindings";
    const providerPassengerIds = extractVerifiedDuffelPreviewPassengerIds({
      rawBody: rawOffer,
      expectedPassengerIdDigests: rehydrated.evidence.providerPassengerIdDigests,
      expectedCount: search.adult_count,
    });
    const stagedPii = await createStagedFlightConsumerPreviewPiiRepository({
      customerId: input.customerId,
      orderId: input.orderId,
    });
    phase = "stage_encrypted_passengers";
    const stored: FlightConsumerPiiStoreResult[] = [];
    for (const [index, providerPassengerId] of providerPassengerIds.entries()) {
      stored.push(await stagedPii.repository.createAndStore({
        travelerSequence: index + 1,
        providerPassengerId,
        departureDate: search.departure_date,
        scope,
      }));
    }
    const stagedParameters = stagedPii.takePreparedPassengers();
    const encryptedPassengers = stored.map((item) => {
      const parameters = stagedParameters.find((candidate) => (
        candidate.p_secure_pii_record_ref === item.securePiiRecordRef
      ));
      if (!parameters) throw new FlightConsumerPreviewPaymentWorkflowError();
      const travelerSequence = stored.indexOf(item) + 1;
      return normalizedStagedFlightConsumerPassenger(travelerSequence, parameters);
    });
    const requestSha256 = sha256FlightEvidence({
      version: "flight-consumer-preview-checkout-request-v1",
      customerId: input.customerId,
      orderId: input.orderId,
      travelerBindings: stored.map((item) => item.providerBinding),
    } as FlightCanonicalJsonValue);
    const authority = createFlightConsumerPreviewAuthority(runtime.binding);
    const paymentBindingReceiptSha256 = authority.operationReceipt("stripe-create-intent-binding", {
      customerId: input.customerId,
      orderId: input.orderId,
      requestSha256,
      executionScopeSha256: runtime.binding.executionScopeSha256,
    });
    const operationAuthorityReceiptSha256 = authority.operationReceipt("stripe-create-intent-authority", {
      customerId: input.customerId,
      orderId: input.orderId,
      requestSha256,
      runtimeControlReceiptSha256: runtime.binding.runtimeControlReceiptSha256,
    });
    phase = "prepare_payment_attempt";
    const preparedResult = await createAdminClient().rpc("prepare_flight_consumer_checkout_v1", {
      p_customer_id: input.customerId,
      p_order_id: input.orderId,
      p_key_sha256: keySha256,
      p_request_sha256: requestSha256,
      p_encrypted_passengers: encryptedPassengers,
      p_adapter_source_sha256: runtime.binding.paymentSourceSha256,
      p_payment_binding_receipt_sha256: paymentBindingReceiptSha256,
      p_operation_authority_receipt_sha256: operationAuthorityReceiptSha256,
      p_dispatch_not_after: new Date(Date.now() + 4 * 60_000).toISOString(),
    });
    if (preparedResult.error) throw new FlightConsumerPreviewPaymentWorkflowError();
    const prepared = oneRow(attemptRowSchema, preparedResult.data);
    paymentAttemptId = prepared.payment_attempt_id;
    if (prepared.amount_cents !== order.total_cents || prepared.currency !== order.currency) {
      throw new FlightConsumerPreviewPaymentWorkflowError();
    }
    phase = "claim_payment_attempt";
    const claimResult = await createAdminClient().rpc("claim_flight_consumer_payment_operation_v1", {
      p_attempt_id: prepared.payment_attempt_id,
      p_expected_revision: 0,
      p_payment_binding_receipt_sha256: paymentBindingReceiptSha256,
      p_operation_authority_receipt_sha256: operationAuthorityReceiptSha256,
    });
    if (claimResult.error) throw new FlightConsumerPreviewPaymentWorkflowError();
    const claim = oneRow(claimRowSchema, claimResult.data);
    if (claim.attempt_id !== prepared.payment_attempt_id) throw new FlightConsumerPreviewPaymentWorkflowError();

    phase = "initialize_stripe_payment";
    const stripe = await createFlightConsumerPreviewStripePayment({
      orderId: input.orderId,
      customerId: input.customerId,
      amountCents: order.total_cents,
      runtimeBinding: runtime.binding,
    });
    phase = "create_stripe_payment_intent";
    const created = await stripe.createPaymentIntent({ attemptId: prepared.payment_attempt_id });
    phase = "encrypt_stripe_reference";
    const encryptedReference = encryptFlightConsumerPreviewReference({
      value: created.paymentIntentId,
      context: {
        kind: "stripe_payment_intent",
        customerId: input.customerId,
        resourceId: input.orderId,
        executionScopeSha256: runtime.binding.executionScopeSha256,
      },
      keyring: readFlightConsumerPreviewReferenceKeyring(),
    });
    const responseJson = canonicalFlightJson(created as unknown as FlightCanonicalJsonValue);
    const responseSha256 = sha256FlightEvidence(created as unknown as FlightCanonicalJsonValue);
    const terminalReceiptSha256 = authority.operationReceipt("stripe-create-intent-terminal", {
      attemptId: prepared.payment_attempt_id,
      responseSha256,
      paymentIdempotencyKeySha256: created.paymentIdempotencyKeySha256,
    });
    phase = "complete_payment_intent";
    const completedResult = await createAdminClient().rpc(
      "complete_flight_consumer_payment_intent_v1",
      {
        p_attempt_id: prepared.payment_attempt_id,
        p_expected_revision: 1,
        p_terminal_state: "succeeded",
        p_terminal_http_status: 200,
        p_terminal_response_sha256: responseSha256,
        p_terminal_response_bytes: Buffer.byteLength(responseJson, "utf8"),
        p_terminal_receipt_sha256: terminalReceiptSha256,
        p_processor_reference_ciphertext: encryptedReference.ciphertext,
        p_processor_reference_sha256: encryptedReference.referenceSha256,
      },
    );
    if (completedResult.error) throw new FlightConsumerPreviewPaymentWorkflowError();
    const payment = oneRow(paymentRowSchema, completedResult.data);
    if (payment.attempt_id !== prepared.payment_attempt_id) {
      throw new FlightConsumerPreviewPaymentWorkflowError();
    }
    return Object.freeze({
      orderId: input.orderId,
      paymentId: payment.payment_id,
      paymentIntentId: created.paymentIntentId,
      clientSecret: created.clientSecret,
    });
  } catch (error) {
    logPaymentWorkflowFailure(phase, error);
    if (paymentAttemptId) {
      const authority = createFlightConsumerPreviewAuthority(runtime.binding);
      await recordAmbiguousPaymentAttempt({
        attemptId: paymentAttemptId,
        terminalReceiptSha256: authority.operationReceipt("stripe-create-intent-ambiguous", {
          attemptId: paymentAttemptId,
          orderId: input.orderId,
        }),
      });
    }
    throw new FlightConsumerPreviewPaymentWorkflowError();
  } finally {
    rawOffer.fill(0);
  }
}
