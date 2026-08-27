import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import {
  buildFlightIdempotencyIntent,
  canonicalFlightJson,
  evaluateFlightRuntimeAuthorization,
  sha256FlightEvidence,
  type FlightProductionActionAuthorization,
  type FlightProductionAuthorizationVerifier,
  type FlightRuntimePolicy,
  type FlightRuntimeProviderBinding,
} from "../runtime-safety";
import {
  buildFlightConsumerProductionStripePaymentIntentPlan,
  type FlightConsumerProductionStripePaymentIntentPlan,
} from "./stripe-payment-intent-plan.server";
import type {
  FlightConsumerLiveStripeExecutionPersistence,
} from "./stripe-live-payment-execution-persistence.server";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const amountSchema = z.number().int().min(50).max(99_999_999);
const adapterVersionSchema = z.string()
  .regex(/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/)
  .max(64);
const encryptedReferenceSchema = z.string().max(4096).regex(
  /^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,}$/,
);

const paymentBindingSchema = z.object({
  processorId: z.literal("stripe_live"),
  adapterVersion: adapterVersionSchema,
  adapterSourceDigest: sha256Schema,
  accountScopeReceiptDigest: sha256Schema,
  environmentScopeReceiptDigest: sha256Schema,
}).strict();

const planInputSchema = z.object({
  orderId: uuidSchema,
  customerId: uuidSchema,
  paymentAttemptId: uuidSchema,
  authoritativeAmountCents: amountSchema,
  paymentAmountCents: amountSchema,
  currency: z.literal("USD"),
  executionScopeSha256: sha256Schema,
  offerEvidenceSha256: sha256Schema,
  repriceEvidenceSha256: sha256Schema,
  orderPlanSha256: sha256Schema,
  orderRequestEnvelopeSha256: sha256Schema,
  paymentBinding: paymentBindingSchema,
}).strict();

const planJournalReceiptSchema = z.object({
  decision: z.enum(["created", "replay"]),
  planId: uuidSchema,
  recordedPlanSha256: sha256Schema,
  planMode: z.literal("zero_dispatch"),
}).strict();

const productionAuthorizationSchema = z.object({
  version: z.literal("flight-production-action-authorization-v2"),
  authorizationId: z.string().regex(
    /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/,
  ),
  operation: z.literal("authorize_payment"),
  provider: z.literal("provider_production"),
  scopeId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/),
  requestDigest: sha256Schema,
  idempotencyRequestDigest: sha256Schema,
  providerBindingDigest: sha256Schema,
  paymentBindingDigest: sha256Schema,
  settlementBindingDigest: z.null(),
  nonce: z.string().regex(/^[0-9a-f]{32,128}$/),
  issuedAtSeconds: z.number().int().nonnegative(),
  expiresAtSeconds: z.number().int().positive(),
  signatureHex: sha256Schema,
}).strict();

const inputSchema = z.object({
  planInput: planInputSchema,
  planJournalReceipt: planJournalReceiptSchema,
  productionAuthorization: productionAuthorizationSchema,
  dispatchNotAfter: z.string().datetime({ offset: true }),
  leaseTokenSha256: sha256Schema,
  leaseSeconds: z.number().int().min(15).max(120),
}).strict();

const stripePaymentIntentSchema = z.object({
  id: z.string().regex(/^pi_[A-Za-z0-9]{8,128}$/),
  object: z.literal("payment_intent"),
  livemode: z.literal(true),
  status: z.literal("requires_payment_method"),
  amount: amountSchema,
  currency: z.literal("usd"),
  capture_method: z.literal("manual"),
  confirmation_method: z.literal("automatic"),
  payment_method_types: z.tuple([z.literal("card")]),
  metadata: z.record(z.string().min(1).max(500)),
  client_secret: z.string().min(16).max(512).regex(
    /^pi_[A-Za-z0-9]{8,128}_secret_[A-Za-z0-9_]{8,384}$/,
  ),
}).strip().superRefine((value, context) => {
  if (!value.client_secret.startsWith(`${value.id}_secret_`)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["client_secret"],
      message: "The client secret must be bound to the returned PaymentIntent.",
    });
  }
});

const encryptedReferenceResultSchema = z.object({
  version: z.literal(
    "flight-consumer-live-stripe-reference-encryption-result-v1",
  ),
  ciphertext: encryptedReferenceSchema,
  plaintextReferenceSha256: sha256Schema,
}).strict();

const AUTHORIZATION_REPLAY_REASON =
  "Per-call Production authorization nonce has already been consumed.";
const INSPECT_CUSTOM = Symbol.for("nodejs.util.inspect.custom");

export const FLIGHT_CONSUMER_LIVE_STRIPE_CREATE_TRANSPORT_VERSION =
  "flight-consumer-live-stripe-payment-intent-create-transport-v1" as const;
export const FLIGHT_CONSUMER_LIVE_STRIPE_REFERENCE_ENCRYPTION_VERSION =
  "flight-consumer-live-stripe-reference-encryption-v1" as const;

export type FlightConsumerLiveStripePaymentIntentCreateRequest = Readonly<{
  amount: number;
  currency: "usd";
  capture_method: "manual";
  confirmation_method: "automatic";
  payment_method_types: readonly ["card"];
  metadata: Readonly<Record<string, string>>;
}>;

export type FlightConsumerLiveStripePaymentIntentCreateTransport = Readonly<{
  version: typeof FLIGHT_CONSUMER_LIVE_STRIPE_CREATE_TRANSPORT_VERSION;
  processorEnvironment: "stripe_live";
  livemode: true;
  retryImplemented: false;
  logsResponse: false;
  persistsResponse: false;
  createPaymentIntent: (
    request: FlightConsumerLiveStripePaymentIntentCreateRequest,
    options: Readonly<{ idempotencyKey: string }>,
  ) => Promise<unknown>;
}>;

export type FlightConsumerLiveStripeReferenceEncryptionPort = Readonly<{
  version: typeof FLIGHT_CONSUMER_LIVE_STRIPE_REFERENCE_ENCRYPTION_VERSION;
  encryptPaymentIntentReference: (input: Readonly<{
    plaintextReference: string;
    plaintextReferenceSha256: string;
    executionWorkflowSha256: string;
  }>) => Promise<unknown>;
}>;

export type FlightConsumerLiveStripeClientSecretCapability = Readonly<{
  kind: "flight-consumer-live-stripe-client-secret-capability-v1";
  serializable: false;
  consumed: boolean;
  useOnce: <T>(consumer: (clientSecret: string) => T) => T;
}>;

class EphemeralClientSecretCapability
implements FlightConsumerLiveStripeClientSecretCapability {
  readonly kind =
    "flight-consumer-live-stripe-client-secret-capability-v1" as const;
  readonly serializable = false as const;
  #clientSecret: string | null;

  constructor(clientSecret: string) {
    this.#clientSecret = clientSecret;
    Object.freeze(this);
  }

  get consumed() {
    return this.#clientSecret === null;
  }

  useOnce<T>(consumer: (clientSecret: string) => T): T {
    if (this.#clientSecret === null || typeof consumer !== "function") {
      throw new FlightConsumerLiveStripePaymentIntentCreateError(
        "client_secret_capability_refused",
      );
    }
    const clientSecret = this.#clientSecret;
    this.#clientSecret = null;
    return consumer(clientSecret);
  }

  toJSON(): never {
    throw new FlightConsumerLiveStripePaymentIntentCreateError(
      "client_secret_capability_refused",
    );
  }

  toString() {
    return "[FlightConsumerLiveStripeClientSecretCapability REDACTED]";
  }

  [INSPECT_CUSTOM]() {
    return this.toString();
  }
}

type ReceiptBase = Readonly<{
  version: "flight-consumer-live-stripe-payment-intent-create-result-v1";
  planId: string;
  planSha256: string;
  executionWorkflowSha256: string;
  executionPrerequisiteSha256: string;
  providerRequestCount: 0 | 1;
  stripeMutationCount: 0 | 1;
  paymentIntentCreateCount: 0 | 1;
  clientSecretPersistedByOrchestrator: false;
  clientSecretLoggedByOrchestrator: false;
  confirmationAuthorized: false;
  paymentAuthorized: false;
  captureAuthorized: false;
  refundAuthorized: false;
  orderAuthorized: false;
  ticketingAuthorized: false;
  consumerReleaseEnabled: false;
  blindRetryAuthorized: false;
}>;

export type FlightConsumerLiveStripePaymentIntentCreateResult =
  | (ReceiptBase & Readonly<{
    decision: "completed";
    attemptId: string;
    attemptState: "completed";
    stateReceiptSha256: string;
    paymentIntentReferenceSha256: string;
    clientSecretCapability: FlightConsumerLiveStripeClientSecretCapability;
    consumerConfirmationRemainsLaterGate: true;
  }>)
  | (ReceiptBase & Readonly<{
    decision: "replay";
    replayStage: "authority" | "prepare" | "claim" | "complete";
    attemptId: string | null;
    attemptState: "prepared" | "claimed" | "completed" | "ambiguous"
      | "reconciled" | null;
    stateReceiptSha256: string | null;
    paymentIntentReferenceSha256: string | null;
    clientSecretCapability: null;
    consumerConfirmationRemainsLaterGate: true;
  }>)
  | (ReceiptBase & Readonly<{
    decision: "ambiguous";
    ambiguityCode: string;
    attemptId: string;
    attemptState: "ambiguous";
    stateReceiptSha256: string;
    paymentIntentReferenceSha256: null;
    clientSecretCapability: null;
    consumerConfirmationRemainsLaterGate: true;
  }>);

export class FlightConsumerLiveStripePaymentIntentCreateError extends Error {
  readonly reason:
    | "invalid_input"
    | "invalid_dependency"
    | "plan_binding_mismatch"
    | "authority_refused"
    | "persistence_refused"
    | "ambiguity_persistence_failed"
    | "client_secret_capability_refused";
  readonly blindRetryAuthorized = false as const;

  constructor(
    reason: FlightConsumerLiveStripePaymentIntentCreateError["reason"],
  ) {
    super("Flight Consumer Live Stripe PaymentIntent creation was refused.");
    this.name = "FlightConsumerLiveStripePaymentIntentCreateError";
    this.reason = reason;
  }
}

export type FlightConsumerLiveStripePaymentIntentCreateOrchestrator =
  Readonly<{
    version: "flight-consumer-live-stripe-payment-intent-create-orchestrator-v1";
    routeExposed: false;
    consumerReachable: false;
    environmentReadImplemented: false;
    captureImplemented: false;
    confirmationImplemented: false;
    refundImplemented: false;
    orderImplemented: false;
    ticketingImplemented: false;
    blindProviderRetryImplemented: false;
    execute: (
      input: unknown,
    ) => Promise<FlightConsumerLiveStripePaymentIntentCreateResult>;
  }>;

type Dependencies = Readonly<{
  runtimePolicy: FlightRuntimePolicy;
  providerExecutionBinding: FlightRuntimeProviderBinding;
  productionAuthorizationVerifier: FlightProductionAuthorizationVerifier;
  executionPersistence: FlightConsumerLiveStripeExecutionPersistence;
  stripeTransport: FlightConsumerLiveStripePaymentIntentCreateTransport;
  referenceEncryption: FlightConsumerLiveStripeReferenceEncryptionPort;
}>;

function sha256Utf8(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function equalSha256(left: string, right: string) {
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function buildPlanArtifacts(
  input: z.output<typeof planInputSchema>,
): Readonly<{
  plan: FlightConsumerProductionStripePaymentIntentPlan;
  request: FlightConsumerLiveStripePaymentIntentCreateRequest;
  idempotencyKey: string;
}> {
  let plan: FlightConsumerProductionStripePaymentIntentPlan;
  try {
    plan = buildFlightConsumerProductionStripePaymentIntentPlan(input);
  } catch {
    throw new FlightConsumerLiveStripePaymentIntentCreateError(
      "invalid_input",
    );
  }
  const metadata = Object.freeze({
    integration: "flight_consumer_production_plan_v1",
    execution_mode: "live_plan_only",
    order_reference_sha256: plan.orderReferenceSha256,
    customer_reference_sha256: plan.customerReferenceSha256,
    payment_attempt_reference_sha256: plan.paymentAttemptReferenceSha256,
    execution_scope_sha256: plan.executionScopeSha256,
    offer_evidence_sha256: input.offerEvidenceSha256,
    reprice_evidence_sha256: input.repriceEvidenceSha256,
    order_plan_sha256: input.orderPlanSha256,
    order_request_envelope_sha256: input.orderRequestEnvelopeSha256,
    payment_binding_sha256: plan.paymentBindingSha256,
  });
  const metadataSha256 = sha256FlightEvidence({
    version: "flight-consumer-production-stripe-payment-metadata-v1",
    ...metadata,
  });
  const request = Object.freeze({
    amount: plan.amountCents,
    currency: "usd" as const,
    capture_method: "manual" as const,
    confirmation_method: "automatic" as const,
    payment_method_types: Object.freeze(["card"] as const),
    metadata,
  });
  const requestBodySha256 = sha256FlightEvidence({
    version:
      "flight-consumer-production-stripe-payment-intent-request-body-v1",
    ...request,
  });
  const idempotency = buildFlightIdempotencyIntent({
    operation: "authorize_payment",
    scopeId: input.orderId,
    requestId: input.paymentAttemptId,
    payload: {
      version:
        "flight-consumer-production-stripe-payment-intent-idempotency-v1",
      amountCents: plan.amountCents,
      currency: "USD",
      executionScopeSha256: plan.executionScopeSha256,
      offerEvidenceSha256: input.offerEvidenceSha256,
      repriceEvidenceSha256: input.repriceEvidenceSha256,
      orderPlanSha256: input.orderPlanSha256,
      orderRequestEnvelopeSha256: input.orderRequestEnvelopeSha256,
      paymentBindingSha256: plan.paymentBindingSha256,
      orderReferenceSha256: plan.orderReferenceSha256,
      customerReferenceSha256: plan.customerReferenceSha256,
      paymentAttemptReferenceSha256: plan.paymentAttemptReferenceSha256,
      requestBodySha256,
    },
  });
  const requestEnvelopeSha256 = sha256FlightEvidence({
    version:
      "flight-consumer-production-stripe-payment-intent-request-envelope-v1",
    method: "POST",
    path: "/v1/payment_intents",
    contentType: "application/x-www-form-urlencoded",
    requestBodySha256,
    idempotencyRequestSha256: idempotency.requestDigest,
    idempotencyKeySha256: sha256Utf8(idempotency.idempotencyKey),
  });
  if (
    !equalSha256(metadataSha256, plan.metadataSha256)
    || !equalSha256(requestBodySha256, plan.requestBodySha256)
    || !equalSha256(idempotency.requestDigest, plan.idempotencyRequestSha256)
    || !equalSha256(
      sha256Utf8(idempotency.idempotencyKey),
      plan.idempotencyKeySha256,
    )
    || !equalSha256(requestEnvelopeSha256, plan.requestEnvelopeSha256)
  ) {
    throw new FlightConsumerLiveStripePaymentIntentCreateError(
      "plan_binding_mismatch",
    );
  }
  return Object.freeze({ plan, request, idempotencyKey: idempotency.idempotencyKey });
}

function authorizationEvidenceSha256(
  authorization: FlightProductionActionAuthorization,
) {
  return sha256FlightEvidence({
    version:
      "flight-consumer-live-stripe-payment-intent-create-authorization-evidence-v1",
    authorizationId: authorization.authorizationId,
    operation: authorization.operation,
    provider: authorization.provider,
    scopeId: authorization.scopeId,
    requestDigest: authorization.requestDigest,
    idempotencyRequestDigest: authorization.idempotencyRequestDigest,
    providerBindingDigest: authorization.providerBindingDigest,
    paymentBindingDigest: authorization.paymentBindingDigest,
    settlementBindingDigest: authorization.settlementBindingDigest,
    nonce: authorization.nonce,
    issuedAtSeconds: authorization.issuedAtSeconds,
    expiresAtSeconds: authorization.expiresAtSeconds,
    signatureHex: authorization.signatureHex,
  });
}

function receiptBase(input: Readonly<{
  planId: string;
  planSha256: string;
  executionWorkflowSha256: string;
  executionPrerequisiteSha256: string;
  providerRequestCount: 0 | 1;
}>): ReceiptBase {
  return Object.freeze({
    version:
      "flight-consumer-live-stripe-payment-intent-create-result-v1" as const,
    ...input,
    stripeMutationCount: input.providerRequestCount,
    paymentIntentCreateCount: input.providerRequestCount,
    clientSecretPersistedByOrchestrator: false as const,
    clientSecretLoggedByOrchestrator: false as const,
    confirmationAuthorized: false as const,
    paymentAuthorized: false as const,
    captureAuthorized: false as const,
    refundAuthorized: false as const,
    orderAuthorized: false as const,
    ticketingAuthorized: false as const,
    consumerReleaseEnabled: false as const,
    blindRetryAuthorized: false as const,
  });
}

function replayResult(input: Readonly<{
  base: ReceiptBase;
  replayStage: "authority" | "prepare" | "claim" | "complete";
  attemptId: string | null;
  attemptState: "prepared" | "claimed" | "completed" | "ambiguous"
    | "reconciled" | null;
  stateReceiptSha256: string | null;
  paymentIntentReferenceSha256?: string | null;
}>): FlightConsumerLiveStripePaymentIntentCreateResult {
  return Object.freeze({
    ...input.base,
    decision: "replay" as const,
    replayStage: input.replayStage,
    attemptId: input.attemptId,
    attemptState: input.attemptState,
    stateReceiptSha256: input.stateReceiptSha256,
    paymentIntentReferenceSha256:
      input.paymentIntentReferenceSha256 ?? null,
    clientSecretCapability: null,
    consumerConfirmationRemainsLaterGate: true as const,
  });
}

function validateDependencies(dependencies: Dependencies) {
  const persistence = dependencies.executionPersistence;
  if (
    persistence.migrationVersion !== "202608260106"
    || persistence.processorEnvironment !== "stripe_live"
    || persistence.livemode !== true
    || persistence.routeExposed !== false
    || persistence.stripeTransportImplemented !== false
    || persistence.providerDispatchImplemented !== false
    || persistence.databaseApplyAuthorized !== false
    || persistence.stripeDispatchAuthorized !== false
    || persistence.paymentAuthorized !== false
    || persistence.orderAuthorized !== false
    || persistence.captureAuthorized !== false
    || persistence.refundAuthorized !== false
    || persistence.settlementAuthorized !== false
    || persistence.ticketingAuthorized !== false
    || persistence.servicingAuthorized !== false
    || persistence.consumerReleaseEnabled !== false
    || persistence.blindRetryAuthorized !== false
    || dependencies.stripeTransport.version
      !== FLIGHT_CONSUMER_LIVE_STRIPE_CREATE_TRANSPORT_VERSION
    || dependencies.stripeTransport.processorEnvironment !== "stripe_live"
    || dependencies.stripeTransport.livemode !== true
    || dependencies.stripeTransport.retryImplemented !== false
    || dependencies.stripeTransport.logsResponse !== false
    || dependencies.stripeTransport.persistsResponse !== false
    || dependencies.referenceEncryption.version
      !== FLIGHT_CONSUMER_LIVE_STRIPE_REFERENCE_ENCRYPTION_VERSION
  ) {
    throw new FlightConsumerLiveStripePaymentIntentCreateError(
      "invalid_dependency",
    );
  }
}

export function createFlightConsumerLiveStripePaymentIntentCreateOrchestrator(
  dependencies: Dependencies,
): FlightConsumerLiveStripePaymentIntentCreateOrchestrator {
  validateDependencies(dependencies);

  return Object.freeze({
    version:
      ("flight-consumer-live-stripe-payment-intent-create-orchestrator-v1" as const),
    routeExposed: false as const,
    consumerReachable: false as const,
    environmentReadImplemented: false as const,
    captureImplemented: false as const,
    confirmationImplemented: false as const,
    refundImplemented: false as const,
    orderImplemented: false as const,
    ticketingImplemented: false as const,
    blindProviderRetryImplemented: false as const,

    async execute(
      untrustedInput: unknown,
    ): Promise<FlightConsumerLiveStripePaymentIntentCreateResult> {
      const accepted = inputSchema.safeParse(untrustedInput);
      if (!accepted.success) {
        throw new FlightConsumerLiveStripePaymentIntentCreateError(
          "invalid_input",
        );
      }
      const input = accepted.data;
      const artifacts = buildPlanArtifacts(input.planInput);
      const { plan } = artifacts;
      if (!equalSha256(
        input.planJournalReceipt.recordedPlanSha256,
        plan.planSha256,
      )) {
        throw new FlightConsumerLiveStripePaymentIntentCreateError(
          "plan_binding_mismatch",
        );
      }
      const authorization = input.productionAuthorization;
      if (
        authorization.scopeId !== input.planInput.orderId
        || !equalSha256(authorization.requestDigest, plan.requestEnvelopeSha256)
        || !equalSha256(
          authorization.idempotencyRequestDigest,
          plan.idempotencyRequestSha256,
        )
        || !equalSha256(
          authorization.paymentBindingDigest,
          plan.paymentBindingSha256,
        )
      ) {
        throw new FlightConsumerLiveStripePaymentIntentCreateError(
          "authority_refused",
        );
      }

      let trustedNowSeconds: number;
      try {
        trustedNowSeconds =
          dependencies.productionAuthorizationVerifier.readTrustedTimeSeconds();
      } catch {
        throw new FlightConsumerLiveStripePaymentIntentCreateError(
          "authority_refused",
        );
      }
      const dispatchNotAfterMilliseconds = Date.parse(input.dispatchNotAfter);
      if (
        !Number.isSafeInteger(trustedNowSeconds)
        || trustedNowSeconds < 0
        || dispatchNotAfterMilliseconds <= trustedNowSeconds * 1000
        || dispatchNotAfterMilliseconds > trustedNowSeconds * 1000 + 120_000
        || dispatchNotAfterMilliseconds
          > authorization.expiresAtSeconds * 1000
      ) {
        throw new FlightConsumerLiveStripePaymentIntentCreateError(
          "authority_refused",
        );
      }

      const authorizationSha256 = authorizationEvidenceSha256(authorization);
      const executionWorkflowSha256 = sha256FlightEvidence({
        version:
          "flight-consumer-live-stripe-payment-intent-create-workflow-v1",
        migrationVersion: "202608260106",
        planId: input.planJournalReceipt.planId,
        planSha256: plan.planSha256,
        requestEnvelopeSha256: plan.requestEnvelopeSha256,
        idempotencyRequestSha256: plan.idempotencyRequestSha256,
        idempotencyKeySha256: plan.idempotencyKeySha256,
        authorizationSha256,
      });
      const executionPrerequisiteSha256 = sha256FlightEvidence({
        version:
          "flight-consumer-live-stripe-payment-intent-create-prerequisite-v1",
        executionWorkflowSha256,
        dispatchNotAfter: input.dispatchNotAfter,
        leaseTokenSha256: input.leaseTokenSha256,
        leaseSeconds: input.leaseSeconds,
        transportVersion: dependencies.stripeTransport.version,
        referenceEncryptionVersion: dependencies.referenceEncryption.version,
      });
      const zeroRequestBase = receiptBase({
        planId: input.planJournalReceipt.planId,
        planSha256: plan.planSha256,
        executionWorkflowSha256,
        executionPrerequisiteSha256,
        providerRequestCount: 0,
      });

      const authorizationDecision = await evaluateFlightRuntimeAuthorization(
        dependencies.runtimePolicy,
        "authorize_payment",
        "provider_production",
        {
          executionBinding: dependencies.providerExecutionBinding,
          paymentExecutionBinding: input.planInput.paymentBinding,
          settlementExecutionBinding: null,
          productionAuthorization: authorization,
          productionAuthorizationVerifier:
            dependencies.productionAuthorizationVerifier,
          scopeId: input.planInput.orderId,
          requestDigest: plan.requestEnvelopeSha256,
          idempotencyRequestDigest: plan.idempotencyRequestSha256,
        },
      );
      if (!authorizationDecision.authorized) {
        if (
          authorizationDecision.reasons.length === 1
          && authorizationDecision.reasons[0] === AUTHORIZATION_REPLAY_REASON
        ) {
          return replayResult({
            base: zeroRequestBase,
            replayStage: "authority",
            attemptId: null,
            attemptState: null,
            stateReceiptSha256: null,
          });
        }
        throw new FlightConsumerLiveStripePaymentIntentCreateError(
          "authority_refused",
        );
      }

      let prepared: Awaited<
        ReturnType<FlightConsumerLiveStripeExecutionPersistence["prepare"]>
      >;
      try {
        prepared = await dependencies.executionPersistence.prepare({
          planId: input.planJournalReceipt.planId,
          planSha256: plan.planSha256,
          executionWorkflowSha256,
          executionPrerequisiteSha256,
          dispatchNotAfter: input.dispatchNotAfter,
        });
      } catch {
        throw new FlightConsumerLiveStripePaymentIntentCreateError(
          "persistence_refused",
        );
      }
      if (prepared.decision === "replay") {
        return replayResult({
          base: zeroRequestBase,
          replayStage: "prepare",
          attemptId: prepared.attempt_id,
          attemptState: prepared.attempt_state,
          stateReceiptSha256: prepared.state_receipt_sha256,
        });
      }

      let claimed: Awaited<
        ReturnType<FlightConsumerLiveStripeExecutionPersistence["claim"]>
      >;
      try {
        claimed = await dependencies.executionPersistence.claim({
          attemptId: prepared.attempt_id,
          expectedRevision: 0,
          executionScopeSha256: plan.executionScopeSha256,
          leaseTokenSha256: input.leaseTokenSha256,
          leaseSeconds: input.leaseSeconds,
        });
      } catch {
        throw new FlightConsumerLiveStripePaymentIntentCreateError(
          "persistence_refused",
        );
      }
      if (claimed.attempt_id !== prepared.attempt_id) {
        throw new FlightConsumerLiveStripePaymentIntentCreateError(
          "persistence_refused",
        );
      }
      if (claimed.decision === "replay") {
        return replayResult({
          base: zeroRequestBase,
          replayStage: "claim",
          attemptId: claimed.attempt_id,
          attemptState: claimed.attempt_state,
          stateReceiptSha256: claimed.state_receipt_sha256,
        });
      }

      const oneRequestBase = receiptBase({
        planId: input.planJournalReceipt.planId,
        planSha256: plan.planSha256,
        executionWorkflowSha256,
        executionPrerequisiteSha256,
        providerRequestCount: 1,
      });

      const terminalizeAmbiguous = async (
        ambiguityCode: string,
      ): Promise<FlightConsumerLiveStripePaymentIntentCreateResult> => {
        const ambiguityEvidenceSha256 = sha256FlightEvidence({
          version:
            "flight-consumer-live-stripe-payment-intent-create-ambiguity-v1",
          ambiguityCode,
          attemptId: claimed.attempt_id,
          executionWorkflowSha256,
          executionPrerequisiteSha256,
          planSha256: plan.planSha256,
          requestEnvelopeSha256: plan.requestEnvelopeSha256,
          idempotencyKeySha256: plan.idempotencyKeySha256,
          livemode: true,
          blindRetryAuthorized: false,
        });
        try {
          const ambiguous = await dependencies.executionPersistence
            .markAmbiguous({
              attemptId: claimed.attempt_id,
              expectedRevision: 1,
              executionScopeSha256: plan.executionScopeSha256,
              leaseTokenSha256: input.leaseTokenSha256,
              ambiguityCode,
              ambiguityEvidenceSha256,
              livemode: true,
            });
          if (ambiguous.attempt_id !== claimed.attempt_id) {
            throw new Error("Mismatched ambiguity attempt.");
          }
          return Object.freeze({
            ...oneRequestBase,
            decision: "ambiguous" as const,
            ambiguityCode,
            attemptId: ambiguous.attempt_id,
            attemptState: ambiguous.attempt_state,
            stateReceiptSha256: ambiguous.state_receipt_sha256,
            paymentIntentReferenceSha256: null,
            clientSecretCapability: null,
            consumerConfirmationRemainsLaterGate: true as const,
          });
        } catch {
          throw new FlightConsumerLiveStripePaymentIntentCreateError(
            "ambiguity_persistence_failed",
          );
        }
      };

      let dispatchTrustedNowSeconds: number;
      try {
        dispatchTrustedNowSeconds = dependencies.productionAuthorizationVerifier
          .readTrustedTimeSeconds();
      } catch {
        throw new FlightConsumerLiveStripePaymentIntentCreateError(
          "authority_refused",
        );
      }
      const claimLeaseExpiresAtMilliseconds = Date.parse(
        claimed.lease_expires_at,
      );
      const dispatchTrustedNowMilliseconds = dispatchTrustedNowSeconds * 1000;
      if (
        !Number.isSafeInteger(dispatchTrustedNowSeconds)
        || dispatchTrustedNowSeconds < 0
        || !Number.isFinite(claimLeaseExpiresAtMilliseconds)
        || dispatchTrustedNowMilliseconds >= dispatchNotAfterMilliseconds
        || dispatchTrustedNowSeconds >= authorization.expiresAtSeconds
        || dispatchTrustedNowMilliseconds >= claimLeaseExpiresAtMilliseconds
      ) {
        throw new FlightConsumerLiveStripePaymentIntentCreateError(
          "authority_refused",
        );
      }

      let providerResult: z.output<typeof stripePaymentIntentSchema>;
      try {
        const rawProviderResult = await dependencies.stripeTransport
          .createPaymentIntent(
            artifacts.request,
            Object.freeze({ idempotencyKey: artifacts.idempotencyKey }),
          );
        const parsedProviderResult = stripePaymentIntentSchema.safeParse(
          rawProviderResult,
        );
        if (!parsedProviderResult.success) {
          return terminalizeAmbiguous("stripe_create_response_refused");
        }
        providerResult = parsedProviderResult.data;
      } catch {
        return terminalizeAmbiguous("stripe_create_outcome_unknown");
      }
      if (
        providerResult.amount !== plan.amountCents
        || canonicalFlightJson(providerResult.payment_method_types)
          !== canonicalFlightJson(["card"])
        || canonicalFlightJson(providerResult.metadata)
          !== canonicalFlightJson(artifacts.request.metadata)
      ) {
        return terminalizeAmbiguous("stripe_create_binding_mismatch");
      }

      const paymentIntentReferenceSha256 = sha256Utf8(providerResult.id);
      const terminalResponseSha256 = sha256FlightEvidence({
        version:
          "flight-consumer-live-stripe-payment-intent-create-response-v1",
        paymentIntentReferenceSha256,
        object: providerResult.object,
        livemode: providerResult.livemode,
        status: providerResult.status,
        amount: providerResult.amount,
        currency: providerResult.currency,
        captureMethod: providerResult.capture_method,
        confirmationMethod: providerResult.confirmation_method,
        paymentMethodTypes: providerResult.payment_method_types,
        metadataSha256: plan.metadataSha256,
      });

      let encryptedReference: z.output<typeof encryptedReferenceResultSchema>;
      try {
        const encrypted = await dependencies.referenceEncryption
          .encryptPaymentIntentReference({
            plaintextReference: providerResult.id,
            plaintextReferenceSha256: paymentIntentReferenceSha256,
            executionWorkflowSha256,
          });
        const acceptedEncryption = encryptedReferenceResultSchema.safeParse(
          encrypted,
        );
        if (
          !acceptedEncryption.success
          || !equalSha256(
            acceptedEncryption.data.plaintextReferenceSha256,
            paymentIntentReferenceSha256,
          )
        ) {
          return terminalizeAmbiguous("stripe_reference_encryption_failed");
        }
        encryptedReference = acceptedEncryption.data;
      } catch {
        return terminalizeAmbiguous("stripe_reference_encryption_failed");
      }

      const completionEvidenceSha256 = sha256FlightEvidence({
        version:
          "flight-consumer-live-stripe-payment-intent-create-completion-v1",
        attemptId: claimed.attempt_id,
        planId: input.planJournalReceipt.planId,
        planSha256: plan.planSha256,
        executionWorkflowSha256,
        executionPrerequisiteSha256,
        paymentIntentReferenceSha256,
        terminalResponseSha256,
        idempotencyKeySha256: plan.idempotencyKeySha256,
        livemode: true,
      });

      let completed: Awaited<
        ReturnType<FlightConsumerLiveStripeExecutionPersistence["complete"]>
      >;
      try {
        completed = await dependencies.executionPersistence.complete({
          attemptId: claimed.attempt_id,
          expectedRevision: 1,
          executionScopeSha256: plan.executionScopeSha256,
          leaseTokenSha256: input.leaseTokenSha256,
          paymentIntentReferenceCiphertext: encryptedReference.ciphertext,
          paymentIntentReferenceSha256,
          terminalResponseSha256,
          completionEvidenceSha256,
          livemode: true,
        });
      } catch {
        return terminalizeAmbiguous(
          "stripe_completion_persistence_unknown",
        );
      }
      if (
        completed.attempt_id !== claimed.attempt_id
        || !equalSha256(
          completed.payment_intent_reference_sha256,
          paymentIntentReferenceSha256,
        )
      ) {
        return terminalizeAmbiguous(
          "stripe_completion_persistence_unknown",
        );
      }
      if (completed.decision === "replay") {
        return replayResult({
          base: oneRequestBase,
          replayStage: "complete",
          attemptId: completed.attempt_id,
          attemptState: completed.attempt_state,
          stateReceiptSha256: completed.state_receipt_sha256,
          paymentIntentReferenceSha256,
        });
      }

      return Object.freeze({
        ...oneRequestBase,
        decision: "completed" as const,
        attemptId: completed.attempt_id,
        attemptState: completed.attempt_state,
        stateReceiptSha256: completed.state_receipt_sha256,
        paymentIntentReferenceSha256,
        clientSecretCapability: new EphemeralClientSecretCapability(
          providerResult.client_secret,
        ),
        consumerConfirmationRemainsLaterGate: true as const,
      });
    },
  });
}
