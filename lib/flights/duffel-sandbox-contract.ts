import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { types as nodeTypes } from "node:util";
import {
  validateFlightCommerceSearchRequest,
  validateFlightOfferSnapshot,
  isFlightStableToken,
  type FlightCommerceSearchRequest,
  type FlightMoney,
  type FlightOfferSnapshot,
  type FlightSegment,
} from "./commerce-domain";
import {
  buildFlightProviderOperationRequestBinding,
  type FlightProviderRepriceResult,
  type FlightProviderSearchResult,
} from "./provider-adapter";
import { canonicalFlightJson, sha256FlightEvidence, type FlightCanonicalJsonValue } from "./runtime-safety";

/**
 * Offline Duffel test-mode contract.
 *
 * This module deliberately has no token, environment, SDK, fetch, HTTP transport,
 * database, or provider-adapter construction path. It builds non-executable plans
 * and projects locally supplied raw fixtures into the provider-neutral model.
 */

export const DUFFEL_SANDBOX_CONTRACT_MODE = "offline_contract_only" as const;
export const DUFFEL_SANDBOX_PROVIDER_ID = "duffel_sandbox_contract_v1" as const;
export const DUFFEL_API_VERSION = "v2" as const;
export const DUFFEL_API_BASE_URL = "https://api.duffel.com" as const;
export const DUFFEL_INITIAL_CURRENCY = "USD" as const;
export const DUFFEL_SEARCH_SUPPLIER_TIMEOUT_MS = 10_000 as const;
export const DUFFEL_ORDER_MINIMUM_TIMEOUT_MS = 130_000 as const;
export const DUFFEL_MAX_RAW_BODY_BYTES = 1_048_576 as const;
export const DUFFEL_LOCAL_WEBHOOK_TOLERANCE_SECONDS = 300 as const;
export const DUFFEL_TEST_AIRLINE = Object.freeze({ ownerName: "Duffel Airways", iataCode: "ZZ" }) as Readonly<{
  ownerName: "Duffel Airways";
  iataCode: "ZZ";
}>;

export const duffelSandboxOfflineCapabilities = Object.freeze({
  credentialsAccepted: false,
  tokenRead: false,
  externalRequestMade: false,
  providerTrafficAuthorized: false,
  bookingAuthorized: false,
  paymentAuthorized: false,
  ticketingAuthorized: false,
  servicingAuthorized: false,
  webhookRegistrationAuthorized: false,
  adapterConstructed: false,
});

export type DuffelSandboxContractOperation =
  | "create_offer_request"
  | "retrieve_offer"
  | "list_orders_by_offer"
  | "create_order";

export type DuffelSandboxRequestPlan = Readonly<{
  version: "duffel-sandbox-request-plan-v1";
  providerId: typeof DUFFEL_SANDBOX_PROVIDER_ID;
  operation: DuffelSandboxContractOperation;
  method: "GET" | "POST";
  baseUrl: typeof DUFFEL_API_BASE_URL;
  path: string;
  query: FlightCanonicalJsonValue;
  apiVersion: typeof DUFFEL_API_VERSION;
  body: FlightCanonicalJsonValue | null;
  requestDigest: string;
  requiredHeaderNames: readonly string[];
  requiresBearerToken: true;
  bearerTokenIncluded: false;
  providerTrafficAuthorized: false;
  externalRequestMade: false;
  providerIdempotencyKeyIncluded: false;
  minimumTimeoutMs: number | null;
}>;

export type DuffelSandboxAdultOrderTraveler = Readonly<{
  travelerRef: string;
  piiRecordDigest: string;
  providerPassengerId: string;
  title: "mr" | "mrs" | "ms" | "miss" | "dr";
  gender: "m" | "f";
  givenName: string;
  familyName: string;
  bornOn: string;
  email: string;
  phoneNumber: string;
}>;

export type DuffelSandboxOrderTravelerPiiFields = Readonly<
  Omit<DuffelSandboxAdultOrderTraveler, "piiRecordDigest">
>;

export type DuffelOfferEvidenceScope = Readonly<{
  tenantId: string;
  commerceId: string;
  actorId: string;
}>;

export type DuffelSandboxOrderTravelerAuthority = Readonly<{
  travelerRef: string;
  piiRecordDigest: string;
  providerPassengerIdDigest: string;
  piiAuthorityReceiptDigest: string;
}>;

export type DuffelSandboxOrderCreateAuthorityClaims = Readonly<{
  version: "duffel-sandbox-order-create-authority-claims-v1";
  scope: DuffelOfferEvidenceScope;
  offerEvidenceReceiptDigest: string;
  localOfferId: string;
  acceptedTermsDigest: string;
  termsAcceptanceReceiptDigest: string;
  settlementBindingDigest: string;
  settlementAuthorityReceiptDigest: string;
  travelerAuthorities: readonly DuffelSandboxOrderTravelerAuthority[];
}>;

export type DuffelSandboxOrderCreateAuthorityVerificationResult =
  | Readonly<{
    decision: "verified";
    claimsDigest: string;
    authorityReceiptDigest: string;
  }>
  | Readonly<{ decision: "invalid" | "unavailable" }>;

/** Trusted server port; implementations must authenticate every referenced receipt and principal binding. */
export interface DuffelSandboxOrderCreateAuthorityVerifier {
  readTrustedTime(): string;
  verifyOrderCreateAuthority(input: Readonly<{
    claims: DuffelSandboxOrderCreateAuthorityClaims;
    canonicalClaimsPayload: Uint8Array;
    evaluatedAt: string;
  }>): Promise<DuffelSandboxOrderCreateAuthorityVerificationResult>;
}

export type DuffelVerifiedSandboxOrderCreateAuthority = Readonly<{
  version: "duffel-verified-sandbox-order-create-authority-v1";
  claims: DuffelSandboxOrderCreateAuthorityClaims;
  verifiedAt: string;
  claimsDigest: string;
  authorityReceiptDigest: string;
}>;

export type DuffelSandboxOrderCreatePlan = Readonly<{
  version: "duffel-sandbox-order-create-plan-v1";
  plan: DuffelSandboxRequestPlan;
  scope: DuffelOfferEvidenceScope;
  offerEvidenceReceiptDigest: string;
  acceptedTermsDigest: string;
  termsAcceptanceReceiptDigest: string;
  offerRefreshReceiptDigest: string;
  travelerBindingsDigest: string;
  settlementBindingDigest: string;
  settlementAuthorityReceiptDigest: string;
  authorityClaimsDigest: string;
  authorityReceiptDigest: string;
  verifiedAt: string;
  dispatchNotAfter: string;
  bridgeReceiptDigest: string;
  providerTrafficAuthorized: false;
  bookingAuthorized: false;
  paymentAuthorized: false;
  externalRequestMade: false;
}>;

export type DuffelOperatingCarrierDisclosure = Readonly<{
  segmentId: string;
  operatingCarrierName: string;
  operatingCarrierIataCode: string;
  marketingCarrierName: string;
  marketingCarrierIataCode: string;
  operatingConditionsOfCarriageUrl: string | null;
  marketingConditionsOfCarriageUrl: string | null;
}>;

export type DuffelSanitizedOfferEvidence = Readonly<{
  version: "duffel-sanitized-offer-v1";
  providerOfferId: string;
  providerOfferIdDigest: string;
  requestDigest: string;
  requestPlanDigest: string;
  offerRequestIdDigest: string;
  cabin: FlightCommerceSearchRequest["cabin"];
  liveMode: false;
  ownerName: "Duffel Airways";
  ownerIataCode: "ZZ";
  partial: false;
  requiresInstantPayment: boolean;
  paymentRequiredBy: string | null;
  priceGuaranteeExpiresAt: string | null;
  passengerIdentityDocumentsRequired: boolean;
  providerPassengerIdDigests: readonly string[];
  total: FlightMoney;
  base: FlightMoney;
  tax: FlightMoney | null;
  retrievedAt: string;
  expiresAt: string;
  segments: readonly FlightSegment[];
  segmentIdentityDigests: readonly string[];
  segmentPhaseIdentityDigests: readonly string[];
  segmentOrderSharedTermsDigests: readonly string[];
  sliceSegmentIdentityDigests: readonly (readonly string[])[];
  slicePhaseIdentityDigests: readonly string[];
  sliceTermsDigests: readonly string[];
  operatingCarrierFlightNumbers: readonly string[];
  carrierDisclosureDigests: readonly string[];
  offerConditionsDigest: string;
  operatingCarrierDisclosures: readonly DuffelOperatingCarrierDisclosure[];
  termsDigest: string;
  rawBodyDigest: string;
}>;

export type DuffelRefreshedOfferEvidence = Readonly<Omit<DuffelSanitizedOfferEvidence, "version"> & {
  version: "duffel-refreshed-offer-v1";
  refreshedAt: string;
  previousTermsDigest: string;
  previousRawBodyDigest: string;
  previousRefreshReceiptDigest: string | null;
  retrievalPlanDigest: string;
  termsChanged: boolean;
  refreshReceiptDigest: string;
}>;

export type DuffelSanitizedOrderEvidence = Readonly<{
  version: "duffel-sanitized-order-v1";
  providerOrderId: string;
  providerOrderIdDigest: string;
  liveMode: false;
  selectedOfferIdDigest: string;
  acceptedTermsDigest: string;
  offerRefreshReceiptDigest: string;
  offerRefreshedAt: string;
  bookingReferencePresent: true;
  passengerIdDigests: readonly string[];
  total: FlightMoney;
  base: FlightMoney;
  tax: FlightMoney | null;
  createdAt: string;
  syncedAt: string;
  uncancelled: true;
  itineraryDigest: string;
  paidAt: string | null;
  awaitingPayment: boolean;
  ticketDocumentDigests: readonly string[];
  ticketedPassengerIdDigests: readonly string[];
  everyPassengerCoveredByElectronicTicket: boolean;
  ticketingEstablished: boolean;
  rawBodyDigest: string;
}>;

export type DuffelOrderListReconciliationEvidence = Readonly<{
  version: "duffel-order-list-reconciliation-v1";
  providerOfferIdDigest: string;
  offerRefreshReceiptDigest: string;
  requestPlanDigest: string;
  retrievedAt: string;
  rawBodyDigest: string;
  paginationComplete: true;
  orderCount: number;
  providerOrderId: string | null;
  providerOrderIdDigests: readonly string[];
  decision: "order_absent" | "single_order_requires_full_validation" | "multiple_orders_manual_review";
  directMutationAuthorized: false;
}>;

export type DuffelOrderCreateOutcome = Readonly<{
  decision: "validate_created_order" | "manual_review" | "order_absent" | "search_again" | "blocked";
  retrySameRequest: false;
  reconciliationRequired: boolean;
  reason: string;
}>;

export type DuffelDurableOfferEvidenceRecord = Readonly<{
  version: "duffel-durable-offer-evidence-record-v1";
  stage: "initial" | "refreshed";
  scope: DuffelOfferEvidenceScope;
  localOfferId: string;
  search: FlightCommerceSearchRequest;
  observedAt: string;
  retentionExpiresAt: string;
  predecessorReceiptDigest: string | null;
  rawBodyBase64: string;
  rawBodyDigest: string;
  evidenceDigest: string;
  snapshotDigest: string;
  recordDigest: string;
}>;

export type DuffelAuthenticatedOfferEvidenceRepositoryPolicy = Readonly<{
  version: "duffel-offer-evidence-repository-policy-v1";
  decision: "accepted";
  dataClassification: "synthetic_fixture_only";
  realProviderDataAuthorized: false;
  rawBodyLoggingDisabled: true;
  tenantAccessControlRequired: true;
  retentionDeletionRequired: true;
  maximumRetentionSeconds: number;
  trustedTime: string;
}>;

export type DuffelAuthenticatedOfferEvidenceStoreResult = Readonly<{
  decision: "stored" | "already_stored";
  receiptDigest: string;
  recordDigest: string;
}>;

export type DuffelAuthenticatedOfferEvidenceLoadResult =
  | Readonly<{
    decision: "verified";
    receiptDigest: string;
    record: DuffelDurableOfferEvidenceRecord;
  }>
  | Readonly<{ decision: "not_found" | "invalid" }>;

/**
 * Trusted server-side persistence port. A real implementation must authenticate
 * the receipt, bind it to the exact record digest, and return only the record
 * stored under that receipt. The contract never treats an unkeyed self-hash as
 * repository authority.
 */
export interface DuffelAuthenticatedOfferEvidenceLoader {
  readOfferEvidencePolicy(): Promise<DuffelAuthenticatedOfferEvidenceRepositoryPolicy>;
  verifyAndLoadOfferEvidence(
    receiptDigest: string,
    expectedScope: DuffelOfferEvidenceScope,
  ): Promise<DuffelAuthenticatedOfferEvidenceLoadResult>;
}

export interface DuffelAuthenticatedOfferEvidenceRepository
extends DuffelAuthenticatedOfferEvidenceLoader {
  storeOfferEvidence(
    record: DuffelDurableOfferEvidenceRecord,
    expectedScope: DuffelOfferEvidenceScope,
  ): Promise<DuffelAuthenticatedOfferEvidenceStoreResult>;
}

export type DuffelRehydratedOfferEvidence = Readonly<{
  stage: "initial" | "refreshed";
  receiptDigest: string;
  recordDigest: string;
  scope: DuffelOfferEvidenceScope;
  retentionExpiresAt: string;
  search: FlightCommerceSearchRequest;
  snapshot: FlightOfferSnapshot;
  evidence: DuffelSanitizedOfferEvidence | DuffelRefreshedOfferEvidence;
}>;

/**
 * Minimal binding evidence for validating an already-observed terminal order.
 * This deliberately omits the provider offer ID and every request-plan field,
 * and instances are never added to the ordinary offer-evidence WeakSets.
 */
export type DuffelTerminalRecoveryRefreshedOfferEvidence = Readonly<{
  version: "duffel-terminal-recovery-refreshed-offer-evidence-v1";
  providerOfferIdDigest: string;
  providerPassengerIdDigests: readonly string[];
  total: FlightMoney;
  base: FlightMoney;
  tax: FlightMoney | null;
  refreshedAt: string;
  refreshReceiptDigest: string;
  termsDigest: string;
  cabin: FlightCommerceSearchRequest["cabin"];
  segmentIdentityDigests: readonly string[];
  segmentOrderSharedTermsDigests: readonly string[];
  sliceSegmentIdentityDigests: readonly (readonly string[])[];
  sliceTermsDigests: readonly string[];
  operatingCarrierFlightNumbers: readonly string[];
  carrierDisclosureDigests: readonly string[];
  offerConditionsDigest: string;
}>;

/**
 * Historical offer projection for validating an already-observed terminal
 * response. The intentionally different `terminalStage` shape is never added
 * to the private order-create WeakSet and is not an order-dispatch capability.
 */
export type DuffelTerminalRecoveryOfferEvidence = Readonly<{
  version: "duffel-terminal-recovery-offer-evidence-v1";
  terminalStage: "refreshed";
  receiptDigest: string;
  recordDigest: string;
  scope: DuffelOfferEvidenceScope;
  retentionExpiresAt: string;
  search: FlightCommerceSearchRequest;
  snapshot: FlightOfferSnapshot;
  evidence: DuffelTerminalRecoveryRefreshedOfferEvidence;
}>;

export type DuffelWebhookSignature = Readonly<{ timestampSeconds: number; signatureHex: string }>;

export type DuffelWebhookVerificationResult = Readonly<{
  verified: boolean;
  reason:
    | "verified"
    | "malformed_signature"
    | "missing_secret"
    | "invalid_timestamp"
    | "timestamp_outside_local_policy"
    | "payload_rejected"
    | "invalid_signature";
  bodyDigest: string | null;
  timestampSeconds: number | null;
  freshnessPolicy: "local_300_second_policy_not_a_duffel_guarantee";
}>;

export const duffelWebhookEventTypes = [
  "order.created",
  "order.creation_failed",
  "order.airline_initiated_change_detected",
  "air.order.changed",
  "air.payment.pending",
  "air.payment.succeeded",
  "air.payment.failed",
  "air.payment.cancelled",
  "order_cancellation.created",
  "order_cancellation.confirmed",
  "ping.triggered",
] as const;

export type DuffelWebhookEventType = (typeof duffelWebhookEventTypes)[number];

export type DuffelSanitizedWebhookEvent = Readonly<{
  version: "duffel-sanitized-webhook-v1";
  providerId: typeof DUFFEL_SANDBOX_PROVIDER_ID;
  eventId: string;
  eventType: DuffelWebhookEventType | "unknown_quarantined";
  providerEventType: string;
  idempotencyKey: string;
  liveMode: false;
  apiVersion: "v2";
  createdAt: string;
  bodyDigest: string;
  semanticDigest: string;
  quarantined: boolean;
  reconciliationRequired: true;
  directMutationAuthorized: false;
}>;

export type DuffelWebhookReceipt = Readonly<{
  providerId: typeof DUFFEL_SANDBOX_PROVIDER_ID;
  eventId: string;
  eventType: string;
  idempotencyKey: string;
  bodyDigest: string;
  semanticDigest: string;
  status: "received" | "verified" | "processed" | "duplicate" | "blocked" | "failed";
}>;

export class DuffelContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuffelContractError";
  }
}

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
const utf8Encoder = new TextEncoder();
const sha256Pattern = /^[0-9a-f]{64}$/;
const airportPattern = /^[A-Z]{3}$/;
const carrierPattern = /^[A-Z0-9]{2}$/;
const providerIdPattern = /^(?:off|orq|ord|sli|seg|sto|pas|wev|ore)_[A-Za-z0-9]{8,252}$/;
const localTravelerRefPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const exactLocalDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const e164PhonePattern = /^\+[1-9]\d{7,14}$/;
const conservativeEmailPattern = /^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@\u0000-\u001f\u007f]+$/;
const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;
const duffelInstantPattern = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;
const exactUsdPattern = /^(0|[1-9]\d{0,10})\.(\d{2})$/;
const requiredHeaderNamesWithoutBody = Object.freeze(["Accept", "Duffel-Version", "Authorization"]);
const requiredHeaderNamesWithBody = Object.freeze(["Accept", "Content-Type", "Duffel-Version", "Authorization"]);
const exactDecimalLexemeKey = "$duffelExactDecimalLexeme";
const sanitizedDuffelOfferEvidence = new WeakSet<object>();
const refreshedDuffelOfferEvidence = new WeakSet<object>();
const rehydratedDuffelOfferEvidence = new WeakSet<object>();
const terminalRecoveryDuffelOfferEvidence = new WeakSet<object>();
const duffelSandboxRequestPlans = new WeakSet<object>();
const verifiedDuffelOrderCreateAuthorities = new WeakSet<object>();
const duffelSandboxOrderCreatePlans = new WeakSet<object>();
const verifiedDuffelWebhookResults = new WeakSet<object>();
const sanitizedDuffelWebhookEvents = new WeakSet<object>();
const intrinsicUint8Array = Uint8Array;
const intrinsicUint8ArrayPrototype = Uint8Array.prototype;
const intrinsicBufferPrototype = Buffer.prototype;
const intrinsicTypedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const intrinsicTypedArrayBufferGetter = Object.getOwnPropertyDescriptor(intrinsicTypedArrayPrototype, "buffer")!.get!;
const intrinsicTypedArrayByteOffsetGetter = Object.getOwnPropertyDescriptor(intrinsicTypedArrayPrototype, "byteOffset")!.get!;
const intrinsicTypedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(intrinsicTypedArrayPrototype, "byteLength")!.get!;
const intrinsicUint8ArraySet = Uint8Array.prototype.set;
const intrinsicSharedArrayBuffer = typeof SharedArrayBuffer === "undefined" ? null : SharedArrayBuffer;

function digestBytes(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function snapshotDuffelBytes(value: Uint8Array, label: string) {
  if (typeof value !== "object" || value === null || nodeTypes.isProxy(value)) {
    throw new DuffelContractError(`${label} must be a non-proxy byte array.`);
  }
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== intrinsicUint8ArrayPrototype && prototype !== intrinsicBufferPrototype) {
      throw new Error("unsupported prototype");
    }
    for (const key of ["buffer", "byteOffset", "byteLength"] as const) {
      if (Object.prototype.hasOwnProperty.call(value, key)) throw new Error(`shadowed ${key}`);
    }
    const backingBuffer = Reflect.apply(intrinsicTypedArrayBufferGetter, value, []) as ArrayBufferLike;
    const byteOffset = Reflect.apply(intrinsicTypedArrayByteOffsetGetter, value, []) as number;
    const byteLength = Reflect.apply(intrinsicTypedArrayByteLengthGetter, value, []) as number;
    if (intrinsicSharedArrayBuffer !== null && backingBuffer instanceof intrinsicSharedArrayBuffer) {
      throw new DuffelContractError(`${label} cannot use shared mutable backing memory.`);
    }
    if (!Number.isSafeInteger(byteOffset) || !Number.isSafeInteger(byteLength) || byteOffset < 0 || byteLength < 0) {
      throw new Error("invalid intrinsic byte range");
    }
    if (byteLength > DUFFEL_MAX_RAW_BODY_BYTES) {
      throw new DuffelContractError(`${label} exceeds the 1 MiB contract limit.`);
    }
    const backingView = new intrinsicUint8Array(backingBuffer, byteOffset, byteLength);
    const snapshot = new intrinsicUint8Array(byteLength);
    Reflect.apply(intrinsicUint8ArraySet, snapshot, [backingView]);
    const bufferAfter = Reflect.apply(intrinsicTypedArrayBufferGetter, value, []) as ArrayBufferLike;
    const byteOffsetAfter = Reflect.apply(intrinsicTypedArrayByteOffsetGetter, value, []) as number;
    const byteLengthAfter = Reflect.apply(intrinsicTypedArrayByteLengthGetter, value, []) as number;
    if (
      bufferAfter !== backingBuffer
      || byteOffsetAfter !== byteOffset
      || byteLengthAfter !== byteLength
      || snapshot.byteLength !== byteLength
    ) throw new Error("byte view changed during snapshot");
    return snapshot;
  } catch (error) {
    if (error instanceof DuffelContractError) throw error;
    throw new DuffelContractError(`${label} could not be copied into owned memory.`);
  }
}

function digestString(domain: string, value: string) {
  return sha256FlightEvidence({ version: domain, value });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child));
    Object.freeze(value);
  }
  return value;
}

function snapshotCanonicalInput<T>(value: T, label: string): T {
  let nodes = 0;
  const visit = (current: unknown, depth: number, ancestors: ReadonlySet<object>): FlightCanonicalJsonValue => {
    nodes += 1;
    if (nodes > 20_000 || depth > 64) throw new DuffelContractError(`${label} exceeds structural limits.`);
    if (current === null || typeof current === "string" || typeof current === "boolean") return current;
    if (typeof current === "number") {
      if (!Number.isSafeInteger(current) || Object.is(current, -0)) throw new DuffelContractError(`${label} contains an unsupported number.`);
      return current;
    }
    if (typeof current !== "object" || nodeTypes.isProxy(current)) throw new DuffelContractError(`${label} must contain plain data only.`);
    if (ancestors.has(current)) throw new DuffelContractError(`${label} cannot be cyclic.`);
    const nextAncestors = new Set(ancestors).add(current);
    if (Object.getOwnPropertySymbols(current).length !== 0) throw new DuffelContractError(`${label} cannot contain symbol properties.`);
    const descriptors = Object.getOwnPropertyDescriptors(current);
    if (Array.isArray(current)) {
      const keys = Object.keys(descriptors).filter((key) => key !== "length");
      if (keys.length !== current.length || keys.some((key, index) => key !== String(index))) {
        throw new DuffelContractError(`${label} arrays must be dense and cannot have named properties.`);
      }
      return keys.map((key) => {
        const descriptor = descriptors[key]!;
        if (!descriptor.enumerable || !("value" in descriptor) || "get" in descriptor || "set" in descriptor) {
          throw new DuffelContractError(`${label} arrays require enumerable data elements.`);
        }
        return visit(descriptor.value, depth + 1, nextAncestors);
      });
    }
    const prototype = Object.getPrototypeOf(current) as object | null;
    if (prototype !== Object.prototype && prototype !== null) throw new DuffelContractError(`${label} requires plain objects.`);
    const output = Object.create(null) as Record<string, FlightCanonicalJsonValue>;
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!descriptor.enumerable || !("value" in descriptor) || "get" in descriptor || "set" in descriptor || descriptor.value === undefined) {
        throw new DuffelContractError(`${label} requires enumerable data properties without undefined.`);
      }
      if (key === "__proto__" || key === "prototype" || key === "constructor") {
        throw new DuffelContractError(`${label} contains a prohibited property name.`);
      }
      Object.defineProperty(output, key, {
        value: visit(descriptor.value, depth + 1, nextAncestors),
        enumerable: true,
        configurable: false,
        writable: false,
      });
    }
    return output;
  };
  return deepFreeze(visit(value, 0, new Set()) as T);
}

function assertExactInputKeys(value: Readonly<Record<string, unknown>>, label: string, required: readonly string[], optional: readonly string[] = []) {
  const keys = Object.keys(value).sort();
  const allowed = [...required, ...optional].sort();
  if (keys.some((key) => !allowed.includes(key)) || required.some((key) => !keys.includes(key))) {
    throw new DuffelContractError(`${label} has missing or unexpected fields.`);
  }
}

function dataPropertyReference(value: object, key: string, label: string) {
  if (nodeTypes.isProxy(value)) throw new DuffelContractError(`${label} must be a non-proxy data object.`);
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor) || "get" in descriptor || "set" in descriptor) {
    throw new DuffelContractError(`${label} requires an enumerable ${key} data property.`);
  }
  return descriptor.value as unknown;
}

function captureTrustedMethod<T>(value: object, key: string, label: string): T {
  if (nodeTypes.isProxy(value)) throw new DuffelContractError(`${label} must be a non-proxy trusted capability.`);
  let current: object | null = value;
  let depth = 0;
  while (current !== null && depth < 8) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor !== undefined) {
      if (!("value" in descriptor) || typeof descriptor.value !== "function" || "get" in descriptor || "set" in descriptor) {
        throw new DuffelContractError(`${label} requires a stable data-method capability.`);
      }
      return descriptor.value.bind(value) as T;
    }
    current = Object.getPrototypeOf(current) as object | null;
    depth += 1;
  }
  throw new DuffelContractError(`${label} is missing a required method.`);
}

function snapshotOfferEvidenceScope(value: DuffelOfferEvidenceScope, label: string) {
  const scope = snapshotCanonicalInput(value, label) as DuffelOfferEvidenceScope;
  assertExactInputKeys(scope as unknown as Readonly<Record<string, unknown>>, label, ["actorId", "commerceId", "tenantId"]);
  if (!isFlightStableToken(scope.tenantId) || !isFlightStableToken(scope.commerceId) || !isFlightStableToken(scope.actorId)) {
    throw new DuffelContractError(`${label} contains a malformed tenant, commerce, or actor identity.`);
  }
  return scope;
}

function snapshotFlightSearch(value: FlightCommerceSearchRequest) {
  const search = snapshotCanonicalInput(value, "Duffel search input") as FlightCommerceSearchRequest;
  assertExactInputKeys(search as unknown as Readonly<Record<string, unknown>>, "Duffel search input", [
    "cabin", "departureDate", "destination", "origin", "passengers", "returnDate",
  ]);
  assertExactInputKeys(search.passengers as unknown as Readonly<Record<string, unknown>>, "Duffel search passengers", [
    "adults", "children", "infantsInSeat", "infantsOnLap",
  ]);
  return search;
}

class JsonNoDuplicatesParser {
  readonly #source: string;
  #index = 0;
  #nodes = 0;

  constructor(source: string) {
    this.#source = source;
  }

  parse(): FlightCanonicalJsonValue {
    const value = this.#value(0);
    this.#space();
    if (this.#index !== this.#source.length) throw new DuffelContractError("Duffel JSON contains trailing content.");
    return value;
  }

  #space() {
    while (/[ \t\r\n]/.test(this.#source[this.#index] ?? "")) this.#index += 1;
  }

  #touch(depth: number) {
    this.#nodes += 1;
    if (depth > 64 || this.#nodes > 20_000) throw new DuffelContractError("Duffel JSON exceeds structural limits.");
  }

  #value(depth: number): FlightCanonicalJsonValue {
    this.#touch(depth);
    this.#space();
    const current = this.#source[this.#index];
    if (current === "{") return this.#object(depth + 1);
    if (current === "[") return this.#array(depth + 1);
    if (current === '"') return this.#string();
    for (const [literal, value] of [["true", true], ["false", false], ["null", null]] as const) {
      if (this.#source.startsWith(literal, this.#index)) {
        this.#index += literal.length;
        return value;
      }
    }
    const match = this.#source.slice(this.#index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (match === null) throw new DuffelContractError("Duffel JSON is malformed.");
    this.#index += match[0].length;
    const number = Number(match[0]);
    if (!Number.isFinite(number) || (number === 0 && match[0].startsWith("-"))) {
      throw new DuffelContractError("Duffel JSON contains an unsupported numeric lexeme.");
    }
    if (/^-?(?:0|[1-9]\d*)$/.test(match[0])) {
      if (!Number.isSafeInteger(number)) throw new DuffelContractError("Duffel JSON contains an unsafe integer.");
      return number;
    }
    return { [exactDecimalLexemeKey]: match[0] };
  }

  #string() {
    const start = this.#index;
    this.#index += 1;
    let escaped = false;
    while (this.#index < this.#source.length) {
      const current = this.#source[this.#index]!;
      if (!escaped && current === '"') {
        this.#index += 1;
        try {
          const parsed = JSON.parse(this.#source.slice(start, this.#index)) as string;
          for (let index = 0; index < parsed.length; index += 1) {
            const code = parsed.charCodeAt(index);
            if (code >= 0xd800 && code <= 0xdbff) {
              const next = parsed.charCodeAt(index + 1);
              if (next < 0xdc00 || next > 0xdfff) throw new Error();
              index += 1;
            } else if (code >= 0xdc00 && code <= 0xdfff) throw new Error();
          }
          return parsed;
        } catch {
          throw new DuffelContractError("Duffel JSON string is malformed.");
        }
      }
      if (!escaped && current < " ") throw new DuffelContractError("Duffel JSON string contains a control character.");
      if (!escaped && current === "\\") escaped = true;
      else escaped = false;
      this.#index += 1;
    }
    throw new DuffelContractError("Duffel JSON string is unterminated.");
  }

  #object(depth: number): { readonly [key: string]: FlightCanonicalJsonValue } {
    this.#index += 1;
    const output: Record<string, FlightCanonicalJsonValue> = Object.create(null) as Record<string, FlightCanonicalJsonValue>;
    const keys = new Set<string>();
    this.#space();
    if (this.#source[this.#index] === "}") {
      this.#index += 1;
      return output;
    }
    while (true) {
      this.#space();
      if (this.#source[this.#index] !== '"') throw new DuffelContractError("Duffel JSON object key is malformed.");
      const key = this.#string();
      if (keys.has(key)) throw new DuffelContractError("Duffel JSON contains a duplicate object key.");
      if (key === exactDecimalLexemeKey) throw new DuffelContractError("Duffel JSON uses a reserved exact-number key.");
      keys.add(key);
      this.#space();
      if (this.#source[this.#index] !== ":") throw new DuffelContractError("Duffel JSON object separator is malformed.");
      this.#index += 1;
      output[key] = this.#value(depth);
      this.#space();
      const current = this.#source[this.#index];
      if (current === "}") {
        this.#index += 1;
        return output;
      }
      if (current !== ",") throw new DuffelContractError("Duffel JSON object delimiter is malformed.");
      this.#index += 1;
    }
  }

  #array(depth: number): readonly FlightCanonicalJsonValue[] {
    this.#index += 1;
    const output: FlightCanonicalJsonValue[] = [];
    this.#space();
    if (this.#source[this.#index] === "]") {
      this.#index += 1;
      return output;
    }
    while (true) {
      output.push(this.#value(depth));
      this.#space();
      const current = this.#source[this.#index];
      if (current === "]") {
        this.#index += 1;
        return output;
      }
      if (current !== ",") throw new DuffelContractError("Duffel JSON array delimiter is malformed.");
      this.#index += 1;
    }
  }
}

function parseDuffelJsonBodySnapshot(rawBody: Uint8Array) {
  if (!(rawBody instanceof Uint8Array) || rawBody.byteLength < 2 || rawBody.byteLength > DUFFEL_MAX_RAW_BODY_BYTES) {
    throw new DuffelContractError("Duffel response body is missing or exceeds the 1 MiB contract limit.");
  }
  let text: string;
  try {
    text = utf8Decoder.decode(rawBody);
  } catch {
    throw new DuffelContractError("Duffel response body is not valid UTF-8.");
  }
  return deepFreeze(new JsonNoDuplicatesParser(text).parse());
}

export function parseDuffelJsonBody(rawBody: Uint8Array) {
  return parseDuffelJsonBodySnapshot(snapshotDuffelBytes(rawBody, "Duffel response body"));
}

function asRecord(value: FlightCanonicalJsonValue, label: string): Readonly<Record<string, FlightCanonicalJsonValue>> {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.prototype.hasOwnProperty.call(value, exactDecimalLexemeKey)
  ) throw new DuffelContractError(`${label} is missing or malformed.`);
  return value as Readonly<Record<string, FlightCanonicalJsonValue>>;
}

function asArray(value: FlightCanonicalJsonValue | undefined, label: string) {
  if (!Array.isArray(value)) throw new DuffelContractError(`${label} is missing or malformed.`);
  return value;
}

function asString(value: FlightCanonicalJsonValue | undefined, label: string, pattern?: RegExp) {
  if (typeof value !== "string" || (pattern !== undefined && !pattern.test(value))) throw new DuffelContractError(`${label} is missing or malformed.`);
  return value;
}

function asBoolean(value: FlightCanonicalJsonValue | undefined, label: string) {
  if (typeof value !== "boolean") throw new DuffelContractError(`${label} is missing or malformed.`);
  return value;
}

function requiredField(
  record: Readonly<Record<string, FlightCanonicalJsonValue>>,
  key: string,
  label: string,
) {
  if (!Object.prototype.hasOwnProperty.call(record, key)) throw new DuffelContractError(`${label} is missing.`);
  return record[key];
}

function asSafeInteger(value: FlightCanonicalJsonValue | undefined, label: string, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new DuffelContractError(`${label} is missing or malformed.`);
  }
  return value;
}

function exactStringArray(value: FlightCanonicalJsonValue | undefined, label: string, pattern?: RegExp) {
  const values = asArray(value, label).map((item, index) => {
    const text = asString(item, `${label} item ${index + 1}`);
    if (text.trim() !== text || text.length < 1 || text.length > 256 || (pattern !== undefined && !pattern.test(text))) {
      throw new DuffelContractError(`${label} contains a malformed item.`);
    }
    return text;
  });
  if (new Set(values).size !== values.length) throw new DuffelContractError(`${label} contains a duplicate item.`);
  return values;
}

function isProjectedOfferEvidence(value: object): value is DuffelSanitizedOfferEvidence | DuffelRefreshedOfferEvidence {
  return sanitizedDuffelOfferEvidence.has(value) || refreshedDuffelOfferEvidence.has(value);
}

function assertProjectedOfferEvidence(
  evidence: DuffelSanitizedOfferEvidence | DuffelRefreshedOfferEvidence,
  label: string,
) {
  if (
    !isProjectedOfferEvidence(evidence as object)
    || !sha256Pattern.test(evidence.providerOfferIdDigest)
    || digestString("duffel-provider-offer-id-v1", evidence.providerOfferId) !== evidence.providerOfferIdDigest
  ) throw new DuffelContractError(`${label} is not bound to its provider identifier.`);
}

function normalizeDuffelInstant(
  value: FlightCanonicalJsonValue | undefined,
  label: string,
  nullable = false,
  allowSubmillisecondTruncation = false,
) {
  if (nullable && value === null) return null;
  const string = asString(value, label);
  const match = string.match(duffelInstantPattern);
  if (match === null) throw new DuffelContractError(`${label} must be a supported exact ISO-8601 instant.`);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText, zone] = match;
  if (fractionText !== undefined && fractionText.length > 3 && !allowSubmillisecondTruncation) {
    throw new DuffelContractError(`${label} exceeds exact millisecond precision.`);
  }
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day
    || calendar.getUTCHours() !== hour || calendar.getUTCMinutes() !== minute || calendar.getUTCSeconds() !== second
  ) throw new DuffelContractError(`${label} is not a real calendar instant.`);
  if (zone !== "Z") {
    const [offsetHours, offsetMinutes] = zone!.slice(1).split(":").map(Number);
    if (offsetHours! > 14 || offsetMinutes! > 59 || (offsetHours === 14 && offsetMinutes !== 0)) {
      throw new DuffelContractError(`${label} has an unsupported UTC offset.`);
    }
  }
  const parseable = fractionText !== undefined && fractionText.length > 3
    ? string.replace(`.${fractionText}`, `.${fractionText.slice(0, 3)}`)
    : string;
  const parsed = Date.parse(parseable.replace(" ", "T"));
  if (!Number.isFinite(parsed)) throw new DuffelContractError(`${label} must be a supported exact ISO-8601 instant.`);
  return new Date(parsed).toISOString();
}

function duffelInstantsCanOccurInOrderAtReportedPrecision(earlier: string, later: string) {
  // Duffel can report related order timestamps at mixed precision: created_at
  // may contain microseconds while synced_at and paid_at are whole-second
  // values. Compare those provider-to-provider lifecycle boundaries at their
  // shared whole-second precision; the exact source bytes remain digest-bound.
  return Math.floor(Date.parse(earlier) / 1_000) <= Math.floor(Date.parse(later) / 1_000);
}

function providerId(value: FlightCanonicalJsonValue | undefined, prefix: string, label: string) {
  const string = asString(value, label);
  if (!providerIdPattern.test(string) || !string.startsWith(`${prefix}_`)) throw new DuffelContractError(`${label} is malformed.`);
  return string;
}

function localAlias(kind: "offer" | "segment", providerValue: string) {
  return `duffel_${kind}_${digestString(`duffel-${kind}-alias-v1`, providerValue).slice(0, 48)}`;
}

function usdMoney(
  amount: FlightCanonicalJsonValue | undefined,
  currency: FlightCanonicalJsonValue | undefined,
  minimumMinor = 1,
): FlightMoney {
  if (currency !== DUFFEL_INITIAL_CURRENCY || typeof amount !== "string") throw new DuffelContractError("Duffel offer currency is outside the approved USD-only profile.");
  const match = amount.match(exactUsdPattern);
  if (match === null) throw new DuffelContractError("Duffel offer amount must have exactly two decimal places.");
  const amountMinor = Number(match[1]) * 100 + Number(match[2]);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < minimumMinor) throw new DuffelContractError("Duffel offer amount is outside safe minor-unit limits.");
  return Object.freeze({ currency: DUFFEL_INITIAL_CURRENCY, amountMinor });
}

function usdMoneyBreakdown(record: Readonly<Record<string, FlightCanonicalJsonValue>>, label: string) {
  const total = usdMoney(record.total_amount, record.total_currency);
  const base = usdMoney(record.base_amount, record.base_currency, 0);
  const taxAmount = requiredField(record, "tax_amount", `${label} tax amount`);
  const taxCurrency = requiredField(record, "tax_currency", `${label} tax currency`);
  if ((taxAmount === null) !== (taxCurrency === null)) {
    throw new DuffelContractError(`${label} tax amount and currency must both be null or both be exact USD values.`);
  }
  const tax = taxAmount === null && taxCurrency === null
    ? null
    : usdMoney(taxAmount, taxCurrency, 0);
  if (total.amountMinor !== base.amountMinor + (tax?.amountMinor ?? 0)) {
    throw new DuffelContractError(`${label} total does not equal its exact base-plus-tax breakdown under the no-services profile.`);
  }
  return { total, base, tax };
}

function exactLocalDateTimeToUtc(localValue: string, timeZone: string, label: string) {
  const match = localValue.match(localDateTimePattern);
  if (match === null) throw new DuffelContractError(`${label} is not an exact local second.`);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(naive);
  if (
    check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day
    || check.getUTCHours() !== hour || check.getUTCMinutes() !== minute || check.getUTCSeconds() !== second
  ) throw new DuffelContractError(`${label} is not a real local calendar time.`);
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    throw new DuffelContractError(`${label} has an unsupported IANA time zone.`);
  }
  const matches: number[] = [];
  for (let offsetMinutes = -840; offsetMinutes <= 840; offsetMinutes += 15) {
    const candidate = naive - offsetMinutes * 60_000;
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(candidate)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
    );
    if (
      Number(parts.year) === year && Number(parts.month) === month && Number(parts.day) === day
      && Number(parts.hour) === hour && Number(parts.minute) === minute && Number(parts.second) === second
    ) matches.push(candidate);
  }
  if (matches.length !== 1) throw new DuffelContractError(`${label} is nonexistent or ambiguous in its IANA time zone.`);
  return new Date(matches[0]!).toISOString();
}

function exactIsoDurationSeconds(value: FlightCanonicalJsonValue | undefined, label: string) {
  const text = asString(value, label);
  const match = text.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (match === null || match.slice(1).every((part) => part === undefined)) {
    throw new DuffelContractError(`${label} is missing or malformed.`);
  }
  const [days, hours, minutes, seconds] = match.slice(1).map((part) => Number(part ?? 0));
  if (hours! > 23 || minutes! > 59 || seconds! > 59) throw new DuffelContractError(`${label} is not normalized.`);
  const total = days! * 86_400 + hours! * 3_600 + minutes! * 60 + seconds!;
  if (!Number.isSafeInteger(total) || total < 1) throw new DuffelContractError(`${label} is outside safe limits.`);
  return { text, seconds: total };
}

function buildPlan(input: Omit<DuffelSandboxRequestPlan, "version" | "providerId" | "baseUrl" | "apiVersion" | "requestDigest" | "requiredHeaderNames" | "requiresBearerToken" | "bearerTokenIncluded" | "providerTrafficAuthorized" | "externalRequestMade" | "providerIdempotencyKeyIncluded">): DuffelSandboxRequestPlan {
  const requiredHeaderNames = input.body === null ? requiredHeaderNamesWithoutBody : requiredHeaderNamesWithBody;
  const digestPayload = {
    version: "duffel-sandbox-request-plan-v1" as const,
    providerId: DUFFEL_SANDBOX_PROVIDER_ID,
    operation: input.operation,
    method: input.method,
    baseUrl: DUFFEL_API_BASE_URL,
    path: input.path,
    query: input.query,
    apiVersion: DUFFEL_API_VERSION,
    body: input.body,
    minimumTimeoutMs: input.minimumTimeoutMs,
    requiredHeaderNames,
  } satisfies FlightCanonicalJsonValue;
  const plan = deepFreeze({
    ...digestPayload,
    requestDigest: sha256FlightEvidence(digestPayload),
    requiresBearerToken: true as const,
    bearerTokenIncluded: false as const,
    providerTrafficAuthorized: false as const,
    externalRequestMade: false as const,
    providerIdempotencyKeyIncluded: false as const,
  });
  if (plan.operation !== "create_order") duffelSandboxRequestPlans.add(plan);
  return plan;
}

/** A future server transport may dispatch only exact plans minted by this module. */
export function isDuffelSandboxRequestPlan(value: unknown): value is DuffelSandboxRequestPlan {
  return value !== null && typeof value === "object" && duffelSandboxRequestPlans.has(value);
}

/** Full order plans are process-local capabilities and must be rebuilt after serialization. */
export function isDuffelSandboxOrderCreatePlan(value: unknown): value is DuffelSandboxOrderCreatePlan {
  return value !== null && typeof value === "object" && duffelSandboxOrderCreatePlans.has(value);
}

export function buildDuffelSandboxOfferRequestPlan(search: FlightCommerceSearchRequest): DuffelSandboxRequestPlan {
  const exactSearch = snapshotFlightSearch(search);
  const validation = validateFlightCommerceSearchRequest(exactSearch);
  if (!validation.valid) throw new DuffelContractError(validation.errors.join(" "));
  if (exactSearch.passengers.children !== 0 || exactSearch.passengers.infantsInSeat !== 0 || exactSearch.passengers.infantsOnLap !== 0) {
    throw new DuffelContractError("Duffel searches for travelers under 18 require exact ages; counts cannot be converted into invented ages.");
  }
  const slices: FlightCanonicalJsonValue[] = [{
    origin: exactSearch.origin,
    destination: exactSearch.destination,
    departure_date: exactSearch.departureDate,
  }];
  if (exactSearch.returnDate !== null) slices.push({
    origin: exactSearch.destination,
    destination: exactSearch.origin,
    departure_date: exactSearch.returnDate,
  });
  const body: FlightCanonicalJsonValue = {
    data: {
      slices,
      passengers: Array.from({ length: exactSearch.passengers.adults }, () => ({ type: "adult" })),
      cabin_class: exactSearch.cabin,
      max_connections: 1,
      include_split_ticket: false,
    },
  };
  return buildPlan({
    operation: "create_offer_request",
    method: "POST",
    path: "/air/offer_requests",
    query: { return_offers: true, supplier_timeout: DUFFEL_SEARCH_SUPPLIER_TIMEOUT_MS, view: "offers" },
    body,
    minimumTimeoutMs: 70_000,
  });
}

export function buildDuffelSandboxOfferRetrievalPlan(
  evidence: DuffelSanitizedOfferEvidence | DuffelRefreshedOfferEvidence,
): DuffelSandboxRequestPlan {
  assertProjectedOfferEvidence(evidence, "Duffel offer evidence");
  return buildPlan({
    operation: "retrieve_offer",
    method: "GET",
    path: `/air/offers/${evidence.providerOfferId}`,
    query: { return_available_services: false },
    body: null,
    minimumTimeoutMs: 30_000,
  });
}

export function buildDuffelSandboxOrderListByOfferPlan(evidence: DuffelRefreshedOfferEvidence): DuffelSandboxRequestPlan {
  if (!refreshedDuffelOfferEvidence.has(evidence as object)) {
    throw new DuffelContractError("Duffel order reconciliation requires exact post-reprice offer evidence.");
  }
  assertProjectedOfferEvidence(evidence, "Duffel refreshed offer evidence");
  return buildPlan({
    operation: "list_orders_by_offer",
    method: "GET",
    path: "/air/orders",
    query: { offer_id: evidence.providerOfferId, limit: 50 },
    body: null,
    minimumTimeoutMs: 30_000,
  });
}

function exactOrderMoney(value: FlightMoney, label: string) {
  const money = snapshotCanonicalInput(value, label) as FlightMoney;
  assertExactInputKeys(money as unknown as Readonly<Record<string, unknown>>, label, ["amountMinor", "currency"]);
  if (money.currency !== DUFFEL_INITIAL_CURRENCY || !Number.isSafeInteger(money.amountMinor) || money.amountMinor < 0) {
    throw new DuffelContractError(`${label} is outside the exact USD minor-unit profile.`);
  }
  return money;
}

function usdMinorUnitsToDuffelAmount(value: FlightMoney) {
  const whole = Math.floor(value.amountMinor / 100);
  return `${whole}.${String(value.amountMinor % 100).padStart(2, "0")}`;
}

function exactAdultBirthDate(value: string, departureDate: string, label: string) {
  const birthMatch = value.match(exactLocalDatePattern);
  const departureMatch = departureDate.match(exactLocalDatePattern);
  if (birthMatch === null || departureMatch === null) throw new DuffelContractError(`${label} is malformed.`);
  const birth = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(birth.getTime()) || birth.toISOString().slice(0, 10) !== value) {
    throw new DuffelContractError(`${label} is not a real calendar date.`);
  }
  const birthYear = Number(birthMatch[1]);
  const birthMonth = Number(birthMatch[2]);
  const birthDay = Number(birthMatch[3]);
  const departureYear = Number(departureMatch[1]);
  const departureMonth = Number(departureMatch[2]);
  const departureDay = Number(departureMatch[3]);
  let age = departureYear - birthYear;
  if (departureMonth < birthMonth || (departureMonth === birthMonth && departureDay < birthDay)) age -= 1;
  if (age < 18 || age > 120) throw new DuffelContractError(`${label} does not match the exact adult-only search profile.`);
  return value;
}

function exactTravelerName(value: string, label: string) {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 20
    || value.trim() !== value
    || /[ÆæÞð]/u.test(value)
    || !/^[A-Za-zÀ-ÖØ-öø-ÿ]+(?:[ '-][A-Za-zÀ-ÖØ-öø-ÿ]+)*$/u.test(value)
  ) throw new DuffelContractError(`${label} is malformed.`);
  return value;
}

function projectDuffelSandboxOrderTravelerPii(input: Readonly<{
  scope: DuffelOfferEvidenceScope;
  departureDate: string;
  traveler: DuffelSandboxOrderTravelerPiiFields;
}>, label: string) {
  const exactInput = snapshotCanonicalInput(input, label) as typeof input;
  assertExactInputKeys(exactInput as unknown as Readonly<Record<string, unknown>>, label, [
    "departureDate", "scope", "traveler",
  ]);
  const scope = snapshotOfferEvidenceScope(exactInput.scope, `${label} scope`);
  const traveler = exactInput.traveler;
  assertExactInputKeys(traveler as unknown as Readonly<Record<string, unknown>>, `${label} traveler`, [
    "bornOn", "email", "familyName", "gender", "givenName", "phoneNumber", "providerPassengerId", "title", "travelerRef",
  ]);
  const providerPassengerId = providerId(traveler.providerPassengerId, "pas", `${label} passenger ID`);
  if (!localTravelerRefPattern.test(traveler.travelerRef)) {
    throw new DuffelContractError(`${label} traveler reference is malformed.`);
  }
  if (!["mr", "mrs", "ms", "miss", "dr"].includes(traveler.title) || !["m", "f"].includes(traveler.gender)) {
    throw new DuffelContractError(`${label} title or gender is outside the narrow sandbox profile.`);
  }
  if (
    typeof traveler.email !== "string"
    || traveler.email.length > 254
    || !conservativeEmailPattern.test(traveler.email)
    || typeof traveler.phoneNumber !== "string"
    || !e164PhonePattern.test(traveler.phoneNumber)
  ) throw new DuffelContractError(`${label} contact evidence is malformed.`);
  const givenName = exactTravelerName(traveler.givenName, `${label} given name`);
  const familyName = exactTravelerName(traveler.familyName, `${label} family name`);
  const bornOn = exactAdultBirthDate(traveler.bornOn, exactInput.departureDate, `${label} birth date`);
  return deepFreeze({
    version: "duffel-order-traveler-pii-payload-v1" as const,
    scope,
    departureDate: exactInput.departureDate,
    travelerRef: traveler.travelerRef,
    providerPassengerIdDigest: digestString("duffel-passenger-id-v1", providerPassengerId),
    title: traveler.title,
    gender: traveler.gender,
    givenName,
    familyName,
    bornOn,
    email: traveler.email,
    phoneNumber: traveler.phoneNumber,
  });
}

/**
 * Exact synthetic-fixture integrity digest. It is not anonymous, keyed, or a
 * substitute for an authenticated PII repository receipt.
 */
export function digestDuffelSandboxOrderTravelerPii(input: Readonly<{
  scope: DuffelOfferEvidenceScope;
  departureDate: string;
  traveler: DuffelSandboxOrderTravelerPiiFields;
}>) {
  return sha256FlightEvidence(
    projectDuffelSandboxOrderTravelerPii(input, "Duffel order-create traveler PII") as unknown as FlightCanonicalJsonValue,
  );
}

function snapshotOrderCreateAuthorityClaims(value: DuffelSandboxOrderCreateAuthorityClaims) {
  const claims = snapshotCanonicalInput(value, "Duffel order-create authority claims") as DuffelSandboxOrderCreateAuthorityClaims;
  assertExactInputKeys(claims as unknown as Readonly<Record<string, unknown>>, "Duffel order-create authority claims", [
    "acceptedTermsDigest", "localOfferId", "offerEvidenceReceiptDigest", "scope", "settlementAuthorityReceiptDigest",
    "settlementBindingDigest", "termsAcceptanceReceiptDigest", "travelerAuthorities", "version",
  ]);
  if (
    claims.version !== "duffel-sandbox-order-create-authority-claims-v1"
    || !isFlightStableToken(claims.localOfferId)
    || !sha256Pattern.test(claims.offerEvidenceReceiptDigest)
    || !sha256Pattern.test(claims.acceptedTermsDigest)
    || !sha256Pattern.test(claims.termsAcceptanceReceiptDigest)
    || !sha256Pattern.test(claims.settlementBindingDigest)
    || !sha256Pattern.test(claims.settlementAuthorityReceiptDigest)
  ) throw new DuffelContractError("Duffel order-create authority claims are malformed.");
  snapshotOfferEvidenceScope(claims.scope, "Duffel order-create authority scope");
  if (claims.travelerAuthorities.length < 1 || claims.travelerAuthorities.length > 9) {
    throw new DuffelContractError("Duffel order-create authority traveler count is outside the sandbox profile.");
  }
  const travelerRefs = new Set<string>();
  const piiRecordDigests = new Set<string>();
  const providerPassengerIdDigests = new Set<string>();
  for (const [index, traveler] of claims.travelerAuthorities.entries()) {
    assertExactInputKeys(traveler as unknown as Readonly<Record<string, unknown>>, `Duffel order-create authority traveler ${index + 1}`, [
      "piiAuthorityReceiptDigest", "piiRecordDigest", "providerPassengerIdDigest", "travelerRef",
    ]);
    if (
      !localTravelerRefPattern.test(traveler.travelerRef)
      || !sha256Pattern.test(traveler.piiRecordDigest)
      || !sha256Pattern.test(traveler.providerPassengerIdDigest)
      || !sha256Pattern.test(traveler.piiAuthorityReceiptDigest)
      || travelerRefs.has(traveler.travelerRef)
      || piiRecordDigests.has(traveler.piiRecordDigest)
      || providerPassengerIdDigests.has(traveler.providerPassengerIdDigest)
    ) throw new DuffelContractError("Duffel order-create authority traveler bindings are malformed or duplicated.");
    travelerRefs.add(traveler.travelerRef);
    piiRecordDigests.add(traveler.piiRecordDigest);
    providerPassengerIdDigests.add(traveler.providerPassengerIdDigest);
  }
  return claims;
}

export async function verifyDuffelSandboxOrderCreateAuthority(
  claimsInput: DuffelSandboxOrderCreateAuthorityClaims,
  verifier: DuffelSandboxOrderCreateAuthorityVerifier,
): Promise<DuffelVerifiedSandboxOrderCreateAuthority> {
  if (verifier === null || typeof verifier !== "object") {
    throw new DuffelContractError("Duffel order-create authority requires a trusted verifier.");
  }
  const readTrustedTime = captureTrustedMethod<() => string>(verifier, "readTrustedTime", "Duffel order-create authority verifier");
  const verifyOrderCreateAuthority = captureTrustedMethod<DuffelSandboxOrderCreateAuthorityVerifier["verifyOrderCreateAuthority"]>(
    verifier,
    "verifyOrderCreateAuthority",
    "Duffel order-create authority verifier",
  );
  const claims = snapshotOrderCreateAuthorityClaims(claimsInput);
  const evaluatedAt = normalizeDuffelInstant(readTrustedTime(), "Duffel order-create authority trusted time")!;
  const canonicalClaims = canonicalFlightJson(claims as unknown as FlightCanonicalJsonValue);
  const claimsDigest = sha256FlightEvidence(claims as unknown as FlightCanonicalJsonValue);
  const result = snapshotCanonicalInput(await verifyOrderCreateAuthority({
    claims,
    canonicalClaimsPayload: utf8Encoder.encode(canonicalClaims),
    evaluatedAt,
  }), "Duffel order-create authority verification result") as DuffelSandboxOrderCreateAuthorityVerificationResult;
  if (result.decision !== "verified") {
    assertExactInputKeys(result as unknown as Readonly<Record<string, unknown>>, "Duffel order-create authority verification result", ["decision"]);
    throw new DuffelContractError("Duffel order-create authority was not authenticated.");
  }
  assertExactInputKeys(result as unknown as Readonly<Record<string, unknown>>, "Duffel order-create authority verification result", [
    "authorityReceiptDigest", "claimsDigest", "decision",
  ]);
  if (result.claimsDigest !== claimsDigest || !sha256Pattern.test(result.authorityReceiptDigest)) {
    throw new DuffelContractError("Duffel order-create authority verifier did not bind the exact claims.");
  }
  const verified = deepFreeze({
    version: "duffel-verified-sandbox-order-create-authority-v1" as const,
    claims,
    verifiedAt: evaluatedAt,
    claimsDigest,
    authorityReceiptDigest: result.authorityReceiptDigest,
  });
  verifiedDuffelOrderCreateAuthorities.add(verified);
  return verified;
}

export function isDuffelVerifiedSandboxOrderCreateAuthority(
  value: unknown,
): value is DuffelVerifiedSandboxOrderCreateAuthority {
  return value !== null && typeof value === "object" && verifiedDuffelOrderCreateAuthorities.has(value);
}

/**
 * Builds an offline-only instant-order plan for the current adult, USD,
 * provider-balance profile. It never reads a credential or sends a request.
 * Passenger data must be synthetic until a separate server-only privacy gate.
 */
export function buildDuffelSandboxOrderCreatePlan(input: Readonly<{
  offer: DuffelRehydratedOfferEvidence;
  authority: DuffelVerifiedSandboxOrderCreateAuthority;
  total: FlightMoney;
  travelers: readonly DuffelSandboxAdultOrderTraveler[];
}>): DuffelSandboxOrderCreatePlan {
  const offerReference = dataPropertyReference(input, "offer", "Duffel order-create plan input") as DuffelRehydratedOfferEvidence;
  const authorityReference = dataPropertyReference(input, "authority", "Duffel order-create plan input") as DuffelVerifiedSandboxOrderCreateAuthority;
  if (
    !rehydratedDuffelOfferEvidence.has(offerReference as object)
    || offerReference.stage !== "refreshed"
    || offerReference.evidence.version !== "duffel-refreshed-offer-v1"
  ) {
    throw new DuffelContractError("Duffel order creation requires authenticated, rehydrated post-reprice offer evidence.");
  }
  if (!verifiedDuffelOrderCreateAuthorities.has(authorityReference as object)) {
    throw new DuffelContractError("Duffel order creation requires authenticated authority evidence.");
  }
  const exactInput = snapshotCanonicalInput(input, "Duffel order-create plan input") as typeof input;
  assertExactInputKeys(exactInput as unknown as Readonly<Record<string, unknown>>, "Duffel order-create plan input", [
    "authority", "offer", "total", "travelers",
  ]);
  const expectedOffer = offerReference.evidence;
  assertProjectedOfferEvidence(expectedOffer, "Duffel refreshed order-create offer evidence");
  const search = snapshotFlightSearch(offerReference.search);
  const validation = validateFlightCommerceSearchRequest(search);
  if (
    !validation.valid
    || search.passengers.children !== 0
    || search.passengers.infantsInSeat !== 0
    || search.passengers.infantsOnLap !== 0
    || expectedOffer.requestDigest !== searchRequestDigest(search)
  ) throw new DuffelContractError("Duffel order-create search does not match the exact adult-only offer request.");
  if (expectedOffer.passengerIdentityDocumentsRequired) {
    throw new DuffelContractError("Duffel order creation refuses offers that require passenger identity documents until that evidence path is approved.");
  }
  const authority = authorityReference;
  if (
    canonicalFlightJson(authority.claims.scope as unknown as FlightCanonicalJsonValue)
      !== canonicalFlightJson(offerReference.scope as unknown as FlightCanonicalJsonValue)
    || authority.claims.offerEvidenceReceiptDigest !== offerReference.receiptDigest
    || authority.claims.localOfferId !== offerReference.snapshot.offerId
    || authority.claims.acceptedTermsDigest !== expectedOffer.termsDigest
  ) throw new DuffelContractError("Duffel order-create authority is bound to another scope, offer, or accepted terms receipt.");
  if (
    Date.parse(authority.verifiedAt) < Date.parse(expectedOffer.refreshedAt)
    || Date.parse(authority.verifiedAt) >= Date.parse(expectedOffer.expiresAt)
  ) {
    throw new DuffelContractError("Duffel order-create authority was verified outside the refreshed offer validity window.");
  }
  const total = exactOrderMoney(exactInput.total, "Duffel order-create total");
  if (canonicalFlightJson(total as unknown as FlightCanonicalJsonValue) !== canonicalFlightJson(expectedOffer.total as unknown as FlightCanonicalJsonValue)) {
    throw new DuffelContractError("Duffel order-create total does not match the exact refreshed offer.");
  }
  if (exactInput.travelers.length !== search.passengers.adults || exactInput.travelers.length < 1 || exactInput.travelers.length > 9) {
    throw new DuffelContractError("Duffel order-create travelers do not match the exact offer passenger count.");
  }
  const travelerRefs = new Set<string>();
  const piiRecordDigests = new Set<string>();
  const providerPassengerIds = new Set<string>();
  const travelerBindings: FlightCanonicalJsonValue[] = [];
  const passengers: FlightCanonicalJsonValue[] = exactInput.travelers.map((traveler, index) => {
    assertExactInputKeys(traveler as unknown as Readonly<Record<string, unknown>>, `Duffel order-create traveler ${index + 1}`, [
      "bornOn", "email", "familyName", "gender", "givenName", "phoneNumber", "piiRecordDigest", "providerPassengerId", "title", "travelerRef",
    ]);
    const providerPassengerId = providerId(traveler.providerPassengerId, "pas", `Duffel order-create traveler ${index + 1} passenger ID`);
    if (
      !localTravelerRefPattern.test(traveler.travelerRef)
      || !sha256Pattern.test(traveler.piiRecordDigest)
      || travelerRefs.has(traveler.travelerRef)
      || piiRecordDigests.has(traveler.piiRecordDigest)
      || providerPassengerIds.has(providerPassengerId)
    ) throw new DuffelContractError("Duffel order-create traveler bindings are malformed or duplicated.");
    travelerRefs.add(traveler.travelerRef);
    piiRecordDigests.add(traveler.piiRecordDigest);
    providerPassengerIds.add(providerPassengerId);
    if (!["mr", "mrs", "ms", "miss", "dr"].includes(traveler.title) || !["m", "f"].includes(traveler.gender)) {
      throw new DuffelContractError(`Duffel order-create traveler ${index + 1} title or gender is outside the narrow sandbox profile.`);
    }
    if (
      typeof traveler.email !== "string"
      || traveler.email.length > 254
      || !conservativeEmailPattern.test(traveler.email)
      || typeof traveler.phoneNumber !== "string"
      || !e164PhonePattern.test(traveler.phoneNumber)
    ) throw new DuffelContractError(`Duffel order-create traveler ${index + 1} contact evidence is malformed.`);
    const givenName = exactTravelerName(traveler.givenName, `Duffel order-create traveler ${index + 1} given name`);
    const familyName = exactTravelerName(traveler.familyName, `Duffel order-create traveler ${index + 1} family name`);
    const bornOn = exactAdultBirthDate(traveler.bornOn, search.departureDate, `Duffel order-create traveler ${index + 1} birth date`);
    const piiRecordDigest = digestDuffelSandboxOrderTravelerPii({
      scope: offerReference.scope,
      departureDate: search.departureDate,
      traveler: {
        travelerRef: traveler.travelerRef,
        providerPassengerId,
        title: traveler.title,
        gender: traveler.gender,
        givenName,
        familyName,
        bornOn,
        email: traveler.email,
        phoneNumber: traveler.phoneNumber,
      },
    });
    if (traveler.piiRecordDigest !== piiRecordDigest) {
      throw new DuffelContractError(`Duffel order-create traveler ${index + 1} PII record digest does not cover the exact passenger payload.`);
    }
    travelerBindings.push({
      traveler_ref: traveler.travelerRef,
      pii_record_digest: piiRecordDigest,
      provider_passenger_id_digest: digestString("duffel-passenger-id-v1", providerPassengerId),
    });
    return {
      id: providerPassengerId,
      title: traveler.title,
      gender: traveler.gender,
      given_name: givenName,
      family_name: familyName,
      born_on: bornOn,
      email: traveler.email,
      phone_number: traveler.phoneNumber,
    };
  });
  const suppliedPassengerDigests = [...providerPassengerIds]
    .map((id) => digestString("duffel-passenger-id-v1", id))
    .sort();
  if (canonicalFlightJson(suppliedPassengerDigests) !== canonicalFlightJson(expectedOffer.providerPassengerIdDigests)) {
    throw new DuffelContractError("Duffel order-create travelers are bound to another offer request.");
  }
  const expectedTravelerAuthorities = travelerBindings.map((binding, index) => ({
    travelerRef: (binding as { traveler_ref: string }).traveler_ref,
    piiRecordDigest: (binding as { pii_record_digest: string }).pii_record_digest,
    providerPassengerIdDigest: (binding as { provider_passenger_id_digest: string }).provider_passenger_id_digest,
    piiAuthorityReceiptDigest: authority.claims.travelerAuthorities[index]?.piiAuthorityReceiptDigest ?? "",
  }));
  if (canonicalFlightJson(expectedTravelerAuthorities) !== canonicalFlightJson(authority.claims.travelerAuthorities)) {
    throw new DuffelContractError("Duffel order-create passenger data is not covered by the authenticated authority receipts.");
  }
  const plan = buildPlan({
    operation: "create_order",
    method: "POST",
    path: "/air/orders",
    query: {},
    body: {
      data: {
        type: "instant",
        selected_offers: [expectedOffer.providerOfferId],
        payments: [{
          type: "balance",
          currency: total.currency,
          amount: usdMinorUnitsToDuffelAmount(total),
        }],
        passengers,
      },
    },
    minimumTimeoutMs: DUFFEL_ORDER_MINIMUM_TIMEOUT_MS,
  });
  const travelerBindingsDigest = sha256FlightEvidence({
    version: "duffel-order-traveler-bindings-v1",
    travelers: travelerBindings,
  });
  const receiptPayload = {
    version: "duffel-sandbox-order-create-plan-v1" as const,
    scope: offerReference.scope,
    offerEvidenceReceiptDigest: offerReference.receiptDigest,
    requestPlanDigest: plan.requestDigest,
    acceptedTermsDigest: authority.claims.acceptedTermsDigest,
    termsAcceptanceReceiptDigest: authority.claims.termsAcceptanceReceiptDigest,
    offerRefreshReceiptDigest: expectedOffer.refreshReceiptDigest,
    travelerBindingsDigest,
    settlementBindingDigest: authority.claims.settlementBindingDigest,
    settlementAuthorityReceiptDigest: authority.claims.settlementAuthorityReceiptDigest,
    authorityClaimsDigest: authority.claimsDigest,
    authorityReceiptDigest: authority.authorityReceiptDigest,
    verifiedAt: authority.verifiedAt,
    dispatchNotAfter: expectedOffer.expiresAt,
  };
  const orderPlan = deepFreeze({
    version: receiptPayload.version,
    plan,
    scope: receiptPayload.scope,
    offerEvidenceReceiptDigest: receiptPayload.offerEvidenceReceiptDigest,
    acceptedTermsDigest: receiptPayload.acceptedTermsDigest,
    termsAcceptanceReceiptDigest: receiptPayload.termsAcceptanceReceiptDigest,
    offerRefreshReceiptDigest: receiptPayload.offerRefreshReceiptDigest,
    travelerBindingsDigest,
    settlementBindingDigest: receiptPayload.settlementBindingDigest,
    settlementAuthorityReceiptDigest: receiptPayload.settlementAuthorityReceiptDigest,
    authorityClaimsDigest: receiptPayload.authorityClaimsDigest,
    authorityReceiptDigest: receiptPayload.authorityReceiptDigest,
    verifiedAt: receiptPayload.verifiedAt,
    dispatchNotAfter: receiptPayload.dispatchNotAfter,
    bridgeReceiptDigest: sha256FlightEvidence(receiptPayload),
    providerTrafficAuthorized: false as const,
    bookingAuthorized: false as const,
    paymentAuthorized: false as const,
    externalRequestMade: false as const,
  });
  duffelSandboxOrderCreatePlans.add(orderPlan);
  return orderPlan;
}

export function sanitizeDuffelSandboxOrdersByOfferResponse(
  rawBody: Uint8Array,
  input: Readonly<{ expectedOffer: DuffelRefreshedOfferEvidence; retrievedAt: string }>,
): DuffelOrderListReconciliationEvidence {
  const rawBodySnapshot = snapshotDuffelBytes(rawBody, "Duffel order-list response body");
  const expectedOfferReference = dataPropertyReference(input, "expectedOffer", "Duffel order-list projection input") as DuffelRefreshedOfferEvidence;
  const exactInput = snapshotCanonicalInput(input, "Duffel order-list projection input") as typeof input;
  assertExactInputKeys(exactInput as unknown as Readonly<Record<string, unknown>>, "Duffel order-list projection input", [
    "expectedOffer", "retrievedAt",
  ]);
  if (!refreshedDuffelOfferEvidence.has(expectedOfferReference as object)) {
    throw new DuffelContractError("Duffel order-list reconciliation requires exact post-reprice offer evidence.");
  }
  const normalizedRetrievedAt = normalizeDuffelInstant(exactInput.retrievedAt, "Duffel order-list retrieval time")!;
  if (Date.parse(normalizedRetrievedAt) < Date.parse(exactInput.expectedOffer.refreshedAt)) {
    throw new DuffelContractError("Duffel order-list retrieval cannot precede the exact offer refresh receipt.");
  }
  const parsed = asRecord(parseDuffelJsonBodySnapshot(rawBodySnapshot), "Duffel order-list response");
  const metadata = asRecord(parsed.meta ?? null, "Duffel order-list pagination metadata");
  if (!Object.prototype.hasOwnProperty.call(metadata, "before") || !Object.prototype.hasOwnProperty.call(metadata, "after")) {
    throw new DuffelContractError("Duffel order-list pagination metadata is incomplete.");
  }
  const limit = asSafeInteger(metadata.limit, "Duffel order-list pagination limit", 1, 100);
  if ((metadata.before ?? null) !== null || (metadata.after ?? null) !== null) {
    throw new DuffelContractError("Duffel order-list response is paginated and cannot establish exact reconciliation cardinality.");
  }
  const orders = asArray(parsed.data, "Duffel order-list data");
  if (orders.length > limit) throw new DuffelContractError("Duffel order-list response exceeds its declared pagination limit.");
  const providerOrderIds = orders.map((rawOrder, index) => {
    const order = asRecord(rawOrder, `Duffel order-list item ${index + 1}`);
    if (order.live_mode !== false) throw new DuffelContractError("Duffel sandbox order-list items must explicitly report live_mode false.");
    const selectedOfferId = providerId(order.offer_id, "off", `Duffel order-list item ${index + 1} offer ID`);
    if (digestString("duffel-provider-offer-id-v1", selectedOfferId) !== exactInput.expectedOffer.providerOfferIdDigest) {
      throw new DuffelContractError("Duffel order-list item is bound to another exact refreshed offer.");
    }
    return providerId(order.id, "ord", `Duffel order-list item ${index + 1} order ID`);
  });
  if (new Set(providerOrderIds).size !== providerOrderIds.length) {
    throw new DuffelContractError("Duffel order-list response contains duplicate provider order IDs.");
  }
  const decision = providerOrderIds.length === 0
    ? "order_absent"
    : providerOrderIds.length === 1
      ? "single_order_requires_full_validation"
      : "multiple_orders_manual_review";
  return deepFreeze({
    version: "duffel-order-list-reconciliation-v1" as const,
    providerOfferIdDigest: exactInput.expectedOffer.providerOfferIdDigest,
    offerRefreshReceiptDigest: exactInput.expectedOffer.refreshReceiptDigest,
    requestPlanDigest: buildDuffelSandboxOrderListByOfferPlan(expectedOfferReference).requestDigest,
    retrievedAt: normalizedRetrievedAt,
    rawBodyDigest: digestBytes(rawBodySnapshot),
    paginationComplete: true as const,
    orderCount: providerOrderIds.length,
    providerOrderId: providerOrderIds.length === 1 ? providerOrderIds[0]! : null,
    providerOrderIdDigests: providerOrderIds.map((id) => digestString("duffel-provider-order-id-v1", id)).sort(),
    decision,
    directMutationAuthorized: false as const,
  });
}

type ProjectedDuffelOffer = Readonly<{
  evidence: DuffelSanitizedOfferEvidence;
  snapshot: FlightOfferSnapshot;
}>;

function searchRequestDigest(search: FlightCommerceSearchRequest) {
  return buildFlightProviderOperationRequestBinding({
    providerId: DUFFEL_SANDBOX_PROVIDER_ID,
    mode: "provider_sandbox",
    executionBinding: null,
    paymentExecutionBinding: null,
  }, "search", search).requestDigest;
}

function responseLocationCode(value: FlightCanonicalJsonValue | undefined, label: string) {
  if (typeof value === "string") return asString(value, label, airportPattern);
  return asString(asRecord(value ?? null, label).iata_code, `${label} IATA code`, airportPattern);
}

function assertOfferRequestEcho(data: Readonly<Record<string, FlightCanonicalJsonValue>>, search: FlightCommerceSearchRequest) {
  if (data.cabin_class !== search.cabin) throw new DuffelContractError("Duffel offer-request cabin changed from the exact request plan.");
  const passengers = asArray(data.passengers, "Duffel offer-request passengers");
  if (passengers.length !== search.passengers.adults) throw new DuffelContractError("Duffel offer-request passenger count changed from the exact request plan.");
  const providerPassengerIds = passengers.map((passenger, index) => {
    const record = asRecord(passenger, `Duffel offer-request passenger ${index + 1}`);
    if (record.type !== "adult") throw new DuffelContractError("Duffel offer-request passenger semantics changed from the adult-only request plan.");
    if (Object.prototype.hasOwnProperty.call(record, "fare_type") && record.fare_type !== null) {
      throw new DuffelContractError("Anonymous Duffel offer requests refuse passenger fare-type evidence that was not requested.");
    }
    return providerId(record.id, "pas", `Duffel offer-request passenger ${index + 1} ID`);
  });
  if (new Set(providerPassengerIds).size !== providerPassengerIds.length) throw new DuffelContractError("Duffel offer-request passenger IDs are duplicated.");
  const slices = asArray(data.slices, "Duffel offer-request slices");
  const expected = [
    { origin: search.origin, destination: search.destination, departureDate: search.departureDate },
    ...(search.returnDate === null ? [] : [{ origin: search.destination, destination: search.origin, departureDate: search.returnDate }]),
  ];
  if (slices.length !== expected.length) throw new DuffelContractError("Duffel offer-request slice count changed from the exact request plan.");
  slices.forEach((slice, index) => {
    const record = asRecord(slice, `Duffel offer-request slice ${index + 1}`);
    const wanted = expected[index]!;
    if (
      responseLocationCode(record.origin, `Duffel offer-request slice ${index + 1} origin`) !== wanted.origin
      || responseLocationCode(record.destination, `Duffel offer-request slice ${index + 1} destination`) !== wanted.destination
      || record.departure_date !== wanted.departureDate
    ) throw new DuffelContractError("Duffel offer-request route or date changed from the exact request plan.");
  });
  return providerPassengerIds.map((id) => digestString("duffel-passenger-id-v1", id)).sort();
}

function projectCarrier(value: FlightCanonicalJsonValue | undefined, label: string) {
  const record = asRecord(value ?? null, label);
  const name = asString(record.name, `${label} name`);
  if (name.trim() !== name || name.length < 2 || name.length > 120) throw new DuffelContractError(`${label} name is malformed.`);
  const iataCode = asString(record.iata_code, `${label} IATA code`, carrierPattern);
  const url = requiredField(record, "conditions_of_carriage_url", `${label} conditions-of-carriage URL`);
  if (url !== null) {
    const text = asString(url, `${label} conditions-of-carriage URL`);
    try {
      const parsed = new URL(text);
      if (parsed.protocol !== "https:") throw new Error();
    } catch {
      throw new DuffelContractError(`${label} conditions-of-carriage URL is malformed.`);
    }
  }
  return { name, iataCode, conditionsOfCarriageUrl: url as string | null };
}

function projectAirport(value: FlightCanonicalJsonValue | undefined, label: string) {
  const record = asRecord(value ?? null, label);
  const iataCode = asString(record.iata_code, `${label} IATA code`, airportPattern);
  const timeZone = asString(record.time_zone, `${label} time zone`);
  if (timeZone.length > 64 || !/^[A-Za-z0-9_+.\-/]+$/.test(timeZone)) throw new DuffelContractError(`${label} time zone is malformed.`);
  return { iataCode, timeZone };
}

function projectStop(value: FlightCanonicalJsonValue, segmentIndex: number, stopIndex: number) {
  const label = `Duffel segment ${segmentIndex + 1} stop ${stopIndex + 1}`;
  const record = asRecord(value, label);
  const stopId = providerId(record.id, "sto", `${label} ID`);
  const airport = projectAirport(record.airport, `${label} airport`);
  const arrivingLocal = asString(record.arriving_at, `${label} arriving_at`, localDateTimePattern);
  const departingLocal = asString(record.departing_at, `${label} departing_at`, localDateTimePattern);
  const arrivesAt = exactLocalDateTimeToUtc(arrivingLocal, airport.timeZone, `${label} arrival`);
  const departsAt = exactLocalDateTimeToUtc(departingLocal, airport.timeZone, `${label} departure`);
  if (Date.parse(departsAt) < Date.parse(arrivesAt)) throw new DuffelContractError(`${label} departs before it arrives.`);
  const duration = exactIsoDurationSeconds(record.duration, `${label} duration`);
  if ((Date.parse(departsAt) - Date.parse(arrivesAt)) / 1000 !== duration.seconds) {
    throw new DuffelContractError(`${label} duration does not match its exact timestamps.`);
  }
  return {
    providerId: stopId,
    phaseIdDigest: digestString("duffel-stop-id-v1", stopId),
    shared: {
      airportIataCode: airport.iataCode,
      arrivesAt,
      departsAt,
      duration: duration.text,
    },
  };
}

function projectFareCondition(value: FlightCanonicalJsonValue | undefined, label: string) {
  if (value === null) return null;
  const condition = asRecord(value ?? null, label);
  assertExactInputKeys(condition as unknown as Readonly<Record<string, unknown>>, label, [
    "allowed", "penalty_amount", "penalty_currency",
  ]);
  const allowed = asBoolean(requiredField(condition, "allowed", `${label} allowed`), `${label} allowed`);
  const penaltyAmount = requiredField(condition, "penalty_amount", `${label} penalty amount`);
  const penaltyCurrency = requiredField(condition, "penalty_currency", `${label} penalty currency`);
  if ((penaltyAmount === null) !== (penaltyCurrency === null)) {
    throw new DuffelContractError(`${label} penalty amount and currency must both be null or both be present.`);
  }
  if (!allowed && (penaltyAmount !== null || penaltyCurrency !== null)) {
    throw new DuffelContractError(`${label} cannot carry a penalty when the action is not allowed.`);
  }
  const penalty = penaltyAmount === null && penaltyCurrency === null
    ? null
    : usdMoney(penaltyAmount, penaltyCurrency, 0);
  return { allowed, penalty };
}

function projectTopLevelFareConditions(value: FlightCanonicalJsonValue | undefined, label: string) {
  const conditions = asRecord(value ?? null, label);
  assertExactInputKeys(conditions as unknown as Readonly<Record<string, unknown>>, label, [
    "change_before_departure", "refund_before_departure",
  ]);
  return {
    changeBeforeDeparture: projectFareCondition(
      requiredField(conditions, "change_before_departure", `${label} change-before-departure`),
      `${label} change-before-departure`,
    ),
    refundBeforeDeparture: projectFareCondition(
      requiredField(conditions, "refund_before_departure", `${label} refund-before-departure`),
      `${label} refund-before-departure`,
    ),
  };
}

function projectFareBrandName(slice: Readonly<Record<string, FlightCanonicalJsonValue>>, label: string) {
  const fareBrandValue = requiredField(slice, "fare_brand_name", `${label} fare brand`);
  const fareBrandName = fareBrandValue === null ? null : asString(fareBrandValue, `${label} fare brand`);
  if (fareBrandName !== null && (fareBrandName.trim() !== fareBrandName || fareBrandName.length < 1 || fareBrandName.length > 120)) {
    throw new DuffelContractError(`${label} fare brand is malformed.`);
  }
  return fareBrandName;
}

function projectOfferSliceTerms(
  slice: Readonly<Record<string, FlightCanonicalJsonValue>>,
  sliceIndex: number,
  segmentIdentityDigests: readonly string[],
) {
  const label = `Duffel offer slice ${sliceIndex + 1}`;
  const conditionsRecord = asRecord(requiredField(slice, "conditions", `${label} conditions`), `${label} conditions`);
  assertExactInputKeys(conditionsRecord as unknown as Readonly<Record<string, unknown>>, `${label} conditions`, [
    "advance_seat_selection",
    "change_before_departure",
    "priority_boarding",
    "priority_check_in",
  ], ["refund_before_departure"]);
  const refundBeforeDeparturePresent = Object.prototype.hasOwnProperty.call(conditionsRecord, "refund_before_departure");
  const fareConditions = {
    changeBeforeDeparture: projectFareCondition(
      requiredField(conditionsRecord, "change_before_departure", `${label} conditions change-before-departure`),
      `${label} conditions change-before-departure`,
    ),
    refundBeforeDeparture: refundBeforeDeparturePresent
      ? projectFareCondition(conditionsRecord.refund_before_departure, `${label} conditions refund-before-departure`)
      : null,
  };
  const advanceSeatSelection = requiredField(conditionsRecord, "advance_seat_selection", `${label} advance-seat-selection condition`);
  const priorityBoarding = requiredField(conditionsRecord, "priority_boarding", `${label} priority-boarding condition`);
  const priorityCheckIn = requiredField(conditionsRecord, "priority_check_in", `${label} priority-check-in condition`);
  for (const [value, fieldLabel] of [
    [advanceSeatSelection, "advance-seat-selection"],
    [priorityBoarding, "priority-boarding"],
    [priorityCheckIn, "priority-check-in"],
  ] as const) {
    if (value !== null && typeof value !== "boolean") throw new DuffelContractError(`${label} ${fieldLabel} condition is malformed.`);
  }
  const fareBrandName = projectFareBrandName(slice, label);
  const shared = {
    sliceIndex,
    segmentIdentityDigests,
    changeBeforeDeparture: fareConditions.changeBeforeDeparture,
    fareBrandName,
  };
  return {
    sharedDigest: sha256FlightEvidence({ version: "duffel-order-shared-slice-terms-v1", ...shared }),
    materialDigest: sha256FlightEvidence({
      version: "duffel-offer-slice-terms-v1",
      ...shared,
      refundBeforeDeparturePresent,
      refundBeforeDeparture: fareConditions.refundBeforeDeparture,
      advanceSeatSelection,
      priorityBoarding,
      priorityCheckIn,
    }),
  };
}

function projectOrderSliceTerms(
  slice: Readonly<Record<string, FlightCanonicalJsonValue>>,
  sliceIndex: number,
  segmentIdentityDigests: readonly string[],
) {
  const label = `Duffel order slice ${sliceIndex + 1}`;
  const conditions = asRecord(requiredField(slice, "conditions", `${label} conditions`), `${label} conditions`);
  assertExactInputKeys(conditions as unknown as Readonly<Record<string, unknown>>, `${label} conditions`, [
    "change_before_departure",
  ]);
  const changeBeforeDeparture = projectFareCondition(
    requiredField(conditions, "change_before_departure", `${label} change-before-departure`),
    `${label} change-before-departure`,
  );
  const fareBrandName = projectFareBrandName(slice, label);
  return sha256FlightEvidence({
    version: "duffel-order-shared-slice-terms-v1",
    sliceIndex,
    segmentIdentityDigests,
    changeBeforeDeparture,
    fareBrandName,
  });
}

function projectBaggages(
  detail: Readonly<Record<string, FlightCanonicalJsonValue>>,
  label: string,
) {
  const baggageRecords = asArray(requiredField(detail, "baggages", `${label} baggage entitlement evidence`), `${label} baggages`);
  if (baggageRecords.length > 8) throw new DuffelContractError(`${label} baggage entitlement count is outside the offline profile.`);
  const baggages = baggageRecords.map((baggage, baggageIndex) => {
    const record = asRecord(baggage, `${label} baggage ${baggageIndex + 1}`);
    return {
      type: asString(record.type, `${label} baggage ${baggageIndex + 1} type`, /^(?:carry_on|checked)$/),
      quantity: asSafeInteger(record.quantity, `${label} baggage ${baggageIndex + 1} quantity`, 0, 9),
    };
  });
  if (new Set(baggages.map((baggage) => baggage.type)).size !== baggages.length) {
    throw new DuffelContractError(`${label} baggage entitlement type is duplicated.`);
  }
  return [...baggages].sort((left, right) => left.type.localeCompare(right.type));
}

function projectSharedPassengerTerms(
  detail: Readonly<Record<string, FlightCanonicalJsonValue>>,
  label: string,
  passengerId: string,
) {
  const cabin = asString(detail.cabin_class, `${label} cabin`, /^(?:economy|premium_economy|business|first)$/);
  const cabinMarketingName = asString(detail.cabin_class_marketing_name, `${label} cabin marketing name`);
  if (cabinMarketingName.trim() !== cabinMarketingName || cabinMarketingName.length < 1 || cabinMarketingName.length > 120) {
    throw new DuffelContractError(`${label} cabin marketing name is malformed.`);
  }
  return {
    passengerId,
    passengerIdDigest: digestString("duffel-passenger-id-v1", passengerId),
    cabin,
    cabinMarketingName,
    baggages: projectBaggages(detail, label),
  };
}

function projectOfferSegmentPassengerTerms(
  detail: Readonly<Record<string, FlightCanonicalJsonValue>>,
  segmentIndex: number,
  passengerIndex: number,
) {
  const label = `Duffel offer segment ${segmentIndex + 1} passenger ${passengerIndex + 1}`;
  const passengerId = providerId(detail.passenger_id, "pas", `${label} ID`);
  const shared = projectSharedPassengerTerms(detail, label, passengerId);
  const fareBasisValue = requiredField(detail, "fare_basis_code", `${label} fare-basis evidence`);
  const fareBasisCode = fareBasisValue === null
    ? null
    : asString(fareBasisValue, `${label} fare-basis code`, /^[A-Za-z0-9][A-Za-z0-9_./-]{0,63}$/);
  return {
    ...shared,
    fareBasisCode,
  };
}

function projectOrderSegmentPassengerTerms(
  detail: Readonly<Record<string, FlightCanonicalJsonValue>>,
  segmentIndex: number,
  passengerIndex: number,
  segmentPassengerCount: number,
  expectedProviderPassengerIds: readonly string[],
) {
  const label = `Duffel order segment ${segmentIndex + 1} passenger ${passengerIndex + 1}`;
  let passengerId: string;
  if (Object.prototype.hasOwnProperty.call(detail, "passenger_id")) {
    passengerId = providerId(detail.passenger_id, "pas", `${label} ID`);
  } else {
    if (segmentPassengerCount !== 1 || expectedProviderPassengerIds.length !== 1) {
      throw new DuffelContractError("Duffel order segment passengers without IDs cannot be bound exactly in a multi-passenger order.");
    }
    passengerId = expectedProviderPassengerIds[0]!;
  }
  return projectSharedPassengerTerms(detail, label, passengerId);
}

function projectSegmentCore(
  value: FlightCanonicalJsonValue,
  index: number,
  phase: "offer" | "order",
  expectedProviderPassengerIds: readonly string[],
  expectedCabin: FlightCommerceSearchRequest["cabin"],
) {
  const label = `Duffel ${phase} segment ${index + 1}`;
  const record = asRecord(value, label);
  const rawSegmentId = providerId(record.id, "seg", `${label} ID`);
  const marketingCarrier = projectCarrier(record.marketing_carrier, `${label} marketing carrier`);
  const operatingCarrier = projectCarrier(record.operating_carrier, `${label} operating carrier`);
  const origin = projectAirport(record.origin, `${label} origin`);
  const destination = projectAirport(record.destination, `${label} destination`);
  const departingLocal = asString(record.departing_at, `${label} departing_at`, localDateTimePattern);
  const arrivingLocal = asString(record.arriving_at, `${label} arriving_at`, localDateTimePattern);
  const flightNumber = asString(record.marketing_carrier_flight_number, `${label} marketing flight number`, /^[A-Z0-9]{1,4}$/);
  const operatingFlightValue = Object.prototype.hasOwnProperty.call(record, "operating_carrier_flight_number")
    ? record.operating_carrier_flight_number
    : null;
  const operatingFlightNumber = phase === "offer"
    ? asString(operatingFlightValue ?? undefined, `${label} operating flight number`, /^[A-Z0-9]{1,4}$/)
    : operatingFlightValue === null
      ? null
      : asString(operatingFlightValue, `${label} operating flight number`, /^[A-Z0-9]{1,4}$/);
  const duration = exactIsoDurationSeconds(record.duration, `${label} duration`);
  const rawStops = asArray(record.stops, `${label} stops`);
  if (rawStops.length > 4) throw new DuffelContractError(`${label} exceeds the four-stop evidence cap.`);
  const stops = rawStops.map((stop, stopIndex) => projectStop(stop, index, stopIndex));
  const segmentPassengers = asArray(record.passengers, `${label} passengers`);
  const projectedPassengerTerms = segmentPassengers.map((passenger, passengerIndex) => {
    const detail = asRecord(passenger, `${label} passenger ${passengerIndex + 1}`);
    return phase === "offer"
      ? projectOfferSegmentPassengerTerms(detail, index, passengerIndex)
      : projectOrderSegmentPassengerTerms(detail, index, passengerIndex, segmentPassengers.length, expectedProviderPassengerIds);
  });
  const segmentPassengerIds = projectedPassengerTerms.map((item) => item.passengerId);
  if (projectedPassengerTerms.some((item) => item.cabin !== expectedCabin)) {
    throw new DuffelContractError("Duffel segment passenger cabin changed from the exact request plan.");
  }
  if (
    new Set(segmentPassengerIds).size !== segmentPassengerIds.length
    || canonicalFlightJson([...segmentPassengerIds].sort()) !== canonicalFlightJson([...expectedProviderPassengerIds].sort())
  ) throw new DuffelContractError("Duffel segment passenger IDs changed from the enclosing offer.");
  const segmentPassengerIdDigests = segmentPassengerIds.map((id) => digestString("duffel-passenger-id-v1", id)).sort();
  const sharedPassengerTerms = projectedPassengerTerms
    .map((terms) => ({
      passengerIdDigest: terms.passengerIdDigest,
      cabin: terms.cabin,
      cabinMarketingName: terms.cabinMarketingName,
      baggages: terms.baggages,
    }))
    .sort((left, right) => left.passengerIdDigest.localeCompare(right.passengerIdDigest));
  const segmentId = localAlias("segment", rawSegmentId);
  const segment: FlightSegment = {
    segmentId,
    marketingCarrier: marketingCarrier.iataCode,
    marketingFlightNumber: flightNumber,
    origin: origin.iataCode,
    destination: destination.iataCode,
    departsAt: exactLocalDateTimeToUtc(departingLocal, origin.timeZone, `${label} departure`),
    arrivesAt: exactLocalDateTimeToUtc(arrivingLocal, destination.timeZone, `${label} arrival`),
  };
  if ((Date.parse(segment.arrivesAt) - Date.parse(segment.departsAt)) / 1000 !== duration.seconds) {
    throw new DuffelContractError(`${label} duration does not match its exact timestamps.`);
  }
  const disclosure: DuffelOperatingCarrierDisclosure = {
    segmentId,
    operatingCarrierName: operatingCarrier.name,
    operatingCarrierIataCode: operatingCarrier.iataCode,
    marketingCarrierName: marketingCarrier.name,
    marketingCarrierIataCode: marketingCarrier.iataCode,
    operatingConditionsOfCarriageUrl: operatingCarrier.conditionsOfCarriageUrl,
    marketingConditionsOfCarriageUrl: marketingCarrier.conditionsOfCarriageUrl,
  };
  if (new Set(stops.map((stop) => stop.phaseIdDigest)).size !== stops.length) {
    throw new DuffelContractError(`${label} contains duplicate stops.`);
  }
  let priorStopDeparture = Date.parse(segment.departsAt);
  const segmentArrival = Date.parse(segment.arrivesAt);
  for (const stop of stops) {
    const stopArrival = Date.parse(stop.shared.arrivesAt);
    const stopDeparture = Date.parse(stop.shared.departsAt);
    if (stopArrival < priorStopDeparture || stopDeparture > segmentArrival) {
      throw new DuffelContractError(`${label} stop chronology is outside the segment.`);
    }
    priorStopDeparture = stopDeparture;
  }
  const identityDigest = sha256FlightEvidence({
    version: "duffel-segment-identity-v1",
    marketingCarrierIataCode: marketingCarrier.iataCode,
    marketingFlightNumber: flightNumber,
    operatingCarrierIataCode: operatingCarrier.iataCode,
    duration: duration.text,
    origin: origin.iataCode,
    destination: destination.iataCode,
    departsAt: segment.departsAt,
    arrivesAt: segment.arrivesAt,
    stops: stops.map((stop) => stop.shared),
    passengerIdDigests: segmentPassengerIdDigests,
    cabin: expectedCabin,
  });
  const disclosureDigest = sha256FlightEvidence({
    version: "duffel-carrier-disclosure-v1",
    operatingCarrierName: operatingCarrier.name,
    operatingCarrierIataCode: operatingCarrier.iataCode,
    marketingCarrierName: marketingCarrier.name,
    marketingCarrierIataCode: marketingCarrier.iataCode,
    operatingConditionsOfCarriageUrl: operatingCarrier.conditionsOfCarriageUrl,
    marketingConditionsOfCarriageUrl: marketingCarrier.conditionsOfCarriageUrl,
  });
  const orderSharedTermsDigest = sha256FlightEvidence({
    version: "duffel-segment-order-shared-terms-v1",
    identityDigest,
    passengerTerms: sharedPassengerTerms,
  });
  const offerTermsDigest = phase === "offer"
    ? sha256FlightEvidence({
      version: "duffel-segment-offer-terms-v1",
      identityDigest,
      operatingFlightNumber,
      passengerTerms: projectedPassengerTerms.map((terms) => ({
        ...sharedPassengerTerms.find((shared) => shared.passengerIdDigest === terms.passengerIdDigest)!,
        fareBasisCode: (terms as ReturnType<typeof projectOfferSegmentPassengerTerms>).fareBasisCode,
      })).sort((left, right) => left.passengerIdDigest.localeCompare(right.passengerIdDigest)),
    })
    : null;
  const phaseIdentityDigest = sha256FlightEvidence({
    version: "duffel-segment-phase-identity-v1",
    identityDigest,
    segmentIdDigest: digestString("duffel-segment-id-v1", rawSegmentId),
    stopIdDigests: stops.map((stop) => stop.phaseIdDigest),
    operatingFlightNumber,
  });
  return {
    providerSegmentId: rawSegmentId,
    providerStopIds: stops.map((stop) => stop.providerId),
    segment,
    disclosure,
    disclosureDigest,
    departingLocal,
    identityDigest,
    orderSharedTermsDigest,
    offerTermsDigest,
    phaseIdentityDigest,
    operatingFlightNumber,
  };
}

function projectOfferSegment(
  value: FlightCanonicalJsonValue,
  index: number,
  expectedProviderPassengerIds: readonly string[],
  expectedCabin: FlightCommerceSearchRequest["cabin"],
) {
  return projectSegmentCore(value, index, "offer", expectedProviderPassengerIds, expectedCabin);
}

function projectOrderSegment(
  value: FlightCanonicalJsonValue,
  index: number,
  expectedProviderPassengerIds: readonly string[],
  expectedCabin: FlightCommerceSearchRequest["cabin"],
) {
  return projectSegmentCore(value, index, "order", expectedProviderPassengerIds, expectedCabin);
}

function projectOffer(
  rawOffer: FlightCanonicalJsonValue,
  search: FlightCommerceSearchRequest,
  requestDigest: string,
  requestPlanDigest: string,
  offerRequestIdDigest: string,
  expectedOfferRequestPassengerIdDigests: readonly string[],
  projectionPhase: "initial_search" | "refresh",
  retrievedAt: string,
  rawBodyDigest: string,
): ProjectedDuffelOffer {
  const offer = asRecord(rawOffer, "Duffel offer");
  if (offer.live_mode !== false) throw new DuffelContractError("Duffel sandbox offer must explicitly report live_mode false.");
  if (offer.partial !== false) throw new DuffelContractError("Duffel traditional offer-request certification refuses partial offers.");
  const owner = asRecord(offer.owner ?? null, "Duffel offer owner");
  if (owner.name !== DUFFEL_TEST_AIRLINE.ownerName || owner.iata_code !== DUFFEL_TEST_AIRLINE.iataCode) {
    throw new DuffelContractError("Duffel offline certification accepts only the explicit Duffel Airways ZZ test owner.");
  }
  const providerOfferId = providerId(offer.id, "off", "Duffel offer ID");
  // Duffel can emit microsecond offer expiries. The exact raw body remains
  // digest-bound; this provider expiry deadline is conservatively floor-
  // truncated to the JavaScript runtime's millisecond precision.
  const expiresAt = normalizeDuffelInstant(offer.expires_at, "Duffel offer expiry", false, true)!;
  const retrievedAtMs = Date.parse(retrievedAt);
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(retrievedAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= retrievedAtMs) {
    throw new DuffelContractError("Duffel offer is expired or retrieval time is malformed.");
  }
  const money = usdMoneyBreakdown(offer, "Duffel offer");
  const { total, base, tax } = money;
  const paymentRequirements = asRecord(requiredField(offer, "payment_requirements", "Duffel payment requirements"), "Duffel payment requirements");
  const requiresInstantPayment = asBoolean(paymentRequirements.requires_instant_payment, "Duffel instant-payment requirement");
  const paymentRequiredBy = normalizeDuffelInstant(paymentRequirements.payment_required_by, "Duffel payment-required-by", true);
  const priceGuaranteeExpiresAt = normalizeDuffelInstant(paymentRequirements.price_guarantee_expires_at, "Duffel price-guarantee expiry", true);
  if (requiresInstantPayment && (paymentRequiredBy !== null || priceGuaranteeExpiresAt !== null)) {
    throw new DuffelContractError("Instant-payment Duffel offers require null payment and price-guarantee deadlines.");
  }
  if (!requiresInstantPayment && (paymentRequiredBy === null || priceGuaranteeExpiresAt === null)) {
    throw new DuffelContractError("Hold-capable Duffel offers require exact payment and price-guarantee deadlines.");
  }
  for (const deadline of [paymentRequiredBy, priceGuaranteeExpiresAt]) {
    if (deadline !== null && Date.parse(deadline) <= retrievedAtMs) {
      throw new DuffelContractError("Duffel payment deadline evidence is stale at offer observation time.");
    }
  }
  if (
    !requiresInstantPayment
    && Date.parse(priceGuaranteeExpiresAt!) > Date.parse(paymentRequiredBy!)
  ) {
    throw new DuffelContractError("Duffel price-guarantee deadline cannot follow its payment deadline.");
  }
  const documentsRequired = asBoolean(
    offer.passenger_identity_documents_required,
    "Duffel passenger identity-document requirement",
  );
  const passengers = asArray(offer.passengers, "Duffel offer passengers");
  if (passengers.length !== search.passengers.adults) throw new DuffelContractError("Duffel offer passenger count changed from the reviewed search.");
  const providerPassengerIds = passengers.map((passenger, index) => {
    const record = asRecord(passenger, `Duffel offer passenger ${index + 1}`);
    if (record.type !== "adult") throw new DuffelContractError("Duffel offer passenger type changed from the adult-only request plan.");
    if (Object.prototype.hasOwnProperty.call(record, "fare_type") && record.fare_type !== null) {
      throw new DuffelContractError("Anonymous Duffel offers refuse passenger fare-type evidence that was not requested.");
    }
    return providerId(record.id, "pas", `Duffel offer passenger ${index + 1} ID`);
  });
  if (new Set(providerPassengerIds).size !== providerPassengerIds.length) throw new DuffelContractError("Duffel offer passenger IDs are duplicated.");
  const providerPassengerIdDigests = providerPassengerIds.map((id) => digestString("duffel-passenger-id-v1", id)).sort();
  if (canonicalFlightJson(providerPassengerIdDigests) !== canonicalFlightJson(expectedOfferRequestPassengerIdDigests)) {
    throw new DuffelContractError("Duffel offer passenger IDs changed from the enclosing offer request.");
  }

  const rawSlices = asArray(offer.slices, "Duffel offer slices");
  const providerSliceIds = rawSlices.map((rawSlice, sliceIndex) => providerId(
    asRecord(rawSlice, `Duffel offer slice ${sliceIndex + 1}`).id,
    "sli",
    `Duffel offer slice ${sliceIndex + 1} ID`,
  ));
  if (new Set(providerSliceIds).size !== providerSliceIds.length) {
    throw new DuffelContractError("Duffel offer slice IDs are duplicated within the offer.");
  }
  const expectedSliceCount = search.returnDate === null ? 1 : 2;
  if (rawSlices.length !== expectedSliceCount) throw new DuffelContractError("Duffel offer slice count changed from the reviewed search.");
  const segments: FlightSegment[] = [];
  const segmentIdentityDigests: string[] = [];
  const segmentOrderSharedTermsDigests: string[] = [];
  const segmentOfferTermsDigests: string[] = [];
  const segmentPhaseIdentityDigests: string[] = [];
  const sliceSegmentIdentityDigests: string[][] = [];
  const slicePhaseIdentityDigests: string[] = [];
  const sliceTermsDigests: string[] = [];
  const offerSliceTermsDigests: string[] = [];
  const operatingCarrierFlightNumbers: string[] = [];
  const carrierDisclosureDigests: string[] = [];
  const disclosures: DuffelOperatingCarrierDisclosure[] = [];
  const providerSegmentIds = new Set<string>();
  const providerStopIds = new Set<string>();
  let globalIndex = 0;
  rawSlices.forEach((rawSlice, sliceIndex) => {
    const slice = asRecord(rawSlice, `Duffel offer slice ${sliceIndex + 1}`);
    const rawSegments = asArray(slice.segments, `Duffel offer slice ${sliceIndex + 1} segments`);
    if (rawSegments.length < 1 || rawSegments.length > 2) throw new DuffelContractError("Duffel offer exceeds the one-connection request profile.");
    const projected = rawSegments.map((segment) => projectOfferSegment(segment, globalIndex++, providerPassengerIds, search.cabin));
    for (const item of projected) {
      if (providerSegmentIds.has(item.providerSegmentId)) throw new DuffelContractError("Duffel offer segment IDs are duplicated within the offer.");
      providerSegmentIds.add(item.providerSegmentId);
      for (const stopId of item.providerStopIds) {
        if (providerStopIds.has(stopId)) throw new DuffelContractError("Duffel offer stop IDs are duplicated within the offer.");
        providerStopIds.add(stopId);
      }
    }
    for (let segmentIndex = 1; segmentIndex < projected.length; segmentIndex += 1) {
      if (projected[segmentIndex - 1]!.segment.destination !== projected[segmentIndex]!.segment.origin) {
        throw new DuffelContractError("Duffel offer contains a disconnected itinerary.");
      }
    }
    const first = projected[0]!;
    const last = projected[projected.length - 1]!;
    const expectedOrigin = sliceIndex === 0 ? search.origin : search.destination;
    const expectedDestination = sliceIndex === 0 ? search.destination : search.origin;
    const expectedDate = sliceIndex === 0 ? search.departureDate : search.returnDate;
    if (
      first.segment.origin !== expectedOrigin
      || last.segment.destination !== expectedDestination
      || first.departingLocal.slice(0, 10) !== expectedDate
    ) throw new DuffelContractError("Duffel offer route or local departure date changed from the reviewed search.");
    const projectedSegmentDigests = projected.map((item) => item.identityDigest);
    segments.push(...projected.map((item) => item.segment));
    segmentIdentityDigests.push(...projectedSegmentDigests);
    segmentOrderSharedTermsDigests.push(...projected.map((item) => item.orderSharedTermsDigest));
    segmentOfferTermsDigests.push(...projected.map((item) => item.offerTermsDigest!));
    segmentPhaseIdentityDigests.push(...projected.map((item) => item.phaseIdentityDigest));
    sliceSegmentIdentityDigests.push(projectedSegmentDigests);
    slicePhaseIdentityDigests.push(sha256FlightEvidence({
      version: "duffel-offer-slice-phase-identity-v1",
      sliceIdDigest: digestString("duffel-slice-id-v1", providerSliceIds[sliceIndex]!),
      segmentPhaseIdentityDigests: projected.map((item) => item.phaseIdentityDigest),
    }));
    const sliceTerms = projectOfferSliceTerms(slice, sliceIndex, projectedSegmentDigests);
    sliceTermsDigests.push(sliceTerms.sharedDigest);
    offerSliceTermsDigests.push(sliceTerms.materialDigest);
    operatingCarrierFlightNumbers.push(...projected.map((item) => item.operatingFlightNumber!));
    carrierDisclosureDigests.push(...projected.map((item) => item.disclosureDigest));
    disclosures.push(...projected.map((item) => item.disclosure));
  });
  if (segments.length > 4) throw new DuffelContractError("Duffel offer exceeds the exact one-connection-per-slice contract limit.");

  const conditions = projectTopLevelFareConditions(
    requiredField(offer, "conditions", "Duffel offer conditions"),
    "Duffel offer conditions",
  );
  const offerConditionsDigest = sha256FlightEvidence({ version: "duffel-top-level-fare-conditions-v1", conditions });
  const intendedServices = Object.prototype.hasOwnProperty.call(offer, "intended_services")
    ? offer.intended_services === null
      ? []
      : asArray(offer.intended_services, "Duffel intended services")
    : [];
  const intendedPaymentMethods = Object.prototype.hasOwnProperty.call(offer, "intended_payment_methods")
    ? offer.intended_payment_methods === null
      ? []
      : asArray(offer.intended_payment_methods, "Duffel intended payment methods")
    : [];
  if (intendedServices.length !== 0 || intendedPaymentMethods.length !== 0) {
    throw new DuffelContractError("This Duffel profile accepts only offers with no intended services or payment methods.");
  }
  const availableServicesPresent = Object.prototype.hasOwnProperty.call(offer, "available_services");
  const availableServices = !availableServicesPresent
    || (projectionPhase === "initial_search" && offer.available_services === null)
    ? []
    : asArray(offer.available_services, "Duffel available services");
  if (availableServices.length !== 0) {
    throw new DuffelContractError("This offline Duffel profile refuses ancillary services until exact order-side service evidence exists.");
  }
  const privateFares = asArray(requiredField(offer, "private_fares", "Duffel private fares"), "Duffel private fares");
  if (privateFares.length !== 0) {
    throw new DuffelContractError("The anonymous Duffel request profile requires an empty offer private-fares list.");
  }
  const supportedPassengerIdentityDocumentTypes = exactStringArray(
    requiredField(offer, "supported_passenger_identity_document_types", "Duffel supported passenger identity-document types"),
    "Duffel supported passenger identity-document types",
    /^(?:passport|tax_id|known_traveler_number|passenger_redress_number)$/,
  );
  const supportedLoyaltyProgrammes = exactStringArray(
    requiredField(offer, "supported_loyalty_programmes", "Duffel supported loyalty programmes"),
    "Duffel supported loyalty programmes",
    carrierPattern,
  );
  const availableAirlineCreditIds = exactStringArray(
    requiredField(offer, "available_airline_credit_ids", "Duffel available airline-credit IDs"),
    "Duffel available airline-credit IDs",
    /^acd_[A-Za-z0-9]{8,252}$/,
  );
  if (availableAirlineCreditIds.length !== 0) {
    throw new DuffelContractError("Anonymous Duffel offer requests without airline-credit IDs or a user ID require an empty available airline-credit list.");
  }
  const materialTerms: FlightCanonicalJsonValue = {
    owner: { name: DUFFEL_TEST_AIRLINE.ownerName, iataCode: DUFFEL_TEST_AIRLINE.iataCode },
    segmentIdentityDigests,
    segmentOrderSharedTermsDigests,
    segmentOfferTermsDigests,
    sliceSegmentIdentityDigests,
    sliceTermsDigests,
    offerSliceTermsDigests,
    operatingCarrierFlightNumbers,
    carrierDisclosureDigests,
    providerPassengerIdDigests,
    conditions,
    serviceProfile: { profile: "no_services", availableServices },
    privateFares,
    supportedPassengerIdentityDocumentTypes,
    supportedLoyaltyProgrammes,
    availableAirlineCreditIds,
    paymentRequirements,
    passengerIdentityDocumentsRequired: documentsRequired,
    total,
    base,
    tax,
    expiresAt,
  };
  canonicalFlightJson(materialTerms);
  const termsDigest = sha256FlightEvidence({
    version: "duffel-offer-terms-v1",
    providerOfferIdDigest: digestString("duffel-provider-offer-id-v1", providerOfferId),
    requestPlanDigest,
    offerRequestIdDigest,
    materialTerms,
    carrierDisclosureDigests,
  });
  const snapshot: FlightOfferSnapshot = {
    offerId: localAlias("offer", providerOfferId),
    providerId: DUFFEL_SANDBOX_PROVIDER_ID,
    searchDigest: requestDigest,
    termsDigest,
    expiresAt,
    total,
    segments,
    source: "provider_sandbox",
  };
  const validation = validateFlightOfferSnapshot(snapshot);
  if (!validation.valid) throw new DuffelContractError(validation.errors.join(" "));
  const evidence: DuffelSanitizedOfferEvidence = {
    version: "duffel-sanitized-offer-v1",
    providerOfferId,
    providerOfferIdDigest: digestString("duffel-provider-offer-id-v1", providerOfferId),
    requestDigest,
    requestPlanDigest,
    offerRequestIdDigest,
    cabin: search.cabin,
    liveMode: false,
    ownerName: DUFFEL_TEST_AIRLINE.ownerName,
    ownerIataCode: DUFFEL_TEST_AIRLINE.iataCode,
    partial: false,
    requiresInstantPayment,
    paymentRequiredBy,
    priceGuaranteeExpiresAt,
    passengerIdentityDocumentsRequired: documentsRequired,
    providerPassengerIdDigests,
    total,
    base,
    tax,
    retrievedAt,
    expiresAt,
    segments,
    segmentIdentityDigests,
    segmentPhaseIdentityDigests,
    segmentOrderSharedTermsDigests,
    sliceSegmentIdentityDigests,
    slicePhaseIdentityDigests,
    sliceTermsDigests,
    operatingCarrierFlightNumbers,
    carrierDisclosureDigests,
    offerConditionsDigest,
    operatingCarrierDisclosures: disclosures,
    termsDigest,
    rawBodyDigest,
  };
  const projected = deepFreeze({ evidence, snapshot });
  return projected;
}

export function sanitizeDuffelSandboxOfferResponse(
  rawBody: Uint8Array,
  input: Readonly<{ search: FlightCommerceSearchRequest; retrievedAt: string }>,
): Readonly<{
  result: FlightProviderSearchResult;
  evidence: readonly DuffelSanitizedOfferEvidence[];
}> {
  const rawBodySnapshot = snapshotDuffelBytes(rawBody, "Duffel offer-request response body");
  const exactInput = snapshotCanonicalInput(input, "Duffel offer-response projection input") as typeof input;
  assertExactInputKeys(exactInput as unknown as Readonly<Record<string, unknown>>, "Duffel offer-response projection input", ["retrievedAt", "search"]);
  const exactSearch = snapshotFlightSearch(exactInput.search);
  const validation = validateFlightCommerceSearchRequest(exactSearch);
  if (!validation.valid || exactSearch.passengers.children !== 0 || exactSearch.passengers.infantsInSeat !== 0 || exactSearch.passengers.infantsOnLap !== 0) {
    throw new DuffelContractError("Duffel sandbox response is not bound to an approved adult-only search.");
  }
  const normalizedRetrievedAt = normalizeDuffelInstant(exactInput.retrievedAt, "Duffel search retrieval time")!;
  const requestPlan = buildDuffelSandboxOfferRequestPlan(exactSearch);
  const parsed = asRecord(parseDuffelJsonBodySnapshot(rawBodySnapshot), "Duffel offer-request response");
  const data = asRecord(parsed.data ?? null, "Duffel offer-request data");
  if (data.live_mode !== false) throw new DuffelContractError("Duffel offer request must explicitly report live_mode false.");
  const offerRequestAirlineCreditIds = Object.prototype.hasOwnProperty.call(data, "airline_credit_ids")
    ? exactStringArray(data.airline_credit_ids, "Duffel offer-request airline-credit IDs", /^acd_[A-Za-z0-9]{8,252}$/)
    : [];
  if (offerRequestAirlineCreditIds.length !== 0) {
    throw new DuffelContractError("Anonymous Duffel offer requests require absent or empty airline-credit IDs.");
  }
  const offerRequestPrivateFares = Object.prototype.hasOwnProperty.call(data, "private_fares")
    ? asArray(data.private_fares, "Duffel offer-request private fares")
    : [];
  if (offerRequestPrivateFares.length !== 0) {
    throw new DuffelContractError("Anonymous Duffel offer requests require absent or empty private fares.");
  }
  const offerRequestId = providerId(data.id, "orq", "Duffel offer-request ID");
  const offerRequestPassengerIdDigests = assertOfferRequestEcho(data, exactSearch);
  const requestDigest = searchRequestDigest(exactSearch);
  const offerRequestIdDigest = digestString("duffel-offer-request-id-v1", offerRequestId);
  const rawBodyDigest = digestBytes(rawBodySnapshot);
  const rawOffers = asArray(data.offers, "Duffel offer-request offers");
  if (rawOffers.length > 100) throw new DuffelContractError("Duffel offer response exceeds the local 100-offer cap.");
  const rawOfferRecords = rawOffers.map((rawOffer, index) => asRecord(rawOffer, `Duffel offer ${index + 1}`));
  const rawProviderOfferIds = rawOfferRecords.map((rawOffer, index) => providerId(
    rawOffer.id,
    "off",
    `Duffel offer ${index + 1} ID`,
  ));
  if (new Set(rawProviderOfferIds).size !== rawProviderOfferIds.length) {
    throw new DuffelContractError("Duffel offer-request response contains duplicate provider offer IDs.");
  }
  const certifiableOffers = rawOfferRecords.filter((offer, index) => {
    if (offer.live_mode !== false) {
      throw new DuffelContractError("Duffel sandbox offer must explicitly report live_mode false.");
    }
    const owner = asRecord(offer.owner ?? null, `Duffel offer ${index + 1} owner`);
    const ownerName = asString(owner.name, `Duffel offer ${index + 1} owner name`);
    const ownerIataCode = owner.iata_code === null
      ? null
      : asString(owner.iata_code, `Duffel offer ${index + 1} owner IATA code`, carrierPattern);
    const nameMatches = ownerName === DUFFEL_TEST_AIRLINE.ownerName;
    const codeMatches = ownerIataCode === DUFFEL_TEST_AIRLINE.iataCode;
    if (nameMatches !== codeMatches) {
      throw new DuffelContractError("Duffel offer owner identity is inconsistent with the explicit Duffel Airways ZZ test owner.");
    }
    return nameMatches && codeMatches;
  });
  if (rawOffers.length > 0 && certifiableOffers.length === 0) {
    throw new DuffelContractError("Duffel offline certification accepts only the explicit Duffel Airways ZZ test owner.");
  }
  const projected = certifiableOffers.map((offer) => projectOffer(
    offer,
    exactSearch,
    requestDigest,
    requestPlan.requestDigest,
    offerRequestIdDigest,
    offerRequestPassengerIdDigests,
    "initial_search",
    normalizedRetrievedAt,
    rawBodyDigest,
  ));
  projected.forEach((item) => sanitizedDuffelOfferEvidence.add(item.evidence));
  const result: FlightProviderSearchResult = {
    providerId: DUFFEL_SANDBOX_PROVIDER_ID,
    source: "provider_sandbox",
    requestDigest,
    offers: projected.map((item) => item.snapshot),
    retrievedAt: normalizedRetrievedAt,
    externalSideEffect: false,
  };
  return deepFreeze({ result, evidence: projected.map((item) => item.evidence) });
}

export function sanitizeDuffelSandboxRepriceResponse(
  rawBody: Uint8Array,
  input: Readonly<{
    search: FlightCommerceSearchRequest;
    original: FlightOfferSnapshot;
    originalEvidence: DuffelSanitizedOfferEvidence | DuffelRefreshedOfferEvidence;
    repricedAt: string;
  }>,
): Readonly<{ result: FlightProviderRepriceResult; evidence: DuffelRefreshedOfferEvidence; termsChanged: boolean }> {
  const rawBodySnapshot = snapshotDuffelBytes(rawBody, "Duffel offer retrieval response body");
  const originalEvidenceReference = dataPropertyReference(input, "originalEvidence", "Duffel reprice projection input") as DuffelSanitizedOfferEvidence | DuffelRefreshedOfferEvidence;
  const exactInput = snapshotCanonicalInput(input, "Duffel reprice projection input") as typeof input;
  assertExactInputKeys(exactInput as unknown as Readonly<Record<string, unknown>>, "Duffel reprice projection input", [
    "original", "originalEvidence", "repricedAt", "search",
  ]);
  const exactSearch = snapshotFlightSearch(exactInput.search);
  const normalizedRepricedAt = normalizeDuffelInstant(exactInput.repricedAt, "Duffel reprice time")!;
  if (Date.parse(normalizedRepricedAt) < Date.parse(exactInput.originalEvidence.retrievedAt)) {
    throw new DuffelContractError("Duffel offer refresh time cannot precede its exact predecessor capture.");
  }
  const expectedOriginalSnapshot: FlightOfferSnapshot = {
    offerId: localAlias("offer", exactInput.originalEvidence.providerOfferId),
    providerId: DUFFEL_SANDBOX_PROVIDER_ID,
    searchDigest: exactInput.originalEvidence.requestDigest,
    termsDigest: exactInput.originalEvidence.termsDigest,
    expiresAt: exactInput.originalEvidence.expiresAt,
    total: exactInput.originalEvidence.total,
    segments: exactInput.originalEvidence.segments,
    source: "provider_sandbox",
  };
  if (
    !isProjectedOfferEvidence(originalEvidenceReference as object)
    || canonicalFlightJson(exactInput.original) !== canonicalFlightJson(expectedOriginalSnapshot)
    || exactInput.original.providerId !== DUFFEL_SANDBOX_PROVIDER_ID
    || exactInput.original.source !== "provider_sandbox"
    || exactInput.original.offerId !== localAlias("offer", exactInput.originalEvidence.providerOfferId)
    || exactInput.original.searchDigest !== searchRequestDigest(exactSearch)
    || exactInput.originalEvidence.requestDigest !== exactInput.original.searchDigest
    || exactInput.originalEvidence.requestPlanDigest !== buildDuffelSandboxOfferRequestPlan(exactSearch).requestDigest
    || !sha256Pattern.test(exactInput.originalEvidence.offerRequestIdDigest)
  ) throw new DuffelContractError("Duffel reprice input is bound to another exact offer or search.");
  const retrievalPlanDigest = buildDuffelSandboxOfferRetrievalPlan(originalEvidenceReference).requestDigest;
  const parsed = asRecord(parseDuffelJsonBodySnapshot(rawBodySnapshot), "Duffel offer retrieval response");
  const rawBodyDigest = digestBytes(rawBodySnapshot);
  const projected = projectOffer(
    parsed.data ?? null,
    exactSearch,
    exactInput.original.searchDigest,
    exactInput.originalEvidence.requestPlanDigest,
    exactInput.originalEvidence.offerRequestIdDigest,
    exactInput.originalEvidence.providerPassengerIdDigests,
    "refresh",
    normalizedRepricedAt,
    rawBodyDigest,
  );
  if (
    projected.evidence.providerOfferId !== exactInput.originalEvidence.providerOfferId
    || canonicalFlightJson(projected.evidence.segmentIdentityDigests) !== canonicalFlightJson(exactInput.originalEvidence.segmentIdentityDigests)
    || canonicalFlightJson(projected.evidence.segmentPhaseIdentityDigests) !== canonicalFlightJson(exactInput.originalEvidence.segmentPhaseIdentityDigests)
    || canonicalFlightJson(projected.evidence.sliceSegmentIdentityDigests) !== canonicalFlightJson(exactInput.originalEvidence.sliceSegmentIdentityDigests)
    || canonicalFlightJson(projected.evidence.slicePhaseIdentityDigests) !== canonicalFlightJson(exactInput.originalEvidence.slicePhaseIdentityDigests)
    || canonicalFlightJson(projected.evidence.operatingCarrierFlightNumbers) !== canonicalFlightJson(exactInput.originalEvidence.operatingCarrierFlightNumbers)
    || canonicalFlightJson(projected.evidence.carrierDisclosureDigests) !== canonicalFlightJson(exactInput.originalEvidence.carrierDisclosureDigests)
  ) throw new DuffelContractError("Duffel refreshed offer changed the reviewed offer identity or immutable itinerary.");
  const priceChanged = canonicalFlightJson(projected.snapshot.total) !== canonicalFlightJson(exactInput.original.total);
  const termsChanged = projected.evidence.termsDigest !== exactInput.originalEvidence.termsDigest;
  const previousRefreshReceiptDigest = exactInput.originalEvidence.version === "duffel-refreshed-offer-v1"
    ? exactInput.originalEvidence.refreshReceiptDigest
    : null;
  const refreshReceiptDigest = sha256FlightEvidence({
    version: "duffel-offer-refresh-receipt-v1",
    providerOfferIdDigest: projected.evidence.providerOfferIdDigest,
    requestDigest: projected.evidence.requestDigest,
    originalOfferRequestPlanDigest: projected.evidence.requestPlanDigest,
    retrievalPlanDigest,
    offerRequestIdDigest: projected.evidence.offerRequestIdDigest,
    refreshedAt: normalizedRepricedAt,
    previousTermsDigest: exactInput.originalEvidence.termsDigest,
    refreshedTermsDigest: projected.evidence.termsDigest,
    previousRawBodyDigest: exactInput.originalEvidence.rawBodyDigest,
    refreshedRawBodyDigest: projected.evidence.rawBodyDigest,
    previousRefreshReceiptDigest,
    previousTotal: exactInput.original.total,
    refreshedTotal: projected.snapshot.total,
  });
  const refreshedEvidence: DuffelRefreshedOfferEvidence = deepFreeze({
    ...projected.evidence,
    version: "duffel-refreshed-offer-v1" as const,
    refreshedAt: normalizedRepricedAt,
    previousTermsDigest: exactInput.originalEvidence.termsDigest,
    previousRawBodyDigest: exactInput.originalEvidence.rawBodyDigest,
    previousRefreshReceiptDigest,
    retrievalPlanDigest,
    termsChanged,
    refreshReceiptDigest,
  });
  refreshedDuffelOfferEvidence.add(refreshedEvidence);
  const result: FlightProviderRepriceResult = {
    providerId: DUFFEL_SANDBOX_PROVIDER_ID,
    source: "provider_sandbox",
    originalOfferId: exactInput.original.offerId,
    repricedOffer: projected.snapshot,
    priceChanged,
    repricedAt: normalizedRepricedAt,
    externalSideEffect: false,
  };
  return deepFreeze({ result, evidence: refreshedEvidence, termsChanged });
}

function offerEvidenceDigest(value: DuffelSanitizedOfferEvidence | DuffelRefreshedOfferEvidence) {
  return sha256FlightEvidence(value as unknown as FlightCanonicalJsonValue);
}

function offerSnapshotDigest(value: FlightOfferSnapshot) {
  return sha256FlightEvidence(value as unknown as FlightCanonicalJsonValue);
}

function durableOfferRecordPayload(record: Omit<DuffelDurableOfferEvidenceRecord, "recordDigest">) {
  return {
    version: record.version,
    stage: record.stage,
    scope: record.scope,
    localOfferId: record.localOfferId,
    search: record.search,
    observedAt: record.observedAt,
    retentionExpiresAt: record.retentionExpiresAt,
    predecessorReceiptDigest: record.predecessorReceiptDigest,
    rawBodyBase64: record.rawBodyBase64,
    rawBodyDigest: record.rawBodyDigest,
    evidenceDigest: record.evidenceDigest,
    snapshotDigest: record.snapshotDigest,
  } as const;
}

function buildDurableOfferRecord(input: Readonly<{
  stage: "initial" | "refreshed";
  scope: DuffelOfferEvidenceScope;
  search: FlightCommerceSearchRequest;
  observedAt: string;
  retentionExpiresAt: string;
  predecessorReceiptDigest: string | null;
  rawBody: Uint8Array;
  snapshot: FlightOfferSnapshot;
  evidence: DuffelSanitizedOfferEvidence | DuffelRefreshedOfferEvidence;
}>) {
  const rawBody = snapshotDuffelBytes(input.rawBody, "Duffel durable offer evidence body");
  const scope = snapshotOfferEvidenceScope(input.scope, "Duffel durable offer evidence scope");
  const search = snapshotFlightSearch(input.search);
  const observedAt = normalizeDuffelInstant(input.observedAt, "Duffel durable offer evidence observation time")!;
  const retentionExpiresAt = normalizeDuffelInstant(input.retentionExpiresAt, "Duffel durable offer evidence retention deadline")!;
  if (Date.parse(retentionExpiresAt) <= Date.parse(observedAt)) {
    throw new DuffelContractError("Duffel durable offer evidence retention must follow its observation time.");
  }
  const predecessorReceiptDigest = input.predecessorReceiptDigest;
  if (
    (input.stage === "initial" && predecessorReceiptDigest !== null)
    || (input.stage === "refreshed" && (predecessorReceiptDigest === null || !sha256Pattern.test(predecessorReceiptDigest)))
  ) throw new DuffelContractError("Duffel durable offer evidence has an invalid predecessor receipt.");
  if (!isFlightStableToken(input.snapshot.offerId)) {
    throw new DuffelContractError("Duffel durable offer evidence requires a stable local offer ID.");
  }
  const payload = durableOfferRecordPayload({
    version: "duffel-durable-offer-evidence-record-v1",
    stage: input.stage,
    scope,
    localOfferId: input.snapshot.offerId,
    search,
    observedAt,
    retentionExpiresAt,
    predecessorReceiptDigest,
    rawBodyBase64: Buffer.from(rawBody.buffer, rawBody.byteOffset, rawBody.byteLength).toString("base64"),
    rawBodyDigest: digestBytes(rawBody),
    evidenceDigest: offerEvidenceDigest(input.evidence),
    snapshotDigest: offerSnapshotDigest(input.snapshot),
  });
  return deepFreeze({
    ...payload,
    recordDigest: sha256FlightEvidence(payload as unknown as FlightCanonicalJsonValue),
  }) satisfies DuffelDurableOfferEvidenceRecord;
}

function validateDurableOfferRecord(value: DuffelDurableOfferEvidenceRecord) {
  const record = snapshotCanonicalInput(value, "Duffel durable offer evidence record") as DuffelDurableOfferEvidenceRecord;
  assertExactInputKeys(record as unknown as Readonly<Record<string, unknown>>, "Duffel durable offer evidence record", [
    "evidenceDigest",
    "localOfferId",
    "observedAt",
    "predecessorReceiptDigest",
    "rawBodyBase64",
    "rawBodyDigest",
    "recordDigest",
    "retentionExpiresAt",
    "search",
    "scope",
    "snapshotDigest",
    "stage",
    "version",
  ]);
  if (
    record.version !== "duffel-durable-offer-evidence-record-v1"
    || !["initial", "refreshed"].includes(record.stage)
    || !isFlightStableToken(record.localOfferId)
    || !sha256Pattern.test(record.rawBodyDigest)
    || !sha256Pattern.test(record.evidenceDigest)
    || !sha256Pattern.test(record.snapshotDigest)
    || !sha256Pattern.test(record.recordDigest)
  ) throw new DuffelContractError("Duffel durable offer evidence record is malformed.");
  const search = snapshotFlightSearch(record.search);
  snapshotOfferEvidenceScope(record.scope, "Duffel durable offer evidence scope");
  const validation = validateFlightCommerceSearchRequest(search);
  if (!validation.valid || search.passengers.children !== 0 || search.passengers.infantsInSeat !== 0 || search.passengers.infantsOnLap !== 0) {
    throw new DuffelContractError("Duffel durable offer evidence is outside the adult-only search profile.");
  }
  const observedAt = normalizeDuffelInstant(record.observedAt, "Duffel durable offer evidence observation time")!;
  const retentionExpiresAt = normalizeDuffelInstant(record.retentionExpiresAt, "Duffel durable offer evidence retention deadline")!;
  if (observedAt !== record.observedAt || retentionExpiresAt !== record.retentionExpiresAt || Date.parse(retentionExpiresAt) <= Date.parse(observedAt)) {
    throw new DuffelContractError("Duffel durable offer evidence time is not normalized.");
  }
  if (
    (record.stage === "initial" && record.predecessorReceiptDigest !== null)
    || (record.stage === "refreshed" && (record.predecessorReceiptDigest === null || !sha256Pattern.test(record.predecessorReceiptDigest)))
  ) throw new DuffelContractError("Duffel durable offer evidence predecessor is malformed.");
  if (
    record.rawBodyBase64.length > Math.ceil(DUFFEL_MAX_RAW_BODY_BYTES / 3) * 4
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(record.rawBodyBase64)
  ) throw new DuffelContractError("Duffel durable offer evidence body encoding is malformed.");
  const decoded = Buffer.from(record.rawBodyBase64, "base64");
  if (decoded.toString("base64") !== record.rawBodyBase64) {
    throw new DuffelContractError("Duffel durable offer evidence body encoding is not canonical.");
  }
  const rawBody = snapshotDuffelBytes(new Uint8Array(decoded.buffer, decoded.byteOffset, decoded.byteLength), "Duffel durable offer evidence body");
  if (digestBytes(rawBody) !== record.rawBodyDigest) {
    throw new DuffelContractError("Duffel durable offer evidence body digest does not match.");
  }
  const payload = durableOfferRecordPayload(record);
  if (sha256FlightEvidence(payload as unknown as FlightCanonicalJsonValue) !== record.recordDigest) {
    throw new DuffelContractError("Duffel durable offer evidence record digest does not match.");
  }
  // The byte view is an owned copy and never escapes this rehydration path.
  // Node cannot freeze non-empty typed-array views, so freeze only the wrapper;
  // the deeply frozen record remains immutable and reprojection uses this copy.
  return Object.freeze({ record, rawBody });
}

type ReviewedDuffelOfferEvidenceLoader = Readonly<{
  readPolicy: DuffelAuthenticatedOfferEvidenceLoader["readOfferEvidencePolicy"];
  load: DuffelAuthenticatedOfferEvidenceLoader["verifyAndLoadOfferEvidence"];
}>;

type ReviewedDuffelOfferEvidenceRepository = ReviewedDuffelOfferEvidenceLoader & Readonly<{
  store: DuffelAuthenticatedOfferEvidenceRepository["storeOfferEvidence"];
}>;

function reviewAuthenticatedOfferEvidenceLoader(
  loader: DuffelAuthenticatedOfferEvidenceLoader,
): ReviewedDuffelOfferEvidenceLoader {
  if (loader === null || typeof loader !== "object" || nodeTypes.isProxy(loader)) {
    throw new DuffelContractError("Duffel offer evidence requires a non-proxy authenticated loader.");
  }
  return Object.freeze({
    readPolicy: captureTrustedMethod<DuffelAuthenticatedOfferEvidenceLoader["readOfferEvidencePolicy"]>(
      loader,
      "readOfferEvidencePolicy",
      "Duffel authenticated offer evidence loader",
    ),
    load: captureTrustedMethod<DuffelAuthenticatedOfferEvidenceLoader["verifyAndLoadOfferEvidence"]>(
      loader,
      "verifyAndLoadOfferEvidence",
      "Duffel authenticated offer evidence loader",
    ),
  });
}

function reviewAuthenticatedOfferEvidenceRepository(
  repository: DuffelAuthenticatedOfferEvidenceRepository,
): ReviewedDuffelOfferEvidenceRepository {
  const loader = reviewAuthenticatedOfferEvidenceLoader(repository);
  return Object.freeze({
    ...loader,
    store: captureTrustedMethod<DuffelAuthenticatedOfferEvidenceRepository["storeOfferEvidence"]>(
      repository,
      "storeOfferEvidence",
      "Duffel authenticated offer evidence repository",
    ),
  });
}

async function readAuthenticatedOfferEvidenceRepositoryPolicy(repository: ReviewedDuffelOfferEvidenceLoader) {
  const policy = snapshotCanonicalInput(
    await repository.readPolicy(),
    "Duffel authenticated offer evidence repository policy",
  ) as DuffelAuthenticatedOfferEvidenceRepositoryPolicy;
  assertExactInputKeys(policy as unknown as Readonly<Record<string, unknown>>, "Duffel authenticated offer evidence repository policy", [
    "dataClassification", "decision", "maximumRetentionSeconds", "rawBodyLoggingDisabled", "realProviderDataAuthorized",
    "retentionDeletionRequired", "tenantAccessControlRequired", "trustedTime", "version",
  ]);
  const trustedTime = normalizeDuffelInstant(policy.trustedTime, "Duffel offer evidence repository trusted time")!;
  if (
    policy.version !== "duffel-offer-evidence-repository-policy-v1"
    || policy.decision !== "accepted"
    || policy.dataClassification !== "synthetic_fixture_only"
    || policy.realProviderDataAuthorized !== false
    || policy.rawBodyLoggingDisabled !== true
    || policy.tenantAccessControlRequired !== true
    || policy.retentionDeletionRequired !== true
    || !Number.isSafeInteger(policy.maximumRetentionSeconds)
    || policy.maximumRetentionSeconds < 60
    || policy.maximumRetentionSeconds > 604_800
  ) throw new DuffelContractError("Duffel offer evidence repository privacy policy is not accepted for this offline gate.");
  return Object.freeze({ ...policy, trustedTime });
}

function assertRecordWithinRepositoryPolicy(
  record: DuffelDurableOfferEvidenceRecord,
  policy: DuffelAuthenticatedOfferEvidenceRepositoryPolicy,
) {
  const trustedTime = Date.parse(policy.trustedTime);
  const observedAt = Date.parse(record.observedAt);
  const retentionExpiresAt = Date.parse(record.retentionExpiresAt);
  if (
    observedAt > trustedTime
    || retentionExpiresAt <= trustedTime
    || retentionExpiresAt - trustedTime > policy.maximumRetentionSeconds * 1_000
  ) throw new DuffelContractError("Duffel offer evidence is outside the repository retention or trusted-time policy.");
}

function preflightAuthenticatedOfferEvidenceLoadResult(value: unknown) {
  if (value === null || typeof value !== "object" || nodeTypes.isProxy(value)) {
    throw new DuffelContractError("Duffel authenticated offer evidence load result must be plain data.");
  }
  const decision = dataPropertyReference(value, "decision", "Duffel authenticated offer evidence load result");
  if (decision !== "verified") return;
  const record = dataPropertyReference(value, "record", "Duffel authenticated offer evidence load result");
  if (record === null || typeof record !== "object" || nodeTypes.isProxy(record)) {
    throw new DuffelContractError("Duffel authenticated offer evidence record must be plain data.");
  }
  const encoded = dataPropertyReference(record, "rawBodyBase64", "Duffel authenticated offer evidence record");
  if (typeof encoded !== "string" || encoded.length > Math.ceil(DUFFEL_MAX_RAW_BODY_BYTES / 3) * 4) {
    throw new DuffelContractError("Duffel durable offer evidence body encoding exceeds the pre-snapshot limit.");
  }
}

async function storeDurableOfferRecord(
  repository: ReviewedDuffelOfferEvidenceRepository,
  record: DuffelDurableOfferEvidenceRecord,
) {
  const stored = snapshotCanonicalInput(
    await repository.store(record, record.scope),
    "Duffel authenticated offer evidence store result",
  ) as DuffelAuthenticatedOfferEvidenceStoreResult;
  assertExactInputKeys(stored as unknown as Readonly<Record<string, unknown>>, "Duffel authenticated offer evidence store result", [
    "decision", "receiptDigest", "recordDigest",
  ]);
  if (
    !["stored", "already_stored"].includes(stored.decision)
    || !sha256Pattern.test(stored.receiptDigest)
    || stored.recordDigest !== record.recordDigest
  ) throw new DuffelContractError("Duffel authenticated repository did not bind the exact offer evidence record.");
  return stored;
}

export async function persistDuffelSandboxInitialOfferEvidence(
  repository: DuffelAuthenticatedOfferEvidenceRepository,
  rawBody: Uint8Array,
  input: Readonly<{
    search: FlightCommerceSearchRequest;
    retrievedAt: string;
    offerId: string;
    scope: DuffelOfferEvidenceScope;
    retentionExpiresAt: string;
  }>,
): Promise<DuffelRehydratedOfferEvidence> {
  const reviewedRepository = reviewAuthenticatedOfferEvidenceRepository(repository);
  const exactInput = snapshotCanonicalInput(input, "Duffel initial evidence persistence input") as typeof input;
  assertExactInputKeys(exactInput as unknown as Readonly<Record<string, unknown>>, "Duffel initial evidence persistence input", [
    "offerId", "retentionExpiresAt", "retrievedAt", "scope", "search",
  ]);
  if (!isFlightStableToken(exactInput.offerId)) throw new DuffelContractError("Duffel initial evidence requires a stable local offer ID.");
  const rawBodySnapshot = snapshotDuffelBytes(rawBody, "Duffel initial evidence persistence body");
  const policy = await readAuthenticatedOfferEvidenceRepositoryPolicy(reviewedRepository);
  const projected = sanitizeDuffelSandboxOfferResponse(rawBodySnapshot, {
    search: exactInput.search,
    retrievedAt: exactInput.retrievedAt,
  });
  const index = projected.result.offers.findIndex((offer) => offer.offerId === exactInput.offerId);
  if (index < 0) throw new DuffelContractError("Duffel initial evidence offer is not present in the exact response.");
  const snapshot = projected.result.offers[index]!;
  const evidence = projected.evidence[index]!;
  const record = buildDurableOfferRecord({
    stage: "initial",
    scope: exactInput.scope,
    search: exactInput.search,
    observedAt: evidence.retrievedAt,
    retentionExpiresAt: exactInput.retentionExpiresAt,
    predecessorReceiptDigest: null,
    rawBody: rawBodySnapshot,
    snapshot,
    evidence,
  });
  assertRecordWithinRepositoryPolicy(record, policy);
  const stored = await storeDurableOfferRecord(reviewedRepository, record);
  const persisted = deepFreeze({
    stage: "initial" as const,
    receiptDigest: stored.receiptDigest,
    recordDigest: record.recordDigest,
    scope: record.scope,
    retentionExpiresAt: record.retentionExpiresAt,
    search: record.search,
    snapshot,
    evidence,
  });
  rehydratedDuffelOfferEvidence.add(persisted);
  return persisted;
}

async function rehydrateDuffelSandboxOfferEvidenceInternal(
  repository: ReviewedDuffelOfferEvidenceLoader,
  policy: DuffelAuthenticatedOfferEvidenceRepositoryPolicy,
  receiptDigest: string,
  expectedScope: DuffelOfferEvidenceScope,
  seen: Set<string>,
  depth: number,
): Promise<DuffelRehydratedOfferEvidence> {
  if (!sha256Pattern.test(receiptDigest) || depth > 8 || seen.has(receiptDigest)) {
    throw new DuffelContractError("Duffel offer evidence receipt chain is malformed or cyclic.");
  }
  seen.add(receiptDigest);
  const rawLoaded = await repository.load(receiptDigest, expectedScope);
  preflightAuthenticatedOfferEvidenceLoadResult(rawLoaded);
  const loaded = snapshotCanonicalInput(
    rawLoaded,
    "Duffel authenticated offer evidence load result",
  ) as DuffelAuthenticatedOfferEvidenceLoadResult;
  if (loaded.decision !== "verified") {
    assertExactInputKeys(loaded as unknown as Readonly<Record<string, unknown>>, "Duffel authenticated offer evidence load result", ["decision"]);
    throw new DuffelContractError("Duffel authenticated offer evidence receipt was not verified.");
  }
  assertExactInputKeys(loaded as unknown as Readonly<Record<string, unknown>>, "Duffel authenticated offer evidence load result", [
    "decision", "receiptDigest", "record",
  ]);
  if (loaded.receiptDigest !== receiptDigest) {
    throw new DuffelContractError("Duffel authenticated repository returned a different receipt.");
  }
  const validated = validateDurableOfferRecord(loaded.record);
  const { record, rawBody } = validated;
  assertRecordWithinRepositoryPolicy(record, policy);
  if (
    canonicalFlightJson(record.scope as unknown as FlightCanonicalJsonValue)
    !== canonicalFlightJson(expectedScope as unknown as FlightCanonicalJsonValue)
  ) throw new DuffelContractError("Duffel offer evidence receipt is bound to another tenant, commerce session, or actor.");
  let snapshot: FlightOfferSnapshot;
  let evidence: DuffelSanitizedOfferEvidence | DuffelRefreshedOfferEvidence;
  if (record.stage === "initial") {
    const projected = sanitizeDuffelSandboxOfferResponse(rawBody, { search: record.search, retrievedAt: record.observedAt });
    const index = projected.result.offers.findIndex((offer) => offer.offerId === record.localOfferId);
    if (index < 0) throw new DuffelContractError("Duffel durable initial evidence does not contain its bound offer.");
    snapshot = projected.result.offers[index]!;
    evidence = projected.evidence[index]!;
  } else {
    const predecessorReceiptDigest = record.predecessorReceiptDigest!;
    const predecessor = await rehydrateDuffelSandboxOfferEvidenceInternal(
      repository,
      policy,
      predecessorReceiptDigest,
      expectedScope,
      seen,
      depth + 1,
    );
    if (
      predecessor.snapshot.offerId !== record.localOfferId
      || canonicalFlightJson(predecessor.search as unknown as FlightCanonicalJsonValue)
        !== canonicalFlightJson(record.search as unknown as FlightCanonicalJsonValue)
      || canonicalFlightJson(predecessor.scope as unknown as FlightCanonicalJsonValue)
        !== canonicalFlightJson(record.scope as unknown as FlightCanonicalJsonValue)
      || predecessor.retentionExpiresAt !== record.retentionExpiresAt
    ) throw new DuffelContractError("Duffel durable refresh predecessor is bound to another offer or search.");
    const refreshed = sanitizeDuffelSandboxRepriceResponse(rawBody, {
      search: record.search,
      original: predecessor.snapshot,
      originalEvidence: predecessor.evidence,
      repricedAt: record.observedAt,
    });
    snapshot = refreshed.result.repricedOffer;
    evidence = refreshed.evidence;
  }
  if (
    snapshot.offerId !== record.localOfferId
    || offerSnapshotDigest(snapshot) !== record.snapshotDigest
    || offerEvidenceDigest(evidence) !== record.evidenceDigest
  ) throw new DuffelContractError("Duffel durable offer evidence projection does not match its authenticated record.");
  const rehydrated = deepFreeze({
    stage: record.stage,
    receiptDigest,
    recordDigest: record.recordDigest,
    scope: record.scope,
    retentionExpiresAt: record.retentionExpiresAt,
    search: record.search,
    snapshot,
    evidence,
  });
  return rehydrated;
}

export async function rehydrateDuffelSandboxOfferEvidence(
  repository: DuffelAuthenticatedOfferEvidenceRepository,
  receiptDigest: string,
  expectedScope: DuffelOfferEvidenceScope,
) {
  const reviewedRepository = reviewAuthenticatedOfferEvidenceRepository(repository);
  const scope = snapshotOfferEvidenceScope(expectedScope, "Duffel offer evidence rehydration scope");
  const policy = await readAuthenticatedOfferEvidenceRepositoryPolicy(reviewedRepository);
  const rehydrated = await rehydrateDuffelSandboxOfferEvidenceInternal(
    reviewedRepository,
    policy,
    receiptDigest,
    scope,
    new Set(),
    0,
  );
  rehydratedDuffelOfferEvidence.add(rehydrated);
  return rehydrated;
}

/**
 * Decrypts, chain-validates, and projects historical offer evidence without
 * adding the result to the private order-create authority WeakSet. The loader
 * surface has no persistence method and this result cannot authorize dispatch.
 */
export async function projectDuffelSandboxTerminalRecoveryOfferEvidence(
  loader: DuffelAuthenticatedOfferEvidenceLoader,
  receiptDigest: string,
  expectedScope: DuffelOfferEvidenceScope,
): Promise<DuffelTerminalRecoveryOfferEvidence> {
  const reviewedLoader = reviewAuthenticatedOfferEvidenceLoader(loader);
  const scope = snapshotOfferEvidenceScope(
    expectedScope,
    "Duffel terminal-recovery offer evidence projection scope",
  );
  const policy = await readAuthenticatedOfferEvidenceRepositoryPolicy(reviewedLoader);
  const projected = await rehydrateDuffelSandboxOfferEvidenceInternal(
    reviewedLoader,
    policy,
    receiptDigest,
    scope,
    new Set(),
    0,
  );
  if (projected.stage !== "refreshed" || projected.evidence.version !== "duffel-refreshed-offer-v1") {
    throw new DuffelContractError("Duffel terminal recovery requires exact post-reprice offer evidence.");
  }
  const refreshed = projected.evidence;
  const terminalEvidence = deepFreeze({
    version: "duffel-terminal-recovery-refreshed-offer-evidence-v1" as const,
    providerOfferIdDigest: refreshed.providerOfferIdDigest,
    providerPassengerIdDigests: [...refreshed.providerPassengerIdDigests],
    total: { ...refreshed.total },
    base: { ...refreshed.base },
    tax: refreshed.tax === null ? null : { ...refreshed.tax },
    refreshedAt: refreshed.refreshedAt,
    refreshReceiptDigest: refreshed.refreshReceiptDigest,
    termsDigest: refreshed.termsDigest,
    cabin: refreshed.cabin,
    segmentIdentityDigests: [...refreshed.segmentIdentityDigests],
    segmentOrderSharedTermsDigests: [...refreshed.segmentOrderSharedTermsDigests],
    sliceSegmentIdentityDigests: refreshed.sliceSegmentIdentityDigests.map((slice) => [...slice]),
    sliceTermsDigests: [...refreshed.sliceTermsDigests],
    operatingCarrierFlightNumbers: [...refreshed.operatingCarrierFlightNumbers],
    carrierDisclosureDigests: [...refreshed.carrierDisclosureDigests],
    offerConditionsDigest: refreshed.offerConditionsDigest,
  });
  terminalRecoveryDuffelOfferEvidence.add(terminalEvidence);
  return deepFreeze({
    version: "duffel-terminal-recovery-offer-evidence-v1" as const,
    terminalStage: "refreshed" as const,
    receiptDigest: projected.receiptDigest,
    recordDigest: projected.recordDigest,
    scope: projected.scope,
    retentionExpiresAt: projected.retentionExpiresAt,
    search: projected.search,
    snapshot: projected.snapshot,
    evidence: terminalEvidence,
  });
}

export async function persistDuffelSandboxRefreshedOfferEvidence(
  repository: DuffelAuthenticatedOfferEvidenceRepository,
  rawBody: Uint8Array,
  input: Readonly<{ predecessorReceiptDigest: string; repricedAt: string; scope: DuffelOfferEvidenceScope }>,
): Promise<DuffelRehydratedOfferEvidence> {
  const reviewedRepository = reviewAuthenticatedOfferEvidenceRepository(repository);
  const exactInput = snapshotCanonicalInput(input, "Duffel refreshed evidence persistence input") as typeof input;
  assertExactInputKeys(exactInput as unknown as Readonly<Record<string, unknown>>, "Duffel refreshed evidence persistence input", [
    "predecessorReceiptDigest", "repricedAt", "scope",
  ]);
  if (!sha256Pattern.test(exactInput.predecessorReceiptDigest)) {
    throw new DuffelContractError("Duffel refreshed evidence predecessor receipt is malformed.");
  }
  const rawBodySnapshot = snapshotDuffelBytes(rawBody, "Duffel refreshed evidence persistence body");
  const scope = snapshotOfferEvidenceScope(exactInput.scope, "Duffel refreshed evidence persistence scope");
  const policy = await readAuthenticatedOfferEvidenceRepositoryPolicy(reviewedRepository);
  const predecessor = await rehydrateDuffelSandboxOfferEvidenceInternal(
    reviewedRepository,
    policy,
    exactInput.predecessorReceiptDigest,
    scope,
    new Set(),
    0,
  );
  const refreshed = sanitizeDuffelSandboxRepriceResponse(rawBodySnapshot, {
    search: predecessor.search,
    original: predecessor.snapshot,
    originalEvidence: predecessor.evidence,
    repricedAt: exactInput.repricedAt,
  });
  const record = buildDurableOfferRecord({
    stage: "refreshed",
    scope: predecessor.scope,
    search: predecessor.search,
    observedAt: refreshed.evidence.refreshedAt,
    retentionExpiresAt: predecessor.retentionExpiresAt,
    predecessorReceiptDigest: predecessor.receiptDigest,
    rawBody: rawBodySnapshot,
    snapshot: refreshed.result.repricedOffer,
    evidence: refreshed.evidence,
  });
  assertRecordWithinRepositoryPolicy(record, policy);
  const stored = await storeDurableOfferRecord(reviewedRepository, record);
  const persisted = deepFreeze({
    stage: "refreshed" as const,
    receiptDigest: stored.receiptDigest,
    recordDigest: record.recordDigest,
    scope: record.scope,
    retentionExpiresAt: record.retentionExpiresAt,
    search: record.search,
    snapshot: refreshed.result.repricedOffer,
    evidence: refreshed.evidence,
  });
  rehydratedDuffelOfferEvidence.add(persisted);
  return persisted;
}

export function classifyDuffelOrderCreateOutcome(input: Readonly<{
  status: number | null;
  timedOut: boolean;
  errorCode?: string | null;
}>): DuffelOrderCreateOutcome {
  const exactInput = snapshotCanonicalInput(input, "Duffel order outcome input") as typeof input;
  assertExactInputKeys(exactInput as unknown as Readonly<Record<string, unknown>>, "Duffel order outcome input", ["status", "timedOut"], ["errorCode"]);
  if (
    (exactInput.status !== null && (!Number.isSafeInteger(exactInput.status) || exactInput.status < 100 || exactInput.status > 599))
    || (exactInput.errorCode !== undefined && exactInput.errorCode !== null && !/^[a-z][a-z0-9_]{1,63}$/.test(exactInput.errorCode))
    || (exactInput.timedOut && (exactInput.status !== null || (exactInput.errorCode !== undefined && exactInput.errorCode !== null)))
    || (!exactInput.timedOut && exactInput.status !== null && exactInput.status >= 200 && exactInput.status < 300 && exactInput.errorCode !== undefined && exactInput.errorCode !== null)
  ) throw new DuffelContractError("Duffel order outcome inputs are contradictory or malformed.");
  if (exactInput.timedOut) {
    return Object.freeze({
      decision: "manual_review",
      retrySameRequest: false,
      reconciliationRequired: true,
      reason: "The order outcome is unknown after a timeout; reconcile by exact offer and webhook before any further action.",
    });
  }
  if (exactInput.status === 200 || exactInput.status === 202 || exactInput.status === 500) {
    return Object.freeze({
      decision: "manual_review",
      retrySameRequest: false,
      reconciliationRequired: true,
      reason: "This response is ambiguous for the balance-only profile and must not be retried.",
    });
  }
  if (exactInput.status === 503) {
    return Object.freeze({
      decision: "order_absent",
      retrySameRequest: false,
      reconciliationRequired: false,
      reason: "Duffel documents 503 as no supplier booking; start from a fresh search instead of replaying the same request.",
    });
  }
  if (exactInput.status === 422 && exactInput.errorCode === "offer_expired") {
    return Object.freeze({
      decision: "search_again",
      retrySameRequest: false,
      reconciliationRequired: false,
      reason: "The offer expired; obtain a new offer and new traveler acceptance.",
    });
  }
  if (exactInput.status === 422 && (exactInput.errorCode === "offer_no_longer_available" || exactInput.errorCode === "price_changed")) {
    return Object.freeze({
      decision: "search_again",
      retrySameRequest: false,
      reconciliationRequired: false,
      reason: "Availability or price changed; refresh/search and obtain exact traveler acceptance before another order attempt.",
    });
  }
  if (exactInput.status === 201) {
    return Object.freeze({
      decision: "validate_created_order",
      retrySameRequest: false,
      reconciliationRequired: false,
      reason: "A 201 response still requires exact payment, order, itinerary, and electronic-ticket evidence validation.",
    });
  }
  return Object.freeze({
    decision: "blocked",
    retrySameRequest: false,
    reconciliationRequired: true,
    reason: "The order response is outside the certified outcome matrix.",
  });
}

type DuffelOrderResponseExpectedOffer =
  | DuffelRefreshedOfferEvidence
  | DuffelTerminalRecoveryRefreshedOfferEvidence;

type DuffelOrderResponseProjectionInput<TExpectedOffer extends DuffelOrderResponseExpectedOffer> = Readonly<{
  expectedOffer: TExpectedOffer;
  acceptedTermsDigest: string;
  expectedProviderPassengerIds: readonly string[];
  retrievedAt: string;
}>;

const terminalRecoveryRefreshedOfferEvidenceKeys = Object.freeze([
  "base",
  "cabin",
  "carrierDisclosureDigests",
  "offerConditionsDigest",
  "operatingCarrierFlightNumbers",
  "providerOfferIdDigest",
  "providerPassengerIdDigests",
  "refreshReceiptDigest",
  "refreshedAt",
  "segmentIdentityDigests",
  "segmentOrderSharedTermsDigests",
  "sliceSegmentIdentityDigests",
  "sliceTermsDigests",
  "tax",
  "termsDigest",
  "total",
  "version",
] as const);

function sanitizeDuffelSandboxOrderResponseInternal(
  rawBody: Uint8Array,
  input: DuffelOrderResponseProjectionInput<DuffelOrderResponseExpectedOffer>,
  expectedOfferAuthority: "ordinary_refreshed" | "terminal_recovery",
): DuffelSanitizedOrderEvidence {
  const rawBodySnapshot = snapshotDuffelBytes(rawBody, "Duffel order response body");
  const expectedOfferReference = dataPropertyReference(
    input,
    "expectedOffer",
    "Duffel order projection input",
  ) as DuffelOrderResponseExpectedOffer;
  const exactInput = snapshotCanonicalInput(input, "Duffel order projection input") as typeof input;
  assertExactInputKeys(exactInput as unknown as Readonly<Record<string, unknown>>, "Duffel order projection input", [
    "acceptedTermsDigest", "expectedOffer", "expectedProviderPassengerIds", "retrievedAt",
  ]);
  if (expectedOfferAuthority === "ordinary_refreshed") {
    if (
      expectedOfferReference.version !== "duffel-refreshed-offer-v1"
      || !refreshedDuffelOfferEvidence.has(expectedOfferReference as object)
    ) {
      throw new DuffelContractError("Duffel order evidence requires an exact post-reprice offer receipt.");
    }
  } else {
    assertExactInputKeys(
      exactInput.expectedOffer as unknown as Readonly<Record<string, unknown>>,
      "Duffel terminal-recovery refreshed offer evidence",
      terminalRecoveryRefreshedOfferEvidenceKeys,
    );
    if (
      exactInput.expectedOffer.version !== "duffel-terminal-recovery-refreshed-offer-evidence-v1"
      || !terminalRecoveryDuffelOfferEvidence.has(expectedOfferReference as object)
    ) {
      throw new DuffelContractError("Duffel terminal order evidence requires the exact terminal-recovery offer binding.");
    }
  }
  const retrievedAt = normalizeDuffelInstant(exactInput.retrievedAt, "Duffel order retrieval time")!;
  if (
    !sha256Pattern.test(exactInput.acceptedTermsDigest)
    || exactInput.acceptedTermsDigest !== exactInput.expectedOffer.termsDigest
  ) throw new DuffelContractError("Duffel order projection is not bound to the exact caller-accepted refreshed terms digest.");
  if (Date.parse(retrievedAt) < Date.parse(exactInput.expectedOffer.refreshedAt)) {
    throw new DuffelContractError("Duffel order retrieval cannot precede the exact offer refresh receipt.");
  }
  const parsed = asRecord(parseDuffelJsonBodySnapshot(rawBodySnapshot), "Duffel order response");
  const order = asRecord(parsed.data ?? null, "Duffel order data");
  if (order.live_mode !== false) throw new DuffelContractError("Duffel sandbox order must explicitly report live_mode false.");
  const cancelledAt = Object.prototype.hasOwnProperty.call(order, "cancelled_at") ? order.cancelled_at : null;
  const cancellation = Object.prototype.hasOwnProperty.call(order, "cancellation") ? order.cancellation : null;
  if (cancelledAt !== null || cancellation !== null) {
    throw new DuffelContractError("Cancelled or cancellation-ambiguous Duffel orders cannot establish active ticketing.");
  }
  const providerOrderId = providerId(order.id, "ord", "Duffel order ID");
  const selectedOfferId = providerId(order.offer_id, "off", "Duffel order selected offer ID");
  if (digestString("duffel-provider-offer-id-v1", selectedOfferId) !== exactInput.expectedOffer.providerOfferIdDigest) {
    throw new DuffelContractError("Duffel order is bound to another offer.");
  }
  const owner = asRecord(order.owner ?? null, "Duffel order owner");
  if (owner.name !== DUFFEL_TEST_AIRLINE.ownerName || owner.iata_code !== DUFFEL_TEST_AIRLINE.iataCode) {
    throw new DuffelContractError("Duffel order owner changed from the certified sandbox offer.");
  }
  const { total, base, tax } = usdMoneyBreakdown(order, "Duffel order");
  if (
    canonicalFlightJson(total) !== canonicalFlightJson(exactInput.expectedOffer.total)
    || canonicalFlightJson(base) !== canonicalFlightJson(exactInput.expectedOffer.base)
    || canonicalFlightJson(tax) !== canonicalFlightJson(exactInput.expectedOffer.tax)
  ) {
    throw new DuffelContractError("Duffel order money breakdown changed from the refreshed accepted offer.");
  }
  const orderServices = asArray(requiredField(order, "services", "Duffel order services"), "Duffel order services");
  if (orderServices.length !== 0) throw new DuffelContractError("This offline Duffel profile refuses orders containing ancillary services.");
  const syncedAt = normalizeDuffelInstant(order.synced_at, "Duffel order synced-at")!;
  const syncAgeMs = Date.parse(retrievedAt) - Date.parse(syncedAt);
  if (!Number.isFinite(syncAgeMs) || syncAgeMs < 0 || syncAgeMs > 60_000) {
    throw new DuffelContractError("Duffel order synchronization evidence is stale or from the future.");
  }
  const createdAt = normalizeDuffelInstant(
    requiredField(order, "created_at", "Duffel order created-at"),
    "Duffel order created-at",
    false,
    true,
  )!;
  if (
    Date.parse(createdAt) < Date.parse(exactInput.expectedOffer.refreshedAt)
    || !duffelInstantsCanOccurInOrderAtReportedPrecision(createdAt, syncedAt)
  ) {
    throw new DuffelContractError("Duffel order creation must follow the accepted offer refresh and cannot follow synchronization.");
  }
  const expectedPassengerIds = [...exactInput.expectedProviderPassengerIds];
  if (
    expectedPassengerIds.length < 1 || expectedPassengerIds.length > 9
    || new Set(expectedPassengerIds).size !== expectedPassengerIds.length
    || expectedPassengerIds.some((id) => !providerIdPattern.test(id) || !id.startsWith("pas_"))
  ) throw new DuffelContractError("Expected Duffel passenger IDs are malformed.");
  const expectedPassengerDigests = expectedPassengerIds.map((id) => digestString("duffel-passenger-id-v1", id)).sort();
  if (canonicalFlightJson(expectedPassengerDigests) !== canonicalFlightJson(exactInput.expectedOffer.providerPassengerIdDigests)) {
    throw new DuffelContractError("Duffel order passengers are bound to another refreshed offer.");
  }
  const rawOrderSlices = asArray(order.slices, "Duffel order slices");
  const providerOrderSliceIds = rawOrderSlices.map((rawSlice, sliceIndex) => providerId(
    asRecord(rawSlice, `Duffel order slice ${sliceIndex + 1}`).id,
    "sli",
    `Duffel order slice ${sliceIndex + 1} ID`,
  ));
  if (new Set(providerOrderSliceIds).size !== providerOrderSliceIds.length) {
    throw new DuffelContractError("Duffel order slice IDs are duplicated within the order.");
  }
  if (rawOrderSlices.length !== exactInput.expectedOffer.sliceSegmentIdentityDigests.length) {
    throw new DuffelContractError("Duffel order itinerary slice count changed from the refreshed offer.");
  }
  const orderConditions = projectTopLevelFareConditions(
    requiredField(order, "conditions", "Duffel order conditions"),
    "Duffel order conditions",
  );
  const orderConditionsDigest = sha256FlightEvidence({
    version: "duffel-top-level-fare-conditions-v1",
    conditions: orderConditions,
  });
  const orderSegments: FlightSegment[] = [];
  const orderSegmentIdentityDigests: string[] = [];
  const orderSegmentPhaseIdentityDigests: string[] = [];
  const orderSegmentSharedTermsDigests: string[] = [];
  const orderSliceSegmentIdentityDigests: string[][] = [];
  const orderSlicePhaseIdentityDigests: string[] = [];
  const orderSliceTermsDigests: string[] = [];
  const orderCarrierDisclosureDigests: string[] = [];
  const orderDisclosures: DuffelOperatingCarrierDisclosure[] = [];
  const providerOrderSegmentIds = new Set<string>();
  const providerOrderStopIds = new Set<string>();
  let orderSegmentIndex = 0;
  rawOrderSlices.forEach((rawSlice, sliceIndex) => {
    const slice = asRecord(rawSlice, `Duffel order slice ${sliceIndex + 1}`);
    const rawSegments = asArray(slice.segments, `Duffel order slice ${sliceIndex + 1} segments`);
    if (rawSegments.length < 1 || rawSegments.length > 2) throw new DuffelContractError("Duffel order exceeds the one-connection itinerary profile.");
    const projected = rawSegments.map((segment) => projectOrderSegment(
      segment,
      orderSegmentIndex++,
      expectedPassengerIds,
      exactInput.expectedOffer.cabin,
    ));
    for (const item of projected) {
      if (providerOrderSegmentIds.has(item.providerSegmentId)) throw new DuffelContractError("Duffel order segment IDs are duplicated within the order.");
      providerOrderSegmentIds.add(item.providerSegmentId);
      for (const stopId of item.providerStopIds) {
        if (providerOrderStopIds.has(stopId)) throw new DuffelContractError("Duffel order stop IDs are duplicated within the order.");
        providerOrderStopIds.add(stopId);
      }
    }
    for (let index = 1; index < projected.length; index += 1) {
      if (projected[index - 1]!.segment.destination !== projected[index]!.segment.origin) throw new DuffelContractError("Duffel order itinerary is disconnected.");
    }
    const projectedSegmentDigests = projected.map((item) => item.identityDigest);
    orderSegments.push(...projected.map((item) => item.segment));
    orderSegmentIdentityDigests.push(...projectedSegmentDigests);
    orderSegmentPhaseIdentityDigests.push(...projected.map((item) => item.phaseIdentityDigest));
    orderSegmentSharedTermsDigests.push(...projected.map((item) => item.orderSharedTermsDigest));
    orderSliceSegmentIdentityDigests.push(projectedSegmentDigests);
    orderSlicePhaseIdentityDigests.push(sha256FlightEvidence({
      version: "duffel-order-slice-phase-identity-v1",
      sliceIdDigest: digestString("duffel-slice-id-v1", providerOrderSliceIds[sliceIndex]!),
      segmentPhaseIdentityDigests: projected.map((item) => item.phaseIdentityDigest),
    }));
    orderSliceTermsDigests.push(projectOrderSliceTerms(slice, sliceIndex, projectedSegmentDigests));
    orderCarrierDisclosureDigests.push(...projected.map((item) => item.disclosureDigest));
    orderDisclosures.push(...projected.map((item) => item.disclosure));
    projected.forEach((item, segmentIndex) => {
      if (
        item.operatingFlightNumber !== null
        && item.operatingFlightNumber !== exactInput.expectedOffer.operatingCarrierFlightNumbers[
          orderSegmentIndex - projected.length + segmentIndex
        ]
      ) {
        throw new DuffelContractError("Duffel order operating flight number changed from the refreshed accepted offer.");
      }
    });
  });
  if (
    canonicalFlightJson(orderSegmentIdentityDigests) !== canonicalFlightJson(exactInput.expectedOffer.segmentIdentityDigests)
    || canonicalFlightJson(orderSegmentSharedTermsDigests) !== canonicalFlightJson(exactInput.expectedOffer.segmentOrderSharedTermsDigests)
    || canonicalFlightJson(orderSliceSegmentIdentityDigests) !== canonicalFlightJson(exactInput.expectedOffer.sliceSegmentIdentityDigests)
    || canonicalFlightJson(orderSliceTermsDigests) !== canonicalFlightJson(exactInput.expectedOffer.sliceTermsDigests)
    || canonicalFlightJson(orderCarrierDisclosureDigests) !== canonicalFlightJson(exactInput.expectedOffer.carrierDisclosureDigests)
    || orderConditionsDigest !== exactInput.expectedOffer.offerConditionsDigest
  ) {
    throw new DuffelContractError("Duffel order itinerary or carrier disclosure changed from the refreshed accepted offer.");
  }
  asString(order.booking_reference, "Duffel booking reference", /^[A-Z0-9]{5,13}$/);
  const paymentStatus = asRecord(order.payment_status ?? null, "Duffel order payment status");
  const paidAt = normalizeDuffelInstant(paymentStatus.paid_at, "Duffel paid-at", true);
  const awaitingPayment = asBoolean(paymentStatus.awaiting_payment, "Duffel awaiting-payment status");
  if (paidAt !== null && (
    !duffelInstantsCanOccurInOrderAtReportedPrecision(createdAt, paidAt)
    || Date.parse(paidAt) > Date.parse(retrievedAt)
  )) {
    throw new DuffelContractError("Duffel payment evidence must follow order creation and cannot follow order retrieval.");
  }
  const orderPassengers = asArray(order.passengers, "Duffel order passengers").map((passenger, index) => {
    const record = asRecord(passenger, `Duffel order passenger ${index + 1}`);
    return providerId(record.id, "pas", `Duffel order passenger ${index + 1} ID`);
  });
  if (
    canonicalFlightJson([...orderPassengers].sort()) !== canonicalFlightJson([...expectedPassengerIds].sort())
  ) throw new DuffelContractError("Duffel order passenger set changed from the refreshed offer.");

  const documents = Object.prototype.hasOwnProperty.call(order, "documents")
    ? asArray(order.documents, "Duffel order documents")
    : [];
  const ticketDocumentDigests: string[] = [];
  const rawTicketIdentifiers = new Set<string>();
  const coveredPassengers = new Set<string>();
  for (const document of documents) {
    const record = asRecord(document, "Duffel order document");
    if (record.type !== "electronic_ticket") continue;
    const identifier = asString(record.unique_identifier, "Duffel electronic-ticket identifier", /^[A-Za-z0-9-]{1,64}$/);
    if (rawTicketIdentifiers.has(identifier)) throw new DuffelContractError("Duffel electronic-ticket identifier is duplicated.");
    rawTicketIdentifiers.add(identifier);
    const passengerIds = asArray(record.passenger_ids, "Duffel electronic-ticket passenger IDs").map((id) => providerId(id, "pas", "Duffel ticket passenger ID"));
    if (passengerIds.length < 1 || new Set(passengerIds).size !== passengerIds.length) {
      throw new DuffelContractError("Duffel electronic-ticket passenger coverage is malformed.");
    }
    for (const id of passengerIds) {
      if (!expectedPassengerIds.includes(id)) throw new DuffelContractError("Duffel electronic ticket references an unknown passenger.");
      coveredPassengers.add(id);
    }
    ticketDocumentDigests.push(sha256FlightEvidence({
      version: "duffel-electronic-ticket-v1",
      orderIdDigest: digestString("duffel-provider-order-id-v1", providerOrderId),
      identifier,
      passengerIdDigests: passengerIds.map((id) => digestString("duffel-passenger-id-v1", id)).sort(),
    }));
  }
  if (new Set(ticketDocumentDigests).size !== ticketDocumentDigests.length) throw new DuffelContractError("Duffel electronic-ticket documents are duplicated.");
  const coveredDigests = [...coveredPassengers].map((id) => digestString("duffel-passenger-id-v1", id)).sort();
  const everyPassengerCovered = canonicalFlightJson(coveredDigests) === canonicalFlightJson(expectedPassengerDigests);
  const ticketingEstablished = paidAt !== null && !awaitingPayment && ticketDocumentDigests.length > 0 && everyPassengerCovered;
  return deepFreeze({
    version: "duffel-sanitized-order-v1",
    providerOrderId,
    providerOrderIdDigest: digestString("duffel-provider-order-id-v1", providerOrderId),
    liveMode: false,
    selectedOfferIdDigest: exactInput.expectedOffer.providerOfferIdDigest,
    acceptedTermsDigest: exactInput.acceptedTermsDigest,
    offerRefreshReceiptDigest: exactInput.expectedOffer.refreshReceiptDigest,
    offerRefreshedAt: exactInput.expectedOffer.refreshedAt,
    bookingReferencePresent: true as const,
    passengerIdDigests: expectedPassengerDigests,
    total,
    base,
    tax,
    createdAt,
    syncedAt,
    uncancelled: true,
    itineraryDigest: sha256FlightEvidence({
      version: "duffel-order-itinerary-v1",
      segments: orderSegments,
      segmentIdentityDigests: orderSegmentIdentityDigests,
      segmentPhaseIdentityDigests: orderSegmentPhaseIdentityDigests,
      segmentOrderSharedTermsDigests: orderSegmentSharedTermsDigests,
      sliceSegmentIdentityDigests: orderSliceSegmentIdentityDigests,
      slicePhaseIdentityDigests: orderSlicePhaseIdentityDigests,
      sliceTermsDigests: orderSliceTermsDigests,
      carrierDisclosureDigests: orderCarrierDisclosureDigests,
      carrierDisclosures: orderDisclosures,
      conditions: orderConditions,
    }),
    paidAt,
    awaitingPayment,
    ticketDocumentDigests: ticketDocumentDigests.sort(),
    ticketedPassengerIdDigests: coveredDigests,
    everyPassengerCoveredByElectronicTicket: everyPassengerCovered,
    ticketingEstablished,
    rawBodyDigest: digestBytes(rawBodySnapshot),
  });
}

/**
 * Validates a current order response against the exact refreshed evidence
 * minted by the ordinary offer/reprice flow.
 */
export function sanitizeDuffelSandboxOrderResponse(
  rawBody: Uint8Array,
  input: DuffelOrderResponseProjectionInput<DuffelRefreshedOfferEvidence>,
): DuffelSanitizedOrderEvidence {
  return sanitizeDuffelSandboxOrderResponseInternal(rawBody, input, "ordinary_refreshed");
}

/**
 * Validates retained order bytes against the minimal historical binding used
 * only by terminal recovery. This evidence cannot build any provider request.
 */
export function sanitizeDuffelSandboxTerminalRecoveryOrderResponse(
  rawBody: Uint8Array,
  input: DuffelOrderResponseProjectionInput<DuffelTerminalRecoveryRefreshedOfferEvidence>,
): DuffelSanitizedOrderEvidence {
  return sanitizeDuffelSandboxOrderResponseInternal(rawBody, input, "terminal_recovery");
}

export function parseDuffelWebhookSignatureHeader(value: string): DuffelWebhookSignature {
  const match = value.match(/^t=(0|[1-9]\d{0,12}),v(?:1|2)=([0-9a-f]{64})$/);
  if (match === null) throw new DuffelContractError("Duffel webhook signature header is malformed.");
  const timestampSeconds = Number(match[1]);
  if (!Number.isSafeInteger(timestampSeconds)) throw new DuffelContractError("Duffel webhook timestamp is malformed.");
  return Object.freeze({ timestampSeconds, signatureHex: match[2]! });
}

export function buildDuffelWebhookSigningPayload(timestampSeconds: number, rawBody: Uint8Array) {
  if (!Number.isSafeInteger(timestampSeconds) || timestampSeconds < 0) throw new DuffelContractError("Duffel webhook timestamp is malformed.");
  const rawBodySnapshot = snapshotDuffelBytes(rawBody, "Duffel webhook body");
  if (rawBodySnapshot.byteLength > DUFFEL_MAX_RAW_BODY_BYTES) throw new DuffelContractError("Duffel webhook body exceeds the contract limit.");
  return Buffer.concat([Buffer.from(String(timestampSeconds), "ascii"), Buffer.from(".", "ascii"), Buffer.from(rawBodySnapshot)]);
}

export function verifyDuffelWebhookSignature(input: Readonly<{
  rawBody: Uint8Array;
  signatureHeader: string;
  secret: string | Uint8Array;
  nowSeconds: number;
  toleranceSeconds?: number;
}>): DuffelWebhookVerificationResult {
  const base = {
    freshnessPolicy: "local_300_second_policy_not_a_duffel_guarantee" as const,
  };
  let signatureHeader: string;
  let secretInput: string | Uint8Array;
  let nowSeconds: number;
  let tolerance: number;
  let rawBodySnapshot: Uint8Array;
  try {
    const exactKeys = Object.keys(Object.getOwnPropertyDescriptors(input)).sort();
    if (
      nodeTypes.isProxy(input)
      || (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)
      || Object.getOwnPropertySymbols(input).length !== 0
      || canonicalFlightJson(exactKeys) !== canonicalFlightJson(["nowSeconds", "rawBody", "secret", "signatureHeader", ...(Object.prototype.hasOwnProperty.call(input, "toleranceSeconds") ? ["toleranceSeconds"] : [])].sort())
    ) throw new Error();
    signatureHeader = dataPropertyReference(input, "signatureHeader", "Duffel webhook verification input") as string;
    secretInput = dataPropertyReference(input, "secret", "Duffel webhook verification input") as string | Uint8Array;
    nowSeconds = dataPropertyReference(input, "nowSeconds", "Duffel webhook verification input") as number;
    const toleranceInput = Object.prototype.hasOwnProperty.call(input, "toleranceSeconds")
      ? dataPropertyReference(input, "toleranceSeconds", "Duffel webhook verification input")
      : undefined;
    tolerance = toleranceInput === undefined ? DUFFEL_LOCAL_WEBHOOK_TOLERANCE_SECONDS : toleranceInput as number;
    rawBodySnapshot = snapshotDuffelBytes(
      dataPropertyReference(input, "rawBody", "Duffel webhook verification input") as Uint8Array,
      "Duffel webhook body",
    );
  } catch {
    return { ...base, verified: false, reason: "payload_rejected", bodyDigest: null, timestampSeconds: null };
  }
  let signature: DuffelWebhookSignature;
  try {
    signature = parseDuffelWebhookSignatureHeader(signatureHeader);
  } catch {
    return { ...base, verified: false, reason: "malformed_signature", bodyDigest: null, timestampSeconds: null };
  }
  let secret: Buffer;
  try {
    secret = typeof secretInput === "string"
      ? Buffer.from(secretInput, "utf8")
      : Buffer.from(snapshotDuffelBytes(secretInput, "Duffel webhook secret"));
  } catch {
    return { ...base, verified: false, reason: "missing_secret", bodyDigest: null, timestampSeconds: signature.timestampSeconds };
  }
  if (secret.byteLength < 16) return { ...base, verified: false, reason: "missing_secret", bodyDigest: null, timestampSeconds: signature.timestampSeconds };
  if (
    !Number.isSafeInteger(nowSeconds) || nowSeconds < 0
    || tolerance !== DUFFEL_LOCAL_WEBHOOK_TOLERANCE_SECONDS
  ) return { ...base, verified: false, reason: "invalid_timestamp", bodyDigest: null, timestampSeconds: signature.timestampSeconds };
  if (Math.abs(nowSeconds - signature.timestampSeconds) > tolerance) {
    return { ...base, verified: false, reason: "timestamp_outside_local_policy", bodyDigest: null, timestampSeconds: signature.timestampSeconds };
  }
  let payload: Buffer;
  try {
    payload = buildDuffelWebhookSigningPayload(signature.timestampSeconds, rawBodySnapshot);
  } catch {
    return { ...base, verified: false, reason: "payload_rejected", bodyDigest: null, timestampSeconds: signature.timestampSeconds };
  }
  const expected = createHmac("sha256", secret).update(payload).digest();
  const provided = Buffer.from(signature.signatureHex, "hex");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { ...base, verified: false, reason: "invalid_signature", bodyDigest: null, timestampSeconds: signature.timestampSeconds };
  }
  const verified = Object.freeze({
    ...base,
    verified: true,
    reason: "verified",
    bodyDigest: digestBytes(rawBodySnapshot),
    timestampSeconds: signature.timestampSeconds,
  }) satisfies DuffelWebhookVerificationResult;
  verifiedDuffelWebhookResults.add(verified);
  return verified;
}

export function sanitizeVerifiedDuffelSandboxWebhook(
  rawBody: Uint8Array,
  verification: DuffelWebhookVerificationResult,
): DuffelSanitizedWebhookEvent {
  const rawBodySnapshot = snapshotDuffelBytes(rawBody, "Duffel webhook body");
  if (
    !verifiedDuffelWebhookResults.has(verification as object)
    || !verification.verified
    || verification.bodyDigest === null
    || verification.bodyDigest !== digestBytes(rawBodySnapshot)
  ) {
    throw new DuffelContractError("Duffel webhook bytes are not bound to successful signature verification.");
  }
  const event = asRecord(parseDuffelJsonBodySnapshot(rawBodySnapshot), "Duffel webhook event");
  if (event.live_mode !== false) throw new DuffelContractError("Duffel sandbox webhook must explicitly report live_mode false.");
  const apiVersion = asString(event.api_version, "Duffel webhook API version");
  if (apiVersion !== DUFFEL_API_VERSION) throw new DuffelContractError("Duffel webhook API version is outside the v2 contract.");
  const eventId = providerId(event.id, "wev", "Duffel webhook event ID");
  const idempotencyKey = asString(event.idempotency_key, "Duffel webhook idempotency key");
  if (idempotencyKey.length < 8 || idempotencyKey.length > 256) throw new DuffelContractError("Duffel webhook idempotency key is malformed.");
  const providerEventType = asString(event.type, "Duffel webhook event type");
  const createdAt = normalizeDuffelInstant(
    event.created_at,
    "Duffel webhook creation time",
    false,
    true,
  )!;
  const known = (duffelWebhookEventTypes as readonly string[]).includes(providerEventType);
  const eventType: DuffelWebhookEventType | "unknown_quarantined" = known
    ? providerEventType as DuffelWebhookEventType
    : "unknown_quarantined";
  const semanticDigest = sha256FlightEvidence({
    version: "duffel-webhook-semantic-v1",
    liveMode: false,
    apiVersion: DUFFEL_API_VERSION,
    providerEventType,
    idempotencyKey,
    eventId,
    bodyDigest: verification.bodyDigest,
  });
  const sanitized: DuffelSanitizedWebhookEvent = deepFreeze({
    version: "duffel-sanitized-webhook-v1" as const,
    providerId: DUFFEL_SANDBOX_PROVIDER_ID,
    eventId,
    eventType,
    providerEventType,
    idempotencyKey,
    liveMode: false as const,
    apiVersion: DUFFEL_API_VERSION,
    createdAt,
    bodyDigest: verification.bodyDigest,
    semanticDigest,
    quarantined: !known,
    reconciliationRequired: true as const,
    directMutationAuthorized: false as const,
  });
  sanitizedDuffelWebhookEvents.add(sanitized);
  return sanitized;
}

function snapshotDuffelWebhookReceipt(receipt: DuffelWebhookReceipt) {
  const expectedKeys = ["bodyDigest", "eventId", "eventType", "idempotencyKey", "providerId", "semanticDigest", "status"];
  let prototype: object | null;
  let symbols: symbol[];
  let descriptors: PropertyDescriptorMap;
  try {
    if (nodeTypes.isProxy(receipt)) throw new Error();
    prototype = Object.getPrototypeOf(receipt) as object | null;
    symbols = Object.getOwnPropertySymbols(receipt);
    descriptors = Object.getOwnPropertyDescriptors(receipt);
  } catch {
    throw new DuffelContractError("Stored Duffel webhook receipt must be a non-proxy plain data object.");
  }
  if (
    (prototype !== Object.prototype && prototype !== null)
    || symbols.length !== 0
    || canonicalFlightJson(Object.keys(descriptors).sort()) !== canonicalFlightJson(expectedKeys)
    || Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !("value" in descriptor) || "get" in descriptor || "set" in descriptor)
  ) {
    throw new DuffelContractError("Stored Duffel webhook receipt has an unexpected data-only shape.");
  }
  const snapshot = Object.freeze({
    bodyDigest: descriptors.bodyDigest!.value as unknown,
    eventId: descriptors.eventId!.value as unknown,
    eventType: descriptors.eventType!.value as unknown,
    idempotencyKey: descriptors.idempotencyKey!.value as unknown,
    providerId: descriptors.providerId!.value as unknown,
    semanticDigest: descriptors.semanticDigest!.value as unknown,
    status: descriptors.status!.value as unknown,
  });
  if (
    snapshot.providerId !== DUFFEL_SANDBOX_PROVIDER_ID
    || typeof snapshot.eventId !== "string" || !providerIdPattern.test(snapshot.eventId) || !snapshot.eventId.startsWith("wev_")
    || typeof snapshot.eventType !== "string" || snapshot.eventType.length < 3 || snapshot.eventType.length > 128
    || typeof snapshot.idempotencyKey !== "string" || snapshot.idempotencyKey.length < 8 || snapshot.idempotencyKey.length > 256
    || typeof snapshot.bodyDigest !== "string" || !sha256Pattern.test(snapshot.bodyDigest)
    || typeof snapshot.semanticDigest !== "string" || !sha256Pattern.test(snapshot.semanticDigest)
    || typeof snapshot.status !== "string"
    || !(["received", "verified", "processed", "duplicate", "blocked", "failed"] as readonly string[]).includes(snapshot.status)
  ) throw new DuffelContractError("Stored Duffel webhook receipt is malformed.");
  return snapshot as DuffelWebhookReceipt;
}

export function evaluateDuffelWebhookReplay(
  incoming: DuffelSanitizedWebhookEvent,
  existing: DuffelWebhookReceipt | null,
): Readonly<{ decision: "accept" | "duplicate" | "in_progress" | "blocked" | "conflict"; reason: string }> {
  if (!sanitizedDuffelWebhookEvents.has(incoming as object)) {
    throw new DuffelContractError("Incoming Duffel webhook evidence was not produced from authenticated raw bytes.");
  }
  if (existing === null) return Object.freeze({ decision: "accept", reason: "No durable Duffel idempotency receipt exists." });
  const receipt = snapshotDuffelWebhookReceipt(existing);
  if (
    receipt.providerId !== incoming.providerId
    || receipt.idempotencyKey !== incoming.idempotencyKey
    || receipt.eventType !== incoming.providerEventType
  ) return Object.freeze({ decision: "conflict", reason: "Duffel idempotency evidence is bound to different event semantics." });
  if (
    receipt.eventId !== incoming.eventId
    || receipt.bodyDigest !== incoming.bodyDigest
    || receipt.semanticDigest !== incoming.semanticDigest
  ) return Object.freeze({ decision: "conflict", reason: "The same Duffel idempotency key is bound to different authenticated bytes." });
  if (receipt.status === "received" || receipt.status === "verified") {
    return Object.freeze({ decision: "in_progress", reason: "The identical authenticated Duffel event is already being handled." });
  }
  if (receipt.status === "processed" || receipt.status === "duplicate") {
    return Object.freeze({ decision: "duplicate", reason: "The identical authenticated Duffel event is terminal." });
  }
  return Object.freeze({ decision: "blocked", reason: "Blocked or failed Duffel evidence requires manual reconciliation." });
}
