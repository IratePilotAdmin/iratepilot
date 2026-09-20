import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import {
  buildFlightIdempotencyIntent,
  digestFlightRuntimePaymentBinding,
  digestFlightRuntimeProviderBinding,
  evaluateFlightRuntimeAuthorization,
  sha256FlightEvidence,
  type FlightProductionActionAuthorization,
  type FlightProductionAuthorizationVerifier,
  type FlightRuntimePaymentBinding,
  type FlightRuntimePolicy,
  type FlightRuntimeProviderBinding,
} from "../runtime-safety";
import type {
  FlightConsumerLiveStripeConfirmationPersistence,
} from "./stripe-confirmation-evidence-persistence.server";
import type {
  FlightConsumerLiveStripeClientSecretCapability,
} from "./stripe-live-payment-intent-create-orchestrator.server";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });
const amountSchema = z.number().int().min(50).max(99_999_999);
const adapterVersionSchema = z.string()
  .regex(/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/)
  .max(64);
const STRIPE_CLIENT_SECRET_PATTERN =
  /^(pi_[A-Za-z0-9]{8,128})_secret_[A-Za-z0-9_]{8,384}$/;
const clientSecretSchema = z.string().min(16).max(512).regex(
  STRIPE_CLIENT_SECRET_PATTERN,
);

const authorityFalseShape = {
  providerDispatchAuthorized: z.literal(false),
  stripeDispatchAuthorized: z.literal(false),
  bookingAuthorized: z.literal(false),
  orderAuthorized: z.literal(false),
  paymentAuthorized: z.literal(false),
  captureAuthorized: z.literal(false),
  refundAuthorized: z.literal(false),
  settlementAuthorized: z.literal(false),
  ticketingAuthorized: z.literal(false),
  servicingAuthorized: z.literal(false),
  consumerReleaseEnabled: z.literal(false),
  blindRetryAuthorized: z.literal(false),
} as const;

const createAuthorityFalseShape = {
  confirmationAuthorized: z.literal(false),
  paymentAuthorized: z.literal(false),
  captureAuthorized: z.literal(false),
  refundAuthorized: z.literal(false),
  orderAuthorized: z.literal(false),
  ticketingAuthorized: z.literal(false),
  consumerReleaseEnabled: z.literal(false),
  blindRetryAuthorized: z.literal(false),
} as const;

const paymentBindingSchema = z.object({
  processorId: z.literal("stripe_live"),
  adapterVersion: adapterVersionSchema,
  adapterSourceDigest: sha256Schema,
  accountScopeReceiptDigest: sha256Schema,
  environmentScopeReceiptDigest: sha256Schema,
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

const checkoutEvidenceSchema = z.object({
  migrationVersion: z.literal("202608260107"),
  aggregateId: uuidSchema,
  customerId: uuidSchema,
  orderId: uuidSchema,
  checkoutState: z.literal("prepared"),
  checkoutRevision: z.literal(0),
  checkoutStateReceiptSha256: sha256Schema,
  offerExpiresAt: instantSchema,
  executionScopeSha256: sha256Schema,
  checkoutBindingSha256: sha256Schema,
  stripePlanId: uuidSchema,
  stripePlanSha256: sha256Schema,
  stripeExecutionAttemptId: uuidSchema,
  stripeExecutionWorkflowSha256: sha256Schema,
  stripeExecutionPrerequisiteSha256: sha256Schema,
  stripeExecutionPreparedReceiptSha256: sha256Schema,
  paymentBindingSha256: sha256Schema,
  orderReferenceSha256: sha256Schema,
  customerReferenceSha256: sha256Schema,
  amountCents: amountSchema,
  currency: z.literal("USD"),
  ...authorityFalseShape,
}).strict().superRefine((value, context) => {
  if (value.orderReferenceSha256 === value.customerReferenceSha256) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["orderReferenceSha256"],
      message: "Order and customer reference evidence must be independent.",
    });
  }
});

const stripeCreateResultSchema = z.object({
  version: z.literal(
    "flight-consumer-live-stripe-payment-intent-create-result-v1",
  ),
  decision: z.literal("completed"),
  planId: uuidSchema,
  planSha256: sha256Schema,
  executionWorkflowSha256: sha256Schema,
  executionPrerequisiteSha256: sha256Schema,
  providerRequestCount: z.literal(1),
  stripeMutationCount: z.literal(1),
  paymentIntentCreateCount: z.literal(1),
  clientSecretPersistedByOrchestrator: z.literal(false),
  clientSecretLoggedByOrchestrator: z.literal(false),
  ...createAuthorityFalseShape,
  attemptId: uuidSchema,
  attemptState: z.literal("completed"),
  stateReceiptSha256: sha256Schema,
  paymentIntentReferenceSha256: sha256Schema,
  clientSecretCapability: z.unknown(),
  consumerConfirmationRemainsLaterGate: z.literal(true),
}).strict();

const prepareHandoffInputSchema = z.object({
  checkoutEvidence: checkoutEvidenceSchema,
  stripeCreateResult: stripeCreateResultSchema,
  paymentBinding: paymentBindingSchema,
  productionAuthorization: productionAuthorizationSchema,
  confirmationNotAfter: instantSchema,
  handoffTokenSha256: sha256Schema,
  handoffSeconds: z.number().int().min(15).max(300),
}).strict();

const persistedAuthorityFalseShape = {
  confirmation_handoff_authorized: z.literal(false),
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

const handoffSnapshotSchema = z.object({
  migrationVersion: z.literal("202608260109"),
  attemptId: uuidSchema,
  confirmationState: z.literal("handoff_claimed"),
  confirmationRevision: z.literal(1),
  stateReceiptSha256: sha256Schema,
  executionScopeSha256: sha256Schema,
  confirmationBindingSha256: sha256Schema,
  handoffTokenSha256: sha256Schema,
  paymentIntentReferenceSha256: sha256Schema,
  amountCents: amountSchema,
  currency: z.literal("USD"),
  confirmationNotAfter: instantSchema,
  ...authorityFalseShape,
}).strict();

const ambiguousSnapshotSchema = z.object({
  migrationVersion: z.literal("202608260109"),
  attemptId: uuidSchema,
  confirmationState: z.literal("ambiguous"),
  confirmationRevision: z.literal(2),
  stateReceiptSha256: sha256Schema,
  executionScopeSha256: sha256Schema,
  confirmationBindingSha256: sha256Schema,
  paymentIntentReferenceSha256: sha256Schema,
  amountCents: amountSchema,
  currency: z.literal("USD"),
  confirmationNotAfter: instantSchema,
  ...authorityFalseShape,
}).strict();

const intermediateStatusSchema = z.enum([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
]);
const failedStatusSchema = z.literal("canceled");
const observedStatusSchema = z.union([
  z.literal("requires_capture"),
  intermediateStatusSchema,
  failedStatusSchema,
]);

const observationFactsShape = {
  observedAt: instantSchema,
  observedPaymentIntentStatus: observedStatusSchema,
  observedAmountCents: amountSchema,
  observedCurrency: z.literal("usd"),
  observedLivemode: z.literal(true),
  observedCaptureMethod: z.literal("manual"),
  observedPaymentMethodType: z.literal("card"),
  observedPaymentIntentReferenceSha256: sha256Schema,
  providerResponseSha256: sha256Schema,
} as const;

const verifiedObservationSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("stripe_webhook"),
    ...observationFactsShape,
    webhookEventSha256: sha256Schema,
    retrievalEvidenceSha256: z.null(),
  }).strict(),
  z.object({
    source: z.literal("stripe_retrieval"),
    ...observationFactsShape,
    webhookEventSha256: z.null(),
    retrievalEvidenceSha256: sha256Schema,
  }).strict(),
]).superRefine((value, context) => {
  const evidenceSha256 = value.source === "stripe_webhook"
    ? value.webhookEventSha256
    : value.retrievalEvidenceSha256;
  if (evidenceSha256 === value.providerResponseSha256) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["providerResponseSha256"],
      message: "Provider and source evidence domains must be independent.",
    });
  }
});

const unresolvedObservationSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("stripe_webhook"),
    observedAt: instantSchema,
    webhookEventSha256: sha256Schema,
    retrievalEvidenceSha256: z.null(),
  }).strict(),
  z.object({
    source: z.literal("stripe_retrieval"),
    observedAt: instantSchema,
    webhookEventSha256: z.null(),
    retrievalEvidenceSha256: sha256Schema,
  }).strict(),
]);

const terminalInputSchema = z.object({
  attempt: handoffSnapshotSchema,
  observation: verifiedObservationSchema,
}).strict();

const ambiguityCodeSchema = z.enum([
  "stripe_confirmation_handoff_expired",
  "stripe_confirmation_intermediate_status",
  "stripe_confirmation_observation_unavailable",
  "stripe_confirmation_outcome_unknown",
]);

const ambiguousInputSchema = z.object({
  attempt: handoffSnapshotSchema,
  ambiguityCode: ambiguityCodeSchema,
  ambiguitySourceEvidenceSha256: sha256Schema,
}).strict();

const reconciliationInputSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("authorized_requires_capture"),
    attempt: ambiguousSnapshotSchema,
    observation: verifiedObservationSchema,
  }).strict(),
  z.object({
    outcome: z.literal("failed"),
    attempt: ambiguousSnapshotSchema,
    observation: verifiedObservationSchema,
  }).strict(),
  z.object({
    outcome: z.literal("unresolved"),
    attempt: ambiguousSnapshotSchema,
    observation: unresolvedObservationSchema,
  }).strict(),
]);

const AUTHORIZATION_REPLAY_REASON =
  "Per-call Production authorization nonce has already been consumed.";
const INSPECT_CUSTOM = Symbol.for("nodejs.util.inspect.custom");

export const FLIGHT_CONSUMER_LIVE_STRIPE_CONFIRMATION_OBSERVATION_VERIFIER_VERSION =
  "flight-consumer-live-stripe-confirmation-observation-verifier-v1" as const;

export type FlightConsumerLiveStripeConfirmationVerifiedObservation =
  z.output<typeof verifiedObservationSchema>;
export type FlightConsumerLiveStripeConfirmationUnresolvedObservation =
  z.output<typeof unresolvedObservationSchema>;

export type FlightConsumerLiveStripeConfirmationObservationVerifier =
  Readonly<{
    version:
      typeof FLIGHT_CONSUMER_LIVE_STRIPE_CONFIRMATION_OBSERVATION_VERIFIER_VERSION;
    processorEnvironment: "stripe_live";
    livemode: true;
    acceptsBrowserAssertions: false;
    stripeTransportImplemented: false;
    verifyObservation: (input: Readonly<{
      verificationKind: "terminal" | "reconciliation";
      attemptId: string;
      executionScopeSha256: string;
      confirmationBindingSha256: string;
      expectedPaymentIntentReferenceSha256: string;
      expectedAmountCents: number;
      expectedCurrency: "usd";
      observation:
        | FlightConsumerLiveStripeConfirmationVerifiedObservation
        | FlightConsumerLiveStripeConfirmationUnresolvedObservation;
    }>) => boolean;
  }>;

export type FlightConsumerLiveStripeConfirmationClientSecretCapability =
  Readonly<{
    kind: "flight-consumer-live-stripe-confirmation-client-secret-capability-v1";
    serializable: false;
    consumed: boolean;
    expiresAt: string;
    useOnce: <T>(consumer: (clientSecret: string) => T) => T;
  }>;

export class FlightConsumerLiveStripePaymentIntentConfirmationError
  extends Error {
  readonly reason:
    | "invalid_input"
    | "invalid_dependency"
    | "binding_mismatch"
    | "authority_refused"
    | "persistence_refused"
    | "ambiguity_persistence_failed"
    | "client_secret_capability_refused"
    | "observation_refused"
    | "terminal_persistence_failed";
  readonly blindRetryAuthorized = false as const;

  constructor(
    reason: FlightConsumerLiveStripePaymentIntentConfirmationError["reason"],
  ) {
    super("Flight Consumer Live Stripe PaymentIntent confirmation was refused.");
    this.name = "FlightConsumerLiveStripePaymentIntentConfirmationError";
    this.reason = reason;
  }
}

class ConfirmationClientSecretCapability
implements FlightConsumerLiveStripeConfirmationClientSecretCapability {
  readonly kind = (
    "flight-consumer-live-stripe-confirmation-client-secret-capability-v1"
  ) as const;
  readonly serializable = false as const;
  readonly expiresAt: string;
  readonly #readTrustedTimeSeconds: () => number;
  #clientSecret: string | null;

  constructor(
    clientSecret: string,
    expiresAt: string,
    readTrustedTimeSeconds: () => number,
  ) {
    this.#clientSecret = clientSecret;
    this.expiresAt = expiresAt;
    this.#readTrustedTimeSeconds = readTrustedTimeSeconds;
    Object.freeze(this);
  }

  get consumed() {
    return this.#clientSecret === null;
  }

  useOnce<T>(consumer: (clientSecret: string) => T): T {
    if (this.#clientSecret === null || typeof consumer !== "function") {
      throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
        "client_secret_capability_refused",
      );
    }
    let nowSeconds: number;
    try {
      nowSeconds = this.#readTrustedTimeSeconds();
    } catch {
      this.#clientSecret = null;
      throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
        "client_secret_capability_refused",
      );
    }
    const clientSecret = this.#clientSecret;
    this.#clientSecret = null;
    if (
      !Number.isSafeInteger(nowSeconds)
      || nowSeconds < 0
      || nowSeconds * 1000 >= Date.parse(this.expiresAt)
    ) {
      throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
        "client_secret_capability_refused",
      );
    }
    return consumer(clientSecret);
  }

  toJSON(): never {
    throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
      "client_secret_capability_refused",
    );
  }

  toString() {
    return "[FlightConsumerLiveStripeConfirmationClientSecretCapability REDACTED]";
  }

  [INSPECT_CUSTOM]() {
    return this.toString();
  }
}

type AuthorityBase = Readonly<{
  version: "flight-consumer-live-stripe-payment-intent-confirmation-result-v1";
  providerRequestCountByOrchestrator: 0;
  stripeMutationCountByOrchestrator: 0;
  orderRequestCountByOrchestrator: 0;
  captureRequestCountByOrchestrator: 0;
  confirmationHandoffAuthorized: false;
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
}>;

type HandoffResult = AuthorityBase & Readonly<{
  decision: "prepared" | "replay" | "ambiguous";
  replayStage: "authority" | "prepare" | "claim" | null;
  attemptId: string | null;
  confirmationState:
    | "prepared"
    | "handoff_claimed"
    | "authorized_requires_capture"
    | "failed"
    | "ambiguous"
    | "reconciled"
    | null;
  confirmationRevision: 0 | 1 | 2 | 3 | null;
  stateReceiptSha256: string | null;
  confirmationBindingSha256: string;
  confirmationWorkflowSha256: string;
  confirmationPrerequisiteSha256: string;
  confirmationRequestSha256: string;
  idempotencyRequestSha256: string;
  paymentIntentReferenceSha256: string;
  clientSecretCapability:
    | FlightConsumerLiveStripeConfirmationClientSecretCapability
    | null;
  consumerConfirmationRemainsRouteLocked: true;
}>;

type TerminalResult = AuthorityBase & Readonly<{
  decision: "recorded" | "replay";
  attemptId: string;
  confirmationState: "authorized_requires_capture" | "failed";
  confirmationRevision: 2;
  stateReceiptSha256: string;
  confirmationEvidenceSha256: string;
  failureCode: string | null;
  orderCreationRemainsLaterGate: true;
}>;

type AmbiguousResult = AuthorityBase & Readonly<{
  decision: "ambiguous" | "replay";
  attemptId: string;
  confirmationState: "ambiguous";
  confirmationRevision: 2;
  stateReceiptSha256: string;
  ambiguityCode: string;
  ambiguityEvidenceSha256: string;
  reconciliationRequired: true;
}>;

type ReconciliationResult = AuthorityBase & Readonly<{
  decision: "reconciled" | "replay";
  attemptId: string;
  confirmationState: "reconciled";
  confirmationRevision: 3;
  reconciledOutcome: "authorized_requires_capture" | "failed" | "unresolved";
  stateReceiptSha256: string;
  reconciliationEvidenceSha256: string;
  orderCreationRemainsLaterGate: true;
}>;

export type FlightConsumerLiveStripePaymentIntentConfirmationOrchestrator =
  Readonly<{
    version:
      "flight-consumer-live-stripe-payment-intent-confirmation-orchestrator-v1";
    migrationVersion: "202608260109";
    productionDark: true;
    routeExposed: false;
    consumerReachable: false;
    environmentReadImplemented: false;
    stripeTransportImplemented: false;
    browserAssertionAccepted: false;
    browserHandoffRouteExposed: false;
    terminalObservationRouteExposed: false;
    reconciliationRouteExposed: false;
    lateAuthorizationCancellationImplemented: false;
    lateAuthorizationReaperImplemented: false;
    orderImplemented: false;
    captureImplemented: false;
    ticketingImplemented: false;
    consumerReleaseEnabled: false;
    prepareHandoff: (input: unknown) => Promise<HandoffResult>;
    recordVerifiedObservation: (
      input: unknown,
    ) => Promise<TerminalResult | AmbiguousResult>;
    markAmbiguous: (input: unknown) => Promise<AmbiguousResult>;
    reconcileVerifiedObservation: (
      input: unknown,
    ) => Promise<ReconciliationResult>;
  }>;

type Dependencies = Readonly<{
  runtimePolicy: FlightRuntimePolicy;
  providerExecutionBinding: FlightRuntimeProviderBinding;
  paymentExecutionBinding: FlightRuntimePaymentBinding;
  productionAuthorizationVerifier: FlightProductionAuthorizationVerifier;
  confirmationPersistence: FlightConsumerLiveStripeConfirmationPersistence;
  observationVerifier:
    FlightConsumerLiveStripeConfirmationObservationVerifier;
}>;

function authorityBase(): AuthorityBase {
  return Object.freeze({
    version: (
      "flight-consumer-live-stripe-payment-intent-confirmation-result-v1"
    ) as const,
    providerRequestCountByOrchestrator: 0 as const,
    stripeMutationCountByOrchestrator: 0 as const,
    orderRequestCountByOrchestrator: 0 as const,
    captureRequestCountByOrchestrator: 0 as const,
    confirmationHandoffAuthorized: false as const,
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
  });
}

function authorizationEvidenceSha256(
  authorization: FlightProductionActionAuthorization,
) {
  return sha256FlightEvidence({
    version:
      "flight-consumer-live-stripe-confirmation-authorization-evidence-v1",
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

function isClientSecretCapability(
  value: unknown,
): value is FlightConsumerLiveStripeClientSecretCapability {
  if (value === null || typeof value !== "object") return false;
  try {
    const candidate = value as Partial<
      FlightConsumerLiveStripeClientSecretCapability
    >;
    return candidate.kind
      === "flight-consumer-live-stripe-client-secret-capability-v1"
      && candidate.serializable === false
      && candidate.consumed === false
      && typeof candidate.useOnce === "function";
  } catch {
    return false;
  }
}

function discardClientSecretCapability(value: unknown) {
  if (!isClientSecretCapability(value)) return;
  try {
    value.useOnce(() => undefined);
  } catch {
    // A replay path never returns a capability, even if the source is stale.
  }
}

function consumeClientSecretCapability(
  value: unknown,
  expectedPaymentIntentReferenceSha256: string,
) {
  if (!isClientSecretCapability(value)) {
    throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
      "client_secret_capability_refused",
    );
  }
  try {
    const clientSecret = value.useOnce((secret) => secret);
    const accepted = clientSecretSchema.safeParse(clientSecret);
    if (!accepted.success) throw new Error("invalid_client_secret");
    const paymentIntentId = STRIPE_CLIENT_SECRET_PATTERN.exec(accepted.data)?.[1];
    const expected = sha256Schema.safeParse(
      expectedPaymentIntentReferenceSha256,
    );
    if (paymentIntentId === undefined || !expected.success) {
      throw new Error("invalid_payment_intent_reference");
    }
    const observedDigest = createHash("sha256")
      .update(paymentIntentId, "utf8")
      .digest();
    const expectedDigest = Buffer.from(expected.data, "hex");
    if (
      observedDigest.length !== expectedDigest.length
      || !timingSafeEqual(observedDigest, expectedDigest)
    ) {
      throw new Error("client_secret_payment_intent_mismatch");
    }
    return accepted.data;
  } catch {
    throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
      "client_secret_capability_refused",
    );
  }
}

function validateDependencies(dependencies: Dependencies) {
  const persistence = dependencies.confirmationPersistence;
  const verifier = dependencies.observationVerifier;
  if (
    persistence.version
      !== "flight-consumer-live-stripe-confirmation-persistence-v1"
    || persistence.migrationVersion !== "202608260109"
    || persistence.productionDark !== true
    || persistence.routeExposed !== false
    || persistence.stripeTransportImplemented !== false
    || persistence.clientSecretStored !== false
    || persistence.paymentMethodStored !== false
    || persistence.providerPayloadStored !== false
    || persistence.databaseApplyAuthorized !== false
    || persistence.confirmationHandoffAuthorized !== false
    || persistence.providerDispatchAuthorized !== false
    || persistence.stripeDispatchAuthorized !== false
    || persistence.bookingAuthorized !== false
    || persistence.orderAuthorized !== false
    || persistence.paymentAuthorized !== false
    || persistence.captureAuthorized !== false
    || persistence.refundAuthorized !== false
    || persistence.settlementAuthorized !== false
    || persistence.ticketingAuthorized !== false
    || persistence.servicingAuthorized !== false
    || persistence.consumerReleaseEnabled !== false
    || persistence.blindRetryAuthorized !== false
    || verifier.version
      !== FLIGHT_CONSUMER_LIVE_STRIPE_CONFIRMATION_OBSERVATION_VERIFIER_VERSION
    || verifier.processorEnvironment !== "stripe_live"
    || verifier.livemode !== true
    || verifier.acceptsBrowserAssertions !== false
    || verifier.stripeTransportImplemented !== false
    || typeof verifier.verifyObservation !== "function"
  ) {
    throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
      "invalid_dependency",
    );
  }
}

type PersistenceResult = Readonly<{
  attempt_id: string;
  confirmation_state: string;
  confirmation_revision: number;
  amount_cents: number;
  currency: string;
  payment_intent_reference_sha256: string;
  state_receipt_sha256: string;
  reconciled_outcome: string | null;
}> & Readonly<Record<keyof typeof persistedAuthorityFalseShape, false>>;

function persistenceResultMatches(
  result: PersistenceResult | null | undefined,
  expected: Readonly<{
    attemptId?: string;
    amountCents: number;
    paymentIntentReferenceSha256: string;
  }>,
) {
  if (result === null || typeof result !== "object") return false;
  try {
    return (expected.attemptId === undefined
        || result.attempt_id === expected.attemptId)
      && result.amount_cents === expected.amountCents
      && result.currency === "USD"
      && result.payment_intent_reference_sha256
        === expected.paymentIntentReferenceSha256
      && Object.keys(persistedAuthorityFalseShape).every(
        (key) => result[key as keyof typeof persistedAuthorityFalseShape]
          === false,
      );
  } catch {
    return false;
  }
}

function trustedNowSeconds(dependencies: Dependencies) {
  let value: number;
  try {
    value = dependencies.productionAuthorizationVerifier
      .readTrustedTimeSeconds();
  } catch {
    throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
      "authority_refused",
    );
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
      "authority_refused",
    );
  }
  return value;
}

function observationTrustedNowSeconds(dependencies: Dependencies) {
  try {
    const value = dependencies.productionAuthorizationVerifier
      .readTrustedTimeSeconds();
    if (!Number.isSafeInteger(value) || value < 0) throw new Error();
    return value;
  } catch {
    throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
      "observation_refused",
    );
  }
}

function verifyObservation(
  dependencies: Dependencies,
  input: Readonly<{
    verificationKind: "terminal" | "reconciliation";
    attempt: z.output<typeof handoffSnapshotSchema>
      | z.output<typeof ambiguousSnapshotSchema>;
    observation: FlightConsumerLiveStripeConfirmationVerifiedObservation
      | FlightConsumerLiveStripeConfirmationUnresolvedObservation;
  }>,
) {
  const nowSeconds = observationTrustedNowSeconds(dependencies);
  const observedAtMilliseconds = Date.parse(input.observation.observedAt);
  const confirmationNotAfterMilliseconds = Date.parse(
    input.attempt.confirmationNotAfter,
  );
  if (
    !Number.isFinite(observedAtMilliseconds)
    || !Number.isFinite(confirmationNotAfterMilliseconds)
    || observedAtMilliseconds > nowSeconds * 1000
    || (
      input.verificationKind === "terminal"
      && observedAtMilliseconds > confirmationNotAfterMilliseconds
    )
  ) {
    throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
      "observation_refused",
    );
  }
  if ("observedPaymentIntentStatus" in input.observation && (
    input.observation.observedPaymentIntentReferenceSha256
      !== input.attempt.paymentIntentReferenceSha256
    || input.observation.observedAmountCents !== input.attempt.amountCents
    || input.observation.observedCurrency !== "usd"
    || input.observation.observedLivemode !== true
    || input.observation.observedCaptureMethod !== "manual"
    || input.observation.observedPaymentMethodType !== "card"
  )) {
    throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
      "binding_mismatch",
    );
  }
  let verified = false;
  try {
    verified = dependencies.observationVerifier.verifyObservation(
      Object.freeze({
        verificationKind: input.verificationKind,
        attemptId: input.attempt.attemptId,
        executionScopeSha256: input.attempt.executionScopeSha256,
        confirmationBindingSha256:
          input.attempt.confirmationBindingSha256,
        expectedPaymentIntentReferenceSha256:
          input.attempt.paymentIntentReferenceSha256,
        expectedAmountCents: input.attempt.amountCents,
        expectedCurrency: "usd" as const,
        observation: input.observation,
      }),
    );
  } catch {
    verified = false;
  }
  if (!verified) {
    throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
      "observation_refused",
    );
  }
}

function failureArtifacts(
  status: z.output<typeof failedStatusSchema>,
  confirmationEvidenceSha256: string,
) {
  const failureCode = `stripe_confirmation_${status}`;
  const failureEvidenceSha256 = sha256FlightEvidence({
    version: "flight-consumer-live-stripe-confirmation-failure-v1",
    failureCode,
    observedPaymentIntentStatus: status,
    confirmationEvidenceSha256,
  });
  return Object.freeze({ failureCode, failureEvidenceSha256 });
}

function confirmationEvidenceSha256(
  attempt: z.output<typeof handoffSnapshotSchema>
    | z.output<typeof ambiguousSnapshotSchema>,
  observation: FlightConsumerLiveStripeConfirmationVerifiedObservation,
  evidenceKind: "terminal" | "reconciliation",
) {
  return sha256FlightEvidence({
    version: "flight-consumer-live-stripe-confirmation-observation-v1",
    evidenceKind,
    attemptId: attempt.attemptId,
    confirmationState: attempt.confirmationState,
    confirmationRevision: attempt.confirmationRevision,
    stateReceiptSha256: attempt.stateReceiptSha256,
    executionScopeSha256: attempt.executionScopeSha256,
    confirmationBindingSha256: attempt.confirmationBindingSha256,
    source: observation.source,
    observedAt: observation.observedAt,
    observedPaymentIntentStatus: observation.observedPaymentIntentStatus,
    observedAmountCents: observation.observedAmountCents,
    observedCurrency: observation.observedCurrency,
    observedLivemode: observation.observedLivemode,
    observedCaptureMethod: observation.observedCaptureMethod,
    observedPaymentMethodType: observation.observedPaymentMethodType,
    observedPaymentIntentReferenceSha256:
      observation.observedPaymentIntentReferenceSha256,
    providerResponseSha256: observation.providerResponseSha256,
    webhookEventSha256: observation.webhookEventSha256,
    retrievalEvidenceSha256: observation.retrievalEvidenceSha256,
  });
}

export function createFlightConsumerLiveStripePaymentIntentConfirmationOrchestrator(
  dependencies: Dependencies,
): FlightConsumerLiveStripePaymentIntentConfirmationOrchestrator {
  validateDependencies(dependencies);

  const persistAmbiguous = async (input: Readonly<{
    attempt: z.output<typeof handoffSnapshotSchema>;
    ambiguityCode: z.output<typeof ambiguityCodeSchema>;
    ambiguitySourceEvidenceSha256: string;
  }>): Promise<AmbiguousResult> => {
    const ambiguityEvidenceSha256 = sha256FlightEvidence({
      version: "flight-consumer-live-stripe-confirmation-ambiguity-v1",
      attemptId: input.attempt.attemptId,
      confirmationBindingSha256: input.attempt.confirmationBindingSha256,
      stateReceiptSha256: input.attempt.stateReceiptSha256,
      handoffTokenSha256: input.attempt.handoffTokenSha256,
      ambiguityCode: input.ambiguityCode,
      ambiguitySourceEvidenceSha256: input.ambiguitySourceEvidenceSha256,
      livemode: true,
      blindRetryAuthorized: false,
    });
    let ambiguous: Awaited<ReturnType<
      FlightConsumerLiveStripeConfirmationPersistence["markAmbiguous"]
    >>;
    try {
      ambiguous = await dependencies.confirmationPersistence.markAmbiguous({
        attemptId: input.attempt.attemptId,
        expectedRevision: 1,
        executionScopeSha256: input.attempt.executionScopeSha256,
        confirmationBindingSha256: input.attempt.confirmationBindingSha256,
        handoffTokenSha256: input.attempt.handoffTokenSha256,
        ambiguityCode: input.ambiguityCode,
        ambiguityEvidenceSha256,
        livemode: true,
      });
    } catch {
      throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
        "ambiguity_persistence_failed",
      );
    }
    if (
      !persistenceResultMatches(ambiguous, {
        attemptId: input.attempt.attemptId,
        amountCents: input.attempt.amountCents,
        paymentIntentReferenceSha256:
          input.attempt.paymentIntentReferenceSha256,
      })
      || ambiguous.confirmation_state !== "ambiguous"
      || ambiguous.confirmation_revision !== 2
      || (ambiguous.decision !== "ambiguous"
        && ambiguous.decision !== "replay")
    ) {
      throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
        "ambiguity_persistence_failed",
      );
    }
    return Object.freeze({
      ...authorityBase(),
      decision: ambiguous.decision,
      attemptId: ambiguous.attempt_id,
      confirmationState: "ambiguous" as const,
      confirmationRevision: 2 as const,
      stateReceiptSha256: ambiguous.state_receipt_sha256,
      ambiguityCode: input.ambiguityCode,
      ambiguityEvidenceSha256,
      reconciliationRequired: true as const,
    });
  };

  return Object.freeze({
    version: (
      "flight-consumer-live-stripe-payment-intent-confirmation-orchestrator-v1"
    ) as const,
    migrationVersion: "202608260109" as const,
    productionDark: true as const,
    routeExposed: false as const,
    consumerReachable: false as const,
    environmentReadImplemented: false as const,
    stripeTransportImplemented: false as const,
    browserAssertionAccepted: false as const,
    browserHandoffRouteExposed: false as const,
    terminalObservationRouteExposed: false as const,
    reconciliationRouteExposed: false as const,
    lateAuthorizationCancellationImplemented: false as const,
    lateAuthorizationReaperImplemented: false as const,
    orderImplemented: false as const,
    captureImplemented: false as const,
    ticketingImplemented: false as const,
    consumerReleaseEnabled: false as const,

    async prepareHandoff(untrustedInput: unknown): Promise<HandoffResult> {
      const accepted = prepareHandoffInputSchema.safeParse(untrustedInput);
      if (!accepted.success) {
        throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
          "invalid_input",
        );
      }
      const input = accepted.data;
      const checkout = input.checkoutEvidence;
      const created = input.stripeCreateResult;
      const sourceCapability = created.clientSecretCapability;
      if (!isClientSecretCapability(sourceCapability)) {
        throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
          "client_secret_capability_refused",
        );
      }
      const paymentBindingSha256 = digestFlightRuntimePaymentBinding(
        input.paymentBinding,
      );
      if (
        checkout.stripePlanId !== created.planId
        || checkout.stripePlanSha256 !== created.planSha256
        || checkout.stripeExecutionAttemptId !== created.attemptId
        || checkout.stripeExecutionWorkflowSha256
          !== created.executionWorkflowSha256
        || checkout.stripeExecutionPrerequisiteSha256
          !== created.executionPrerequisiteSha256
        || checkout.stripeExecutionPreparedReceiptSha256
          === created.stateReceiptSha256
        || checkout.paymentBindingSha256 !== paymentBindingSha256
        || checkout.paymentBindingSha256
          !== digestFlightRuntimePaymentBinding(
            dependencies.paymentExecutionBinding,
          )
      ) {
        throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
          "binding_mismatch",
        );
      }

      const nowSeconds = trustedNowSeconds(dependencies);
      const confirmationNotAfterMilliseconds = Date.parse(
        input.confirmationNotAfter,
      );
      const offerExpiresAtMilliseconds = Date.parse(checkout.offerExpiresAt);
      const handoffExpiresAtMilliseconds = Math.min(
        nowSeconds * 1000 + input.handoffSeconds * 1000,
        confirmationNotAfterMilliseconds,
      );
      if (
        !Number.isFinite(confirmationNotAfterMilliseconds)
        || !Number.isFinite(offerExpiresAtMilliseconds)
        || confirmationNotAfterMilliseconds <= nowSeconds * 1000
        || confirmationNotAfterMilliseconds > nowSeconds * 1000 + 600_000
        || confirmationNotAfterMilliseconds > offerExpiresAtMilliseconds
        || confirmationNotAfterMilliseconds
          > input.productionAuthorization.expiresAtSeconds * 1000
        || handoffExpiresAtMilliseconds <= nowSeconds * 1000
      ) {
        throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
          "authority_refused",
        );
      }

      const confirmationBindingSha256 = sha256FlightEvidence({
        version: "flight-consumer-live-stripe-confirmation-binding-v1",
        migrationVersion: "202608260109",
        checkoutAggregateId: checkout.aggregateId,
        customerId: checkout.customerId,
        orderId: checkout.orderId,
        checkoutExecutionScopeSha256: checkout.executionScopeSha256,
        checkoutBindingSha256: checkout.checkoutBindingSha256,
        checkoutStateReceiptSha256: checkout.checkoutStateReceiptSha256,
        stripePlanId: checkout.stripePlanId,
        stripePlanSha256: checkout.stripePlanSha256,
        stripeExecutionAttemptId: created.attemptId,
        stripeExecutionWorkflowSha256: created.executionWorkflowSha256,
        stripeExecutionPrerequisiteSha256:
          created.executionPrerequisiteSha256,
        stripeExecutionCompletedReceiptSha256: created.stateReceiptSha256,
        paymentIntentReferenceSha256:
          created.paymentIntentReferenceSha256,
        paymentBindingSha256,
        orderReferenceSha256: checkout.orderReferenceSha256,
        customerReferenceSha256: checkout.customerReferenceSha256,
        amountCents: checkout.amountCents,
        currency: checkout.currency,
        processorEnvironment: "stripe_live",
        livemode: true,
        captureMethod: "manual",
        paymentMethodType: "card",
      });
      const confirmationRequestSha256 = sha256FlightEvidence({
        version: "flight-consumer-live-stripe-confirmation-request-v1",
        confirmationBindingSha256,
        paymentIntentReferenceSha256:
          created.paymentIntentReferenceSha256,
        amountCents: checkout.amountCents,
        currency: "usd",
        captureMethod: "manual",
        paymentMethodType: "card",
        confirmationNotAfter: input.confirmationNotAfter,
      });
      const idempotency = buildFlightIdempotencyIntent({
        operation: "authorize_payment",
        scopeId: checkout.orderId,
        requestId: checkout.aggregateId,
        payload: {
          version: "flight-consumer-live-stripe-confirmation-idempotency-v1",
          confirmationBindingSha256,
          confirmationRequestSha256,
          paymentIntentReferenceSha256:
            created.paymentIntentReferenceSha256,
          confirmationNotAfter: input.confirmationNotAfter,
        },
      });
      const authorizationSha256 = authorizationEvidenceSha256(
        input.productionAuthorization,
      );
      const confirmationWorkflowSha256 = sha256FlightEvidence({
        version: "flight-consumer-live-stripe-confirmation-workflow-v1",
        migrationVersion: "202608260109",
        confirmationBindingSha256,
        confirmationRequestSha256,
        idempotencyRequestSha256: idempotency.requestDigest,
        authorizationSha256,
      });
      const confirmationPrerequisiteSha256 = sha256FlightEvidence({
        version: "flight-consumer-live-stripe-confirmation-prerequisite-v1",
        confirmationWorkflowSha256,
        checkoutStateReceiptSha256: checkout.checkoutStateReceiptSha256,
        stripeExecutionCompletedReceiptSha256: created.stateReceiptSha256,
        handoffTokenSha256: input.handoffTokenSha256,
        handoffSeconds: input.handoffSeconds,
        confirmationNotAfter: input.confirmationNotAfter,
        persistenceVersion: dependencies.confirmationPersistence.version,
        observationVerifierVersion: dependencies.observationVerifier.version,
      });
      const authorization = input.productionAuthorization;
      if (
        authorization.scopeId !== checkout.orderId
        || authorization.requestDigest !== confirmationRequestSha256
        || authorization.idempotencyRequestDigest
          !== idempotency.requestDigest
        || authorization.providerBindingDigest
          !== digestFlightRuntimeProviderBinding(
            dependencies.providerExecutionBinding,
          )
        || authorization.paymentBindingDigest !== paymentBindingSha256
      ) {
        throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
          "authority_refused",
        );
      }

      const replay = (
        replayStage: "authority" | "prepare" | "claim",
        result: PersistenceResult | null,
      ): HandoffResult => {
        discardClientSecretCapability(sourceCapability);
        return Object.freeze({
          ...authorityBase(),
          decision: "replay" as const,
          replayStage,
          attemptId: result?.attempt_id ?? null,
          confirmationState: (result?.confirmation_state
            ?? null) as HandoffResult["confirmationState"],
          confirmationRevision: (result?.confirmation_revision
            ?? null) as HandoffResult["confirmationRevision"],
          stateReceiptSha256: result?.state_receipt_sha256 ?? null,
          confirmationBindingSha256,
          confirmationWorkflowSha256,
          confirmationPrerequisiteSha256,
          confirmationRequestSha256,
          idempotencyRequestSha256: idempotency.requestDigest,
          paymentIntentReferenceSha256:
            created.paymentIntentReferenceSha256,
          clientSecretCapability: null,
          consumerConfirmationRemainsRouteLocked: true as const,
        });
      };

      const markHandoffAmbiguous = async (input: Readonly<{
        attemptId: string;
        previousStateReceiptSha256: string;
        ambiguityCode:
          | "client_secret_handoff_unavailable"
          | "stripe_confirmation_claim_outcome_unknown";
      }>): Promise<HandoffResult> => {
        discardClientSecretCapability(sourceCapability);
        const ambiguityEvidenceSha256 = sha256FlightEvidence({
          version: "flight-consumer-live-stripe-confirmation-ambiguity-v1",
          attemptId: input.attemptId,
          ambiguityCode: input.ambiguityCode,
          confirmationBindingSha256,
          confirmationWorkflowSha256,
          confirmationRequestSha256,
          handoffTokenSha256: accepted.data.handoffTokenSha256,
          previousStateReceiptSha256: input.previousStateReceiptSha256,
          livemode: true,
          blindRetryAuthorized: false,
        });
        try {
          const ambiguous = await dependencies.confirmationPersistence
            .markAmbiguous({
              attemptId: input.attemptId,
              expectedRevision: 1,
              executionScopeSha256: checkout.executionScopeSha256,
              confirmationBindingSha256,
              handoffTokenSha256: accepted.data.handoffTokenSha256,
              ambiguityCode: input.ambiguityCode,
              ambiguityEvidenceSha256,
              livemode: true,
            });
          if (
            !persistenceResultMatches(ambiguous, {
              attemptId: input.attemptId,
              amountCents: checkout.amountCents,
              paymentIntentReferenceSha256:
                created.paymentIntentReferenceSha256,
            })
            || ambiguous.confirmation_state !== "ambiguous"
            || ambiguous.confirmation_revision !== 2
          ) throw new Error("invalid_ambiguity_receipt");
          return Object.freeze({
            ...authorityBase(),
            decision: "ambiguous" as const,
            replayStage: null,
            attemptId: ambiguous.attempt_id,
            confirmationState: "ambiguous" as const,
            confirmationRevision: 2 as const,
            stateReceiptSha256: ambiguous.state_receipt_sha256,
            confirmationBindingSha256,
            confirmationWorkflowSha256,
            confirmationPrerequisiteSha256,
            confirmationRequestSha256,
            idempotencyRequestSha256: idempotency.requestDigest,
            paymentIntentReferenceSha256:
              created.paymentIntentReferenceSha256,
            clientSecretCapability: null,
            consumerConfirmationRemainsRouteLocked: true as const,
          });
        } catch {
          throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
            "ambiguity_persistence_failed",
          );
        }
      };

      const authorizationDecision = await evaluateFlightRuntimeAuthorization(
        dependencies.runtimePolicy,
        "authorize_payment",
        "provider_production",
        {
          executionBinding: dependencies.providerExecutionBinding,
          paymentExecutionBinding: input.paymentBinding,
          settlementExecutionBinding: null,
          productionAuthorization: authorization,
          productionAuthorizationVerifier:
            dependencies.productionAuthorizationVerifier,
          scopeId: checkout.orderId,
          requestDigest: confirmationRequestSha256,
          idempotencyRequestDigest: idempotency.requestDigest,
        },
      );
      if (!authorizationDecision.authorized) {
        if (
          authorizationDecision.reasons.length === 1
          && authorizationDecision.reasons[0] === AUTHORIZATION_REPLAY_REASON
        ) return replay("authority", null);
        discardClientSecretCapability(sourceCapability);
        throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
          "authority_refused",
        );
      }

      let prepared: Awaited<ReturnType<
        FlightConsumerLiveStripeConfirmationPersistence["prepare"]
      >>;
      try {
        prepared = await dependencies.confirmationPersistence.prepare({
          checkoutAggregateId: checkout.aggregateId,
          stripeExecutionAttemptId: created.attemptId,
          executionScopeSha256: checkout.executionScopeSha256,
          idempotencySha256: idempotency.requestDigest,
          confirmationBindingSha256,
          confirmationWorkflowSha256,
          confirmationPrerequisiteSha256,
          checkoutStateReceiptSha256: checkout.checkoutStateReceiptSha256,
          stripeExecutionCompletedReceiptSha256: created.stateReceiptSha256,
          confirmationNotAfter: input.confirmationNotAfter,
        });
      } catch {
        discardClientSecretCapability(sourceCapability);
        throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
          "persistence_refused",
        );
      }
      if (!persistenceResultMatches(prepared, {
        amountCents: checkout.amountCents,
        paymentIntentReferenceSha256: created.paymentIntentReferenceSha256,
      })) {
        discardClientSecretCapability(sourceCapability);
        throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
          "persistence_refused",
        );
      }
      if (prepared.decision === "replay") return replay("prepare", prepared);
      if (
        prepared.confirmation_state !== "prepared"
        || prepared.confirmation_revision !== 0
      ) {
        discardClientSecretCapability(sourceCapability);
        throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
          "persistence_refused",
        );
      }

      let claimed: Awaited<ReturnType<
        FlightConsumerLiveStripeConfirmationPersistence["claim"]
      >>;
      try {
        claimed = await dependencies.confirmationPersistence.claim({
          attemptId: prepared.attempt_id,
          expectedRevision: 0,
          executionScopeSha256: checkout.executionScopeSha256,
          confirmationBindingSha256,
          handoffTokenSha256: input.handoffTokenSha256,
          handoffSeconds: input.handoffSeconds,
          confirmationRequestSha256,
        });
      } catch {
        return markHandoffAmbiguous({
          attemptId: prepared.attempt_id,
          previousStateReceiptSha256: prepared.state_receipt_sha256,
          ambiguityCode: "stripe_confirmation_claim_outcome_unknown",
        });
      }
      if (!persistenceResultMatches(claimed, {
        attemptId: prepared.attempt_id,
        amountCents: checkout.amountCents,
        paymentIntentReferenceSha256: created.paymentIntentReferenceSha256,
      })) {
        return markHandoffAmbiguous({
          attemptId: prepared.attempt_id,
          previousStateReceiptSha256: prepared.state_receipt_sha256,
          ambiguityCode: "stripe_confirmation_claim_outcome_unknown",
        });
      }
      if (claimed.decision === "replay") return replay("claim", claimed);
      if (
        claimed.confirmation_state !== "handoff_claimed"
        || claimed.confirmation_revision !== 1
      ) {
        return markHandoffAmbiguous({
          attemptId: prepared.attempt_id,
          previousStateReceiptSha256: claimed.state_receipt_sha256,
          ambiguityCode: "stripe_confirmation_claim_outcome_unknown",
        });
      }

      let clientSecret: string;
      try {
        clientSecret = consumeClientSecretCapability(
          sourceCapability,
          created.paymentIntentReferenceSha256,
        );
      } catch {
        return markHandoffAmbiguous({
          attemptId: claimed.attempt_id,
          previousStateReceiptSha256: claimed.state_receipt_sha256,
          ambiguityCode: "client_secret_handoff_unavailable",
        });
      }

      return Object.freeze({
        ...authorityBase(),
        decision: "prepared" as const,
        replayStage: null,
        attemptId: claimed.attempt_id,
        confirmationState: "handoff_claimed" as const,
        confirmationRevision: 1 as const,
        stateReceiptSha256: claimed.state_receipt_sha256,
        confirmationBindingSha256,
        confirmationWorkflowSha256,
        confirmationPrerequisiteSha256,
        confirmationRequestSha256,
        idempotencyRequestSha256: idempotency.requestDigest,
        paymentIntentReferenceSha256:
          created.paymentIntentReferenceSha256,
        clientSecretCapability: new ConfirmationClientSecretCapability(
          clientSecret,
          new Date(handoffExpiresAtMilliseconds).toISOString(),
          () => dependencies.productionAuthorizationVerifier
            .readTrustedTimeSeconds(),
        ),
        consumerConfirmationRemainsRouteLocked: true as const,
      });
    },

    async recordVerifiedObservation(
      untrustedInput: unknown,
    ): Promise<TerminalResult | AmbiguousResult> {
      const accepted = terminalInputSchema.safeParse(untrustedInput);
      if (!accepted.success) {
        throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
          "invalid_input",
        );
      }
      const { attempt, observation } = accepted.data;
      verifyObservation(dependencies, {
        verificationKind: "terminal",
        attempt,
        observation,
      });
      if (
        intermediateStatusSchema.safeParse(
          observation.observedPaymentIntentStatus,
        ).success
      ) {
        return persistAmbiguous({
          attempt,
          ambiguityCode: "stripe_confirmation_intermediate_status",
          ambiguitySourceEvidenceSha256: confirmationEvidenceSha256(
            attempt,
            observation,
            "terminal",
          ),
        });
      }
      const terminalState = observation.observedPaymentIntentStatus
        === "requires_capture"
        ? "authorized_requires_capture" as const
        : "failed" as const;
      const evidenceSha256 = confirmationEvidenceSha256(
        attempt,
        observation,
        "terminal",
      );
      const failure = terminalState === "failed"
        ? failureArtifacts(
          observation.observedPaymentIntentStatus as z.output<
            typeof failedStatusSchema
          >,
          evidenceSha256,
        )
        : null;
      let terminal: Awaited<ReturnType<
        FlightConsumerLiveStripeConfirmationPersistence["recordTerminal"]
      >>;
      try {
        terminal = await dependencies.confirmationPersistence.recordTerminal({
          attemptId: attempt.attemptId,
          expectedRevision: 1,
          executionScopeSha256: attempt.executionScopeSha256,
          confirmationBindingSha256: attempt.confirmationBindingSha256,
          handoffTokenSha256: attempt.handoffTokenSha256,
          terminalState,
          observedPaymentIntentStatus:
            observation.observedPaymentIntentStatus,
          observedAmountCents: observation.observedAmountCents,
          observedCurrency: observation.observedCurrency,
          observedLivemode: observation.observedLivemode,
          observedPaymentIntentReferenceSha256:
            observation.observedPaymentIntentReferenceSha256,
          providerResponseSha256: observation.providerResponseSha256,
          confirmationEvidenceSha256: evidenceSha256,
          webhookEventSha256: observation.webhookEventSha256,
          retrievalEvidenceSha256: observation.retrievalEvidenceSha256,
          failureCode: failure?.failureCode ?? null,
          failureEvidenceSha256: failure?.failureEvidenceSha256 ?? null,
          livemode: true,
        });
      } catch {
        throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
          "terminal_persistence_failed",
        );
      }
      if (
        !persistenceResultMatches(terminal, {
          attemptId: attempt.attemptId,
          amountCents: attempt.amountCents,
          paymentIntentReferenceSha256:
            attempt.paymentIntentReferenceSha256,
        })
        || terminal.confirmation_state !== terminalState
        || terminal.confirmation_revision !== 2
        || (terminal.decision !== "recorded"
          && terminal.decision !== "replay")
      ) {
        throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
          "terminal_persistence_failed",
        );
      }
      return Object.freeze({
        ...authorityBase(),
        decision: terminal.decision,
        attemptId: terminal.attempt_id,
        confirmationState: terminalState,
        confirmationRevision: 2 as const,
        stateReceiptSha256: terminal.state_receipt_sha256,
        confirmationEvidenceSha256: evidenceSha256,
        failureCode: failure?.failureCode ?? null,
        orderCreationRemainsLaterGate: true as const,
      });
    },

    async markAmbiguous(untrustedInput: unknown): Promise<AmbiguousResult> {
      const accepted = ambiguousInputSchema.safeParse(untrustedInput);
      if (!accepted.success) {
        throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
          "invalid_input",
        );
      }
      const { attempt, ambiguityCode, ambiguitySourceEvidenceSha256 } =
        accepted.data;
      return persistAmbiguous({
        attempt,
        ambiguityCode,
        ambiguitySourceEvidenceSha256,
      });
    },

    async reconcileVerifiedObservation(
      untrustedInput: unknown,
    ): Promise<ReconciliationResult> {
      const accepted = reconciliationInputSchema.safeParse(untrustedInput);
      if (!accepted.success) {
        throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
          "invalid_input",
        );
      }
      const { attempt, observation, outcome } = accepted.data;
      if (
        outcome === "authorized_requires_capture"
        && "observedPaymentIntentStatus" in observation
        && observation.observedPaymentIntentStatus !== "requires_capture"
      ) {
        throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
          "observation_refused",
        );
      }
      if (
        outcome === "failed"
        && "observedPaymentIntentStatus" in observation
        && !failedStatusSchema.safeParse(
          observation.observedPaymentIntentStatus,
        ).success
      ) {
        throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
          "observation_refused",
        );
      }
      verifyObservation(dependencies, {
        verificationKind: "reconciliation",
        attempt,
        observation,
      });
      const resolved = outcome !== "unresolved";
      const resolvedObservation = resolved
        ? observation as FlightConsumerLiveStripeConfirmationVerifiedObservation
        : null;
      const evidenceSha256 = resolvedObservation === null
        ? null
        : confirmationEvidenceSha256(
          attempt,
          resolvedObservation,
          "reconciliation",
        );
      const failure = outcome === "failed" && evidenceSha256 !== null
        ? failureArtifacts(
          resolvedObservation!.observedPaymentIntentStatus as z.output<
            typeof failedStatusSchema
          >,
          evidenceSha256,
        )
        : null;
      const sourceEvidenceSha256 = observation.source === "stripe_webhook"
        ? observation.webhookEventSha256
        : observation.retrievalEvidenceSha256;
      const reconciliationEvidenceSha256 = sha256FlightEvidence({
        version: "flight-consumer-live-stripe-confirmation-reconciliation-v1",
        attemptId: attempt.attemptId,
        confirmationBindingSha256: attempt.confirmationBindingSha256,
        stateReceiptSha256: attempt.stateReceiptSha256,
        reconciledOutcome: outcome,
        source: observation.source,
        observedAt: observation.observedAt,
        sourceEvidenceSha256,
        confirmationEvidenceSha256: evidenceSha256,
        livemode: true,
      });
      let reconciled: Awaited<ReturnType<
        FlightConsumerLiveStripeConfirmationPersistence["reconcile"]
      >>;
      try {
        reconciled = await dependencies.confirmationPersistence.reconcile({
          attemptId: attempt.attemptId,
          expectedRevision: 2,
          executionScopeSha256: attempt.executionScopeSha256,
          confirmationBindingSha256: attempt.confirmationBindingSha256,
          reconciledOutcome: outcome,
          observedPaymentIntentStatus:
            resolvedObservation?.observedPaymentIntentStatus ?? null,
          observedAmountCents:
            resolvedObservation?.observedAmountCents ?? null,
          observedCurrency: resolvedObservation?.observedCurrency ?? null,
          observedLivemode: resolvedObservation?.observedLivemode ?? null,
          observedPaymentIntentReferenceSha256:
            resolvedObservation?.observedPaymentIntentReferenceSha256 ?? null,
          providerResponseSha256:
            resolvedObservation?.providerResponseSha256 ?? null,
          confirmationEvidenceSha256: evidenceSha256,
          webhookEventSha256: observation.webhookEventSha256,
          retrievalEvidenceSha256: observation.retrievalEvidenceSha256,
          failureCode: failure?.failureCode ?? null,
          failureEvidenceSha256: failure?.failureEvidenceSha256 ?? null,
          reconciliationEvidenceSha256,
          livemode: true,
        });
      } catch {
        throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
          "terminal_persistence_failed",
        );
      }
      if (
        !persistenceResultMatches(reconciled, {
          attemptId: attempt.attemptId,
          amountCents: attempt.amountCents,
          paymentIntentReferenceSha256:
            attempt.paymentIntentReferenceSha256,
        })
        || reconciled.confirmation_state !== "reconciled"
        || reconciled.confirmation_revision !== 3
        || reconciled.reconciled_outcome !== outcome
        || (reconciled.decision !== "reconciled"
          && reconciled.decision !== "replay")
      ) {
        throw new FlightConsumerLiveStripePaymentIntentConfirmationError(
          "terminal_persistence_failed",
        );
      }
      return Object.freeze({
        ...authorityBase(),
        decision: reconciled.decision,
        attemptId: reconciled.attempt_id,
        confirmationState: "reconciled" as const,
        confirmationRevision: 3 as const,
        reconciledOutcome: outcome,
        stateReceiptSha256: reconciled.state_receipt_sha256,
        reconciliationEvidenceSha256,
        orderCreationRemainsLaterGate: true as const,
      });
    },
  });
}
