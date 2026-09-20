import { types as nodeTypes } from "node:util";
import {
  digestFlightProviderOrderCompletionCanonicalEvidence,
  getFlightCommerceAggregatePrefix,
  isFlightSha256Digest,
  isFlightStableToken,
  type FlightCommerceLifecycle,
  type FlightProviderOrderCompletionCanonicalEvidence,
  type FlightTransitionEvidence,
} from "./commerce-domain";
import {
  DUFFEL_SANDBOX_PROVIDER_ID,
  buildDuffelSandboxOrderCreatePlan,
  classifyDuffelOrderCreateOutcome,
  digestDuffelSandboxOrderTravelerPii,
  isDuffelSandboxOrderCreatePlan,
  rehydrateDuffelSandboxOfferEvidence,
  sanitizeDuffelSandboxOrderResponse,
  sanitizeDuffelSandboxOrdersByOfferResponse,
  verifyDuffelSandboxOrderCreateAuthority,
  type DuffelAuthenticatedOfferEvidenceRepository,
  type DuffelOfferEvidenceScope,
  type DuffelRefreshedOfferEvidence,
  type DuffelSandboxAdultOrderTraveler,
  type DuffelSandboxOrderCreateAuthorityClaims,
  type DuffelSandboxOrderCreateAuthorityVerifier,
  type DuffelSandboxOrderCreatePlan,
  type DuffelSanitizedOrderEvidence,
} from "./duffel-sandbox-contract";
import {
  buildFlightProviderOperationRequestBinding,
  type FlightProviderCreateOrderInput,
  type FlightProviderCreateOrderReconciliationResult,
  type FlightProviderCreateOrderResult,
  type FlightProviderOperationRequestBinding,
  type FlightProviderTravelerBinding,
} from "./provider-adapter";
import {
  canonicalFlightJson,
  digestFlightRuntimeSettlementBinding,
  sha256FlightEvidence,
  type FlightCanonicalJsonValue,
  type FlightRuntimeSettlementBinding,
} from "./runtime-safety";

/** This bridge only prepares and projects local evidence. Every activation remains off. */
export const DUFFEL_SANDBOX_BRIDGE_MODE = "offline_hold_only" as const;

export const duffelSandboxBridgeCapabilities = Object.freeze({
  providerTrafficAuthorized: false,
  bookingAuthorized: false,
  settlementAuthorized: false,
  ticketMutationAuthorized: false,
  separateTicketIssueAuthorized: false,
  lifecycleMutationAuthorized: false,
  authenticatedCompletionReceiptIssued: false,
  externalRequestMade: false,
});

export class DuffelSandboxBridgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuffelSandboxBridgeError";
  }
}

export type DuffelSandboxVerifiedSyntheticAdultTraveler = Readonly<{
  decision: "verified_synthetic_adult";
  traveler: DuffelSandboxAdultOrderTraveler;
  piiAuthorityReceiptDigest: string;
}>;

/** Trusted server-side PII boundary. The bridge still checks every returned binding and Duffel field. */
export interface DuffelSandboxTrustedTravelerResolver {
  resolveSyntheticAdultTraveler(
    binding: FlightProviderTravelerBinding,
  ): Promise<DuffelSandboxVerifiedSyntheticAdultTraveler>;
}

export type DuffelSandboxCreateOrderBridgePackage = Readonly<{
  version: "duffel-sandbox-create-order-bridge-v1";
  mode: typeof DUFFEL_SANDBOX_BRIDGE_MODE;
  durableOfferReceiptDigest: string;
  durableOfferRecordDigest: string;
  orderCreatePlan: DuffelSandboxOrderCreatePlan;
  providerRequestBinding: FlightProviderOperationRequestBinding;
  canonicalBridgeDigest: string;
  providerTrafficAuthorized: false;
  bookingAuthorized: false;
  settlementAuthorized: false;
  separateTicketIssueAuthorized: false;
  externalRequestMade: false;
}>;

export type DuffelSandboxCreateOrderReconciliationProjection = Readonly<{
  version: "duffel-sandbox-create-order-reconciliation-projection-v1";
  timeoutDecision: "manual_review";
  decision: "order_absent" | "requires_full_order_validation" | "manual_review";
  retryCreateOrder: false;
  directMutationAuthorized: false;
  result: FlightProviderCreateOrderReconciliationResult;
}>;

type CreateOrderBridgeState = Readonly<{
  expectedOffer: DuffelRefreshedOfferEvidence;
  providerInput: FlightProviderCreateOrderInput;
  expectedProviderPassengerIds: readonly string[];
  scope: DuffelOfferEvidenceScope;
}>;

type ProjectedOrderState = Readonly<{
  bridgePackage: DuffelSandboxCreateOrderBridgePackage;
  orderEvidence: DuffelSanitizedOrderEvidence;
  providerOperationRequestReceiptDigest: string;
}>;

const createOrderBridgePackages = new WeakMap<object, CreateOrderBridgeState>();
const projectedCreateOrderResults = new WeakMap<object, ProjectedOrderState>();

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child));
    Object.freeze(value);
  }
  return value;
}

function assertExactContainer(value: unknown, expectedKeys: readonly string[], label: string) {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || nodeTypes.isProxy(value)) throw new Error();
    const prototype = Object.getPrototypeOf(value) as object | null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(descriptors).sort();
    const expected = [...expectedKeys].sort();
    if (
      (prototype !== Object.prototype && prototype !== null)
      || Object.getOwnPropertySymbols(value).length !== 0
      || keys.length !== expected.length
      || keys.some((key, index) => key !== expected[index])
      || Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !("value" in descriptor))
    ) throw new Error();
    return descriptors;
  } catch {
    throw new DuffelSandboxBridgeError(`${label} must be an exact non-proxy data object.`);
  }
}

function snapshotCanonical<T>(value: T, label: string): T {
  let nodes = 0;
  const visit = (current: unknown, depth: number, ancestors: ReadonlySet<object>): FlightCanonicalJsonValue => {
    nodes += 1;
    if (nodes > 20_000 || depth > 64) throw new Error();
    if (current === null || typeof current === "string" || typeof current === "boolean") return current;
    if (typeof current === "number") {
      if (!Number.isSafeInteger(current)) throw new Error();
      return Object.is(current, -0) ? 0 : current;
    }
    if (typeof current !== "object" || nodeTypes.isProxy(current) || ancestors.has(current)) throw new Error();
    const nextAncestors = new Set(ancestors).add(current);
    if (Object.getOwnPropertySymbols(current).length !== 0) throw new Error();
    const descriptors = Object.getOwnPropertyDescriptors(current);
    if (Array.isArray(current)) {
      if (Object.getPrototypeOf(current) !== Array.prototype) throw new Error();
      const elementKeys = Object.keys(descriptors).filter((key) => key !== "length");
      if (
        elementKeys.length !== current.length
        || elementKeys.some((key, index) => key !== String(index))
      ) throw new Error();
      return elementKeys.map((key) => {
        const descriptor = descriptors[key]!;
        if (!descriptor.enumerable || !("value" in descriptor) || descriptor.value === undefined) throw new Error();
        return visit(descriptor.value, depth + 1, nextAncestors);
      });
    }
    const prototype = Object.getPrototypeOf(current) as object | null;
    if (prototype !== Object.prototype && prototype !== null) throw new Error();
    const output = Object.create(null) as Record<string, FlightCanonicalJsonValue>;
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (
        !descriptor.enumerable
        || !("value" in descriptor)
        || descriptor.value === undefined
        || key === "__proto__"
        || key === "prototype"
        || key === "constructor"
      ) throw new Error();
      Object.defineProperty(output, key, {
        value: visit(descriptor.value, depth + 1, nextAncestors),
        enumerable: true,
        configurable: false,
        writable: false,
      });
    }
    return output;
  };
  try {
    return deepFreeze(visit(value, 0, new Set()) as T);
  } catch {
    throw new DuffelSandboxBridgeError(`${label} must contain canonical data only.`);
  }
}

function exactDigest(value: unknown, label: string) {
  if (typeof value !== "string" || !isFlightSha256Digest(value)) {
    throw new DuffelSandboxBridgeError(`${label} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function captureTrustedMethod<T extends (...args: never[]) => unknown>(value: object, key: string, label: string): T {
  try {
    let owner: object | null = value;
    while (owner !== null) {
      if (nodeTypes.isProxy(owner)) throw new Error();
      const descriptor = Object.getOwnPropertyDescriptor(owner, key);
      if (descriptor !== undefined) {
        if (!("value" in descriptor) || typeof descriptor.value !== "function") throw new Error();
        return descriptor.value as T;
      }
      owner = Object.getPrototypeOf(owner) as object | null;
    }
  } catch {
    throw new DuffelSandboxBridgeError(`${label} must expose a fixed trusted method.`);
  }
  throw new DuffelSandboxBridgeError(`${label} must expose a fixed trusted method.`);
}

function exactPackage(value: DuffelSandboxCreateOrderBridgePackage) {
  const state = createOrderBridgePackages.get(value as object);
  if (state === undefined) throw new DuffelSandboxBridgeError("Duffel create-order bridge package was not prepared by this module.");
  return state;
}

function sameCanonical(left: unknown, right: unknown) {
  return canonicalFlightJson(left as FlightCanonicalJsonValue) === canonicalFlightJson(right as FlightCanonicalJsonValue);
}

function travelerResultSnapshot(
  value: DuffelSandboxVerifiedSyntheticAdultTraveler,
  expected: FlightProviderTravelerBinding,
  index: number,
) {
  const result = snapshotCanonical(value, `Duffel traveler resolution ${index + 1}`);
  assertExactContainer(result, ["decision", "piiAuthorityReceiptDigest", "traveler"], `Duffel traveler resolution ${index + 1}`);
  if (result.decision !== "verified_synthetic_adult") {
    throw new DuffelSandboxBridgeError(`Duffel traveler resolution ${index + 1} was not verified by the trusted resolver.`);
  }
  assertExactContainer(result.traveler, [
    "bornOn",
    "email",
    "familyName",
    "gender",
    "givenName",
    "phoneNumber",
    "piiRecordDigest",
    "providerPassengerId",
    "title",
    "travelerRef",
  ], `Duffel traveler resolution ${index + 1}`);
  if (
    result.traveler.travelerRef !== expected.travelerRef
    || result.traveler.piiRecordDigest !== expected.piiRecordDigest
  ) {
    throw new DuffelSandboxBridgeError(`Duffel traveler resolution ${index + 1} is bound to another traveler or PII record.`);
  }
  return {
    traveler: result.traveler,
    piiAuthorityReceiptDigest: exactDigest(
      result.piiAuthorityReceiptDigest,
      `Duffel traveler resolution ${index + 1} PII-authority receipt`,
    ),
  };
}

/**
 * Rehydrates one repository-authenticated refreshed offer and prepares a local,
 * non-executable create-order package. The canonical bridge digest is an
 * integrity identifier only; it is not an authorization or authenticated receipt.
 */
export async function prepareDuffelSandboxCreateOrderBridge(input: Readonly<{
  repository: DuffelAuthenticatedOfferEvidenceRepository;
  refreshedOfferReceiptDigest: string;
  providerInput: FlightProviderCreateOrderInput;
  settlementBinding: FlightRuntimeSettlementBinding;
  travelerResolver: DuffelSandboxTrustedTravelerResolver;
  authorityVerifier: DuffelSandboxOrderCreateAuthorityVerifier;
  termsAcceptanceReceiptDigest: string;
  settlementAuthorityReceiptDigest: string;
  scope: DuffelOfferEvidenceScope;
}>): Promise<DuffelSandboxCreateOrderBridgePackage> {
  const descriptors = assertExactContainer(input, [
    "authorityVerifier",
    "providerInput",
    "refreshedOfferReceiptDigest",
    "repository",
    "scope",
    "settlementAuthorityReceiptDigest",
    "settlementBinding",
    "termsAcceptanceReceiptDigest",
    "travelerResolver",
  ], "Duffel create-order bridge input");
  const repository = descriptors.repository!.value as DuffelAuthenticatedOfferEvidenceRepository;
  const travelerResolver = descriptors.travelerResolver!.value as DuffelSandboxTrustedTravelerResolver;
  const refreshedOfferReceiptDigest = exactDigest(
    descriptors.refreshedOfferReceiptDigest!.value,
    "Duffel durable refreshed-offer receipt",
  );
  if (travelerResolver === null || typeof travelerResolver !== "object" || nodeTypes.isProxy(travelerResolver)) {
    throw new DuffelSandboxBridgeError("Duffel trusted traveler resolver is unavailable.");
  }
  const resolveSyntheticAdultTraveler = captureTrustedMethod<DuffelSandboxTrustedTravelerResolver["resolveSyntheticAdultTraveler"]>(
    travelerResolver,
    "resolveSyntheticAdultTraveler",
    "Duffel trusted traveler resolver",
  );

  const rehydrated = await rehydrateDuffelSandboxOfferEvidence(
    repository,
    refreshedOfferReceiptDigest,
    descriptors.scope!.value as DuffelOfferEvidenceScope,
  );
  if (rehydrated.stage !== "refreshed" || rehydrated.evidence.version !== "duffel-refreshed-offer-v1") {
    throw new DuffelSandboxBridgeError("Duffel create-order preparation requires a repository-authenticated refreshed offer.");
  }

  const providerInputCandidate = descriptors.providerInput!.value as FlightProviderCreateOrderInput;
  const settlementBindingCandidate = descriptors.settlementBinding!.value as FlightRuntimeSettlementBinding;
  const providerInput = snapshotCanonical(providerInputCandidate, "Duffel provider create-order input");
  const settlementBinding = snapshotCanonical(settlementBindingCandidate, "Duffel settlement binding");
  const requestBinding = buildFlightProviderOperationRequestBinding({
    providerId: DUFFEL_SANDBOX_PROVIDER_ID,
    mode: "provider_sandbox",
    executionBinding: null,
    paymentExecutionBinding: null,
    settlementExecutionBinding: settlementBinding,
  }, "create_order", providerInput);
  const settlementBindingDigest = digestFlightRuntimeSettlementBinding(settlementBinding);
  if (
    settlementBinding.providerId !== DUFFEL_SANDBOX_PROVIDER_ID
    || settlementBinding.method !== "provider_balance"
    || settlementBinding.currency !== "USD"
    || requestBinding.settlementBindingDigest !== settlementBindingDigest
    || providerInput.settlementIntent.settlementBindingDigest !== settlementBindingDigest
  ) throw new DuffelSandboxBridgeError("Duffel create-order input is bound to another exact settlement authority.");
  if (
    providerInput.offerId !== rehydrated.snapshot.offerId
    || providerInput.acceptedTermsDigest !== rehydrated.evidence.termsDigest
    || providerInput.offerRefreshReceiptDigest !== rehydrated.receiptDigest
    || providerInput.idempotency.scopeId !== rehydrated.scope.commerceId
    || !sameCanonical(providerInput.total, rehydrated.snapshot.total)
    || !sameCanonical(providerInput.settlementIntent.amount, providerInput.total)
  ) throw new DuffelSandboxBridgeError("Duffel create-order input is not bound to the exact authenticated refreshed offer.");

  const resolved = await Promise.all(providerInput.travelers.map(async (binding, index) => travelerResultSnapshot(
    await Reflect.apply(resolveSyntheticAdultTraveler, travelerResolver, [binding]),
    binding,
    index,
  )));
  const travelers = resolved.map(({ traveler }) => traveler);
  for (const [index, traveler] of travelers.entries()) {
    const { piiRecordDigest, ...piiFields } = traveler;
    if (piiRecordDigest !== digestDuffelSandboxOrderTravelerPii({
      scope: rehydrated.scope,
      departureDate: rehydrated.search.departureDate,
      traveler: piiFields,
    })) {
      throw new DuffelSandboxBridgeError(`Duffel traveler resolution ${index + 1} PII digest does not cover the exact synthetic passenger payload.`);
    }
  }
  const expectedProviderPassengerIds = travelers.map((traveler) => traveler.providerPassengerId);
  const authorityClaims: DuffelSandboxOrderCreateAuthorityClaims = deepFreeze({
    version: "duffel-sandbox-order-create-authority-claims-v1" as const,
    scope: rehydrated.scope,
    offerEvidenceReceiptDigest: rehydrated.receiptDigest,
    localOfferId: rehydrated.snapshot.offerId,
    acceptedTermsDigest: providerInput.acceptedTermsDigest,
    termsAcceptanceReceiptDigest: exactDigest(
      descriptors.termsAcceptanceReceiptDigest!.value,
      "Duffel terms-acceptance receipt",
    ),
    settlementBindingDigest,
    settlementAuthorityReceiptDigest: exactDigest(
      descriptors.settlementAuthorityReceiptDigest!.value,
      "Duffel settlement-authority receipt",
    ),
    travelerAuthorities: travelers.map((traveler, index) => ({
      travelerRef: traveler.travelerRef,
      piiRecordDigest: traveler.piiRecordDigest,
      providerPassengerIdDigest: sha256FlightEvidence({
        version: "duffel-passenger-id-v1",
        value: traveler.providerPassengerId,
      }),
      piiAuthorityReceiptDigest: resolved[index]!.piiAuthorityReceiptDigest,
    })),
  });
  const authority = await verifyDuffelSandboxOrderCreateAuthority(
    authorityClaims,
    descriptors.authorityVerifier!.value as DuffelSandboxOrderCreateAuthorityVerifier,
  );
  const orderCreatePlan = buildDuffelSandboxOrderCreatePlan({
    offer: rehydrated,
    authority,
    total: providerInput.total,
    travelers,
  });
  if (!isDuffelSandboxOrderCreatePlan(orderCreatePlan)) {
    throw new DuffelSandboxBridgeError("Duffel order-create plan lost its local contract brand.");
  }
  const canonicalBridgeDigest = sha256FlightEvidence({
    version: "duffel-sandbox-create-order-bridge-v1",
    durableOfferReceiptDigest: rehydrated.receiptDigest,
    durableOfferRecordDigest: rehydrated.recordDigest,
    orderCreatePlanDigest: orderCreatePlan.bridgeReceiptDigest,
    providerRequestBinding: requestBinding as unknown as FlightCanonicalJsonValue,
  });
  const bridgePackage = deepFreeze({
    version: "duffel-sandbox-create-order-bridge-v1" as const,
    mode: DUFFEL_SANDBOX_BRIDGE_MODE,
    durableOfferReceiptDigest: rehydrated.receiptDigest,
    durableOfferRecordDigest: rehydrated.recordDigest,
    orderCreatePlan,
    providerRequestBinding: snapshotCanonical(requestBinding, "Duffel provider request binding"),
    canonicalBridgeDigest,
    providerTrafficAuthorized: false as const,
    bookingAuthorized: false as const,
    settlementAuthorized: false as const,
    separateTicketIssueAuthorized: false as const,
    externalRequestMade: false as const,
  });
  createOrderBridgePackages.set(bridgePackage, deepFreeze({
    expectedOffer: rehydrated.evidence,
    providerInput,
    expectedProviderPassengerIds,
    scope: rehydrated.scope,
  }));
  return bridgePackage;
}

export function isDuffelSandboxCreateOrderBridgePackage(
  value: unknown,
): value is DuffelSandboxCreateOrderBridgePackage {
  return value !== null && typeof value === "object" && createOrderBridgePackages.has(value);
}

/** Projects local response bytes. It does not authenticate their origin or perform the create operation. */
export function projectDuffelSandboxCreateOrderResult(
  rawBody: Uint8Array,
  input: Readonly<{
    bridgePackage: DuffelSandboxCreateOrderBridgePackage;
    retrievedAt: string;
    providerOperationRequestReceiptDigest: string;
    providerOperationReceiptDigest: string;
  }>,
): FlightProviderCreateOrderResult {
  const descriptors = assertExactContainer(input, [
    "bridgePackage",
    "providerOperationReceiptDigest",
    "providerOperationRequestReceiptDigest",
    "retrievedAt",
  ], "Duffel order projection input");
  const bridgePackage = descriptors.bridgePackage!.value as DuffelSandboxCreateOrderBridgePackage;
  const state = exactPackage(bridgePackage);
  const retrievedAt = descriptors.retrievedAt!.value;
  if (typeof retrievedAt !== "string") throw new DuffelSandboxBridgeError("Duffel order retrieval time is malformed.");
  const providerOperationRequestReceiptDigest = exactDigest(
    descriptors.providerOperationRequestReceiptDigest!.value,
    "Duffel provider operation-request receipt",
  );
  const providerOperationReceiptDigest = exactDigest(
    descriptors.providerOperationReceiptDigest!.value,
    "Duffel provider operation receipt",
  );
  const orderEvidence = sanitizeDuffelSandboxOrderResponse(rawBody, {
    expectedOffer: state.expectedOffer,
    acceptedTermsDigest: state.providerInput.acceptedTermsDigest,
    expectedProviderPassengerIds: state.expectedProviderPassengerIds,
    retrievedAt,
  });
  if (!isFlightStableToken(orderEvidence.providerOrderId)) {
    throw new DuffelSandboxBridgeError("Duffel provider order ID is outside the provider-neutral stable-ID boundary.");
  }

  let ticketState: "not_started" | "issuance_pending" | "issued";
  let ticketReferenceDigests: readonly [] | readonly [string, ...string[]];
  if (orderEvidence.ticketingEstablished) {
    if (orderEvidence.ticketDocumentDigests.length < 1) {
      throw new DuffelSandboxBridgeError("Duffel issued-ticket evidence is missing its electronic documents.");
    }
    ticketState = "issued";
    ticketReferenceDigests = orderEvidence.ticketDocumentDigests as [string, ...string[]];
  } else {
    if (orderEvidence.ticketDocumentDigests.length !== 0) {
      throw new DuffelSandboxBridgeError("Partial Duffel electronic-ticket coverage requires manual review.");
    }
    ticketReferenceDigests = [];
    if (orderEvidence.paidAt !== null && !orderEvidence.awaitingPayment) {
      ticketState = "issuance_pending";
    } else if (orderEvidence.paidAt === null && orderEvidence.awaitingPayment) {
      ticketState = "not_started";
    } else {
      throw new DuffelSandboxBridgeError("Duffel payment and ticket evidence is contradictory.");
    }
  }
  const result = deepFreeze({
    providerId: DUFFEL_SANDBOX_PROVIDER_ID,
    source: "provider_sandbox" as const,
    orderId: orderEvidence.providerOrderId,
    offerId: state.providerInput.offerId,
    acceptedTermsDigest: state.providerInput.acceptedTermsDigest,
    offerRefreshReceiptDigest: state.providerInput.offerRefreshReceiptDigest,
    total: state.providerInput.total,
    orderState: "order_confirmed" as const,
    ticketState,
    ticketReferenceDigests,
    providerReferenceDigest: providerOperationReceiptDigest,
    externalSideEffect: true,
  }) as FlightProviderCreateOrderResult;
  projectedCreateOrderResults.set(result as object, {
    bridgePackage,
    orderEvidence,
    providerOperationRequestReceiptDigest,
  });
  return result;
}

/**
 * Returns the already-sanitized order evidence for the exact bridge/result
 * pair. This does not parse new bytes or establish provider authenticity; it
 * only exposes the immutable evidence created by the certified projection so
 * the durable consumer finalizer can bind encrypted references and timestamps.
 */
export function readDuffelSandboxProjectedOrderEvidence(input: Readonly<{
  bridgePackage: DuffelSandboxCreateOrderBridgePackage;
  result: FlightProviderCreateOrderResult;
}>): DuffelSanitizedOrderEvidence {
  const descriptors = assertExactContainer(
    input,
    ["bridgePackage", "result"],
    "Duffel projected-order evidence input",
  );
  const bridgePackage = descriptors.bridgePackage!.value as DuffelSandboxCreateOrderBridgePackage;
  const result = descriptors.result!.value as FlightProviderCreateOrderResult;
  const projection = projectedCreateOrderResults.get(result as object);
  if (projection === undefined || projection.bridgePackage !== bridgePackage) {
    throw new DuffelSandboxBridgeError(
      "Duffel order evidence was not projected from the exact bridge package.",
    );
  }
  return projection.orderEvidence;
}

/**
 * Builds canonical evidence only. A trusted issuer must authenticate the exact
 * canonical bytes, and commerce completion still requires its durable finalizer.
 */
export function buildDuffelSandboxOrderCompletionCanonicalEvidence(input: Readonly<{
  bridgePackage: DuffelSandboxCreateOrderBridgePackage;
  result: FlightProviderCreateOrderResult;
  lifecycle: FlightCommerceLifecycle;
}>): FlightProviderOrderCompletionCanonicalEvidence {
  const descriptors = assertExactContainer(input, ["bridgePackage", "lifecycle", "result"], "Duffel completion-evidence input");
  const bridgePackage = descriptors.bridgePackage!.value as DuffelSandboxCreateOrderBridgePackage;
  const packageState = exactPackage(bridgePackage);
  const result = descriptors.result!.value as FlightProviderCreateOrderResult;
  const projection = projectedCreateOrderResults.get(result as object);
  if (projection === undefined || projection.bridgePackage !== bridgePackage) {
    throw new DuffelSandboxBridgeError("Duffel order result was not projected from the exact bridge package.");
  }
  if (
    result.orderState !== "order_confirmed"
    || !["not_started", "issuance_pending", "issued"].includes(result.ticketState)
  ) throw new DuffelSandboxBridgeError("Duffel projected order result is outside the certified create-order state matrix.");
  const providerTicketState = result.ticketState as "not_started" | "issuance_pending" | "issued";
  const lifecycle = descriptors.lifecycle!.value as FlightCommerceLifecycle;
  const expectedCurrentAggregate = getFlightCommerceAggregatePrefix(lifecycle);
  if (
    lifecycle.order.commerceId !== packageState.scope.commerceId
    || lifecycle.payment.commerceId !== packageState.scope.commerceId
    || lifecycle.ticket.commerceId !== packageState.scope.commerceId
    || lifecycle.order.state !== "order_pending"
    || lifecycle.payment.state !== "captured"
    || lifecycle.ticket.state !== "not_started"
  ) throw new DuffelSandboxBridgeError("Duffel completion evidence requires order_pending/captured/not_started commerce state.");

  const observedAt = projection.orderEvidence.syncedAt;
  const eventSeed = sha256FlightEvidence({
    version: "duffel-sandbox-order-completion-events-v1",
    canonicalBridgeDigest: bridgePackage.canonicalBridgeDigest,
    providerOrderId: result.orderId,
    providerReferenceDigest: result.providerReferenceDigest,
  });
  const transition = (kind: "order" | "ticket", expectedRevision: number): FlightTransitionEvidence => ({
    eventId: `duffel:${kind}:${eventSeed}`,
    occurredAt: observedAt,
    idempotencyDigest: sha256FlightEvidence({
      version: "duffel-sandbox-order-completion-transition-v1",
      kind,
      eventSeed,
      expectedRevision,
    }),
    expectedRevision,
  });
  const outcome = providerTicketState === "issued"
    ? "ticketed"
    : providerTicketState === "issuance_pending"
      ? "ticketing_pending"
      : "order_confirmed";
  const evidence = deepFreeze({
    version: "flight-authenticated-provider-order-completion-v1" as const,
    operation: "create_order" as const,
    commerceId: lifecycle.order.commerceId,
    providerId: result.providerId,
    providerOrderId: result.orderId,
    providerOrderState: "order_confirmed" as const,
    providerTicketState,
    providerOperationRequestReceiptDigest: projection.providerOperationRequestReceiptDigest,
    providerOperationReceiptDigest: result.providerReferenceDigest,
    outcome,
    electronicTicketDocumentReceiptDigests: [...result.ticketReferenceDigests],
    observedAt,
    expectedCurrentAggregate,
    transitions: {
      order: transition("order", lifecycle.order.revision),
      ticket: outcome === "order_confirmed" ? null : transition("ticket", lifecycle.ticket.revision),
    },
  }) satisfies FlightProviderOrderCompletionCanonicalEvidence;
  exactDigest(
    digestFlightProviderOrderCompletionCanonicalEvidence(evidence),
    "Duffel canonical provider-order completion identity",
  );
  return evidence;
}

/** Reconciles a timed-out create attempt by exact offer cardinality and never retries it. */
export function projectDuffelSandboxTimedOutCreateOrderReconciliation(
  rawOrderListBody: Uint8Array,
  input: Readonly<{
    bridgePackage: DuffelSandboxCreateOrderBridgePackage;
    retrievedAt: string;
    originalOperationReceiptDigest: string;
    providerOperationRequestReceiptDigest: string;
    providerStatusReceiptDigest: string;
  }>,
): DuffelSandboxCreateOrderReconciliationProjection {
  const descriptors = assertExactContainer(input, [
    "bridgePackage",
    "originalOperationReceiptDigest",
    "providerOperationRequestReceiptDigest",
    "providerStatusReceiptDigest",
    "retrievedAt",
  ], "Duffel create-order reconciliation input");
  const bridgePackage = descriptors.bridgePackage!.value as DuffelSandboxCreateOrderBridgePackage;
  const state = exactPackage(bridgePackage);
  const retrievedAt = descriptors.retrievedAt!.value;
  if (typeof retrievedAt !== "string") throw new DuffelSandboxBridgeError("Duffel reconciliation retrieval time is malformed.");
  const originalOperationReceiptDigest = exactDigest(
    descriptors.originalOperationReceiptDigest!.value,
    "Duffel original operation receipt",
  );
  const providerOperationRequestReceiptDigest = exactDigest(
    descriptors.providerOperationRequestReceiptDigest!.value,
    "Duffel provider operation-request receipt",
  );
  const providerStatusReceiptDigest = exactDigest(
    descriptors.providerStatusReceiptDigest!.value,
    "Duffel provider status receipt",
  );
  const timeout = classifyDuffelOrderCreateOutcome({ status: null, timedOut: true });
  if (timeout.decision !== "manual_review" || timeout.retrySameRequest) {
    throw new DuffelSandboxBridgeError("Duffel timeout policy no longer fails closed.");
  }
  const list = sanitizeDuffelSandboxOrdersByOfferResponse(rawOrderListBody, {
    expectedOffer: state.expectedOffer,
    retrievedAt,
  });
  const decision = list.decision === "order_absent"
    ? "order_absent"
    : list.decision === "single_order_requires_full_validation"
      ? "requires_full_order_validation"
      : "manual_review";
  const result = deepFreeze({
    providerId: DUFFEL_SANDBOX_PROVIDER_ID,
    source: "provider_sandbox" as const,
    offerId: state.providerInput.offerId,
    orderId: list.providerOrderId,
    operation: "create_order" as const,
    originalOperationReceiptDigest,
    providerOperationRequestReceiptDigest,
    providerStatusReceiptDigest,
    resourceReceiptDigests: [],
    outcome: decision === "order_absent" ? "order_absent" as const : "ambiguous" as const,
    ticketOutcome: decision === "order_absent" ? "no_active_ticket_documents" as const : "ambiguous" as const,
    externalSideEffect: false,
  }) satisfies FlightProviderCreateOrderReconciliationResult;
  return deepFreeze({
    version: "duffel-sandbox-create-order-reconciliation-projection-v1" as const,
    timeoutDecision: "manual_review" as const,
    decision,
    retryCreateOrder: false as const,
    directMutationAuthorized: false as const,
    result,
  });
}
