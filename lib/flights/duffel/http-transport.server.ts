import "server-only";

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";
import {
  DUFFEL_API_BASE_URL,
  DUFFEL_API_VERSION,
  DUFFEL_ORDER_MINIMUM_TIMEOUT_MS,
  DUFFEL_SANDBOX_PROVIDER_ID,
  isDuffelSandboxOrderCreatePlan,
  isDuffelSandboxRequestPlan,
  type DuffelSandboxOrderCreatePlan,
  type DuffelSandboxRequestPlan,
} from "../duffel-sandbox-contract";
import { canonicalFlightJson } from "../runtime-safety";
import {
  validateDuffelSandboxAccessToken,
  type DuffelSandboxCredentialProvider,
} from "./credentials.server";
import {
  type DuffelAuthenticatedRequestJournal,
  type DuffelDispatchableSandboxOperation,
  type DuffelJournalCompletionInput,
  type DuffelJournalCompletionResult,
  type DuffelJournalMarkDispatchingResult,
  type DuffelSafeEndpointClass,
  type DuffelSafeRequestMetadata,
  type DuffelSandboxTrafficGate,
  type DuffelTrafficGateDecision,
} from "./telemetry.server";

export const DUFFEL_HTTP_TRANSPORT_RUNTIME = "nodejs" as const;
export const DUFFEL_MAX_OUTBOUND_BODY_BYTES = 65_536 as const;
export const DUFFEL_MAX_INBOUND_BODY_BYTES = 1_048_576 as const;
export const DUFFEL_MAX_INBOUND_CHUNKS = 4_096 as const;

const sha256Pattern = /^[0-9a-f]{64}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const providerOfferIdPattern = /^off_[A-Za-z0-9]{8,252}$/;
const fatalUtf8Decoder = new TextDecoder("utf-8", { fatal: true });
const intrinsicUint8Array = Uint8Array;
const intrinsicUint8ArrayPrototype = Uint8Array.prototype;
const intrinsicTypedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const intrinsicTypedArrayBufferGetter = Object.getOwnPropertyDescriptor(intrinsicTypedArrayPrototype, "buffer")!.get!;
const intrinsicTypedArrayByteOffsetGetter = Object.getOwnPropertyDescriptor(intrinsicTypedArrayPrototype, "byteOffset")!.get!;
const intrinsicTypedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(intrinsicTypedArrayPrototype, "byteLength")!.get!;
const intrinsicUint8ArraySet = Uint8Array.prototype.set;
const intrinsicSharedArrayBuffer = typeof SharedArrayBuffer === "undefined" ? null : SharedArrayBuffer;
const verifiedDuffelHttpTransportResults = new WeakSet<object>();

type DuffelRequestMethod = "GET" | "POST";

export type DuffelHttpDispatchRequest = Readonly<{
  url: string;
  method: DuffelRequestMethod;
  headers: Readonly<Record<string, string>>;
  body: string | null;
  redirect: "error";
  credentials: "omit";
  cache: "no-store";
  signal: AbortSignal;
}>;

export interface DuffelHttpResponseHeaders {
  get(name: string): string | null;
}

export type DuffelHttpDispatchResponse = Readonly<{
  status: number;
  url: string;
  redirected: boolean;
  headers: DuffelHttpResponseHeaders;
  body: AsyncIterable<Uint8Array> | null;
}>;

/**
 * There is deliberately no global-fetch implementation in this gate. A later
 * adapter must transmit exactly this request and must not add redirects, retry,
 * credentials, idempotency, or provider-specific headers.
 */
export interface DuffelInjectedHttpDispatcher {
  dispatch(request: DuffelHttpDispatchRequest): Promise<DuffelHttpDispatchResponse>;
}

export type DuffelHttpTransportResult = Readonly<{
  version: "duffel-http-transport-result-v1";
  operation: DuffelDispatchableSandboxOperation;
  requestDigest: string;
  status: number;
  inboundBodyBytes: number;
  responseDigest: string;
  /** Immutable exact-byte representation; use copyDuffelHttpTransportRawBody for projection. */
  rawBodyBase64: string;
  automaticRetryAttempted: false;
  idempotencyKeyIncluded: false;
}>;

export type DuffelHttpTransportErrorCode =
  | "invalid_request_plan"
  | "traffic_disabled"
  | "traffic_gate_unavailable"
  | "journal_unavailable"
  | "credential_unavailable"
  | "dispatch_claim_refused"
  | "provider_rejected"
  | "ambiguous_after_dispatch";

export class DuffelHttpTransportError extends Error {
  readonly code: DuffelHttpTransportErrorCode;
  readonly operation: DuffelDispatchableSandboxOperation | null;
  readonly requestDigest: string | null;
  readonly httpStatus: number | null;
  readonly retryDisposition: "do_not_retry" | "manual_reconciliation_required";

  constructor(input: Readonly<{
    code: DuffelHttpTransportErrorCode;
    message: string;
    operation?: DuffelDispatchableSandboxOperation;
    requestDigest?: string;
    httpStatus?: number;
    afterDispatchClaim?: boolean;
  }>) {
    super(input.message);
    this.name = "DuffelHttpTransportError";
    this.code = input.code;
    this.operation = input.operation ?? null;
    this.requestDigest = input.requestDigest ?? null;
    this.httpStatus = input.httpStatus ?? null;
    this.retryDisposition = input.afterDispatchClaim === true
      ? "manual_reconciliation_required"
      : "do_not_retry";
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      operation: this.operation,
      requestDigest: this.requestDigest,
      httpStatus: this.httpStatus,
      retryDisposition: this.retryDisposition,
    };
  }
}

type DuffelSandboxHttpTransportBaseDependencies = Readonly<{
  journal: DuffelAuthenticatedRequestJournal;
  credentials: DuffelSandboxCredentialProvider;
  dispatcher: DuffelInjectedHttpDispatcher;
}>;

export type DuffelTestHttpTransportDependencies = Readonly<{
  enabled: true;
  trafficGate: DuffelSandboxTrafficGate;
  journal: DuffelAuthenticatedRequestJournal;
  credentials: DuffelSandboxCredentialProvider;
  dispatcher: DuffelInjectedHttpDispatcher;
}>;

export interface DuffelSandboxHttpTransport {
  execute(value: unknown): Promise<DuffelHttpTransportResult>;
}

type PortMethod = (...args: never[]) => unknown;

function exactDataRecord(value: unknown, keys: readonly string[], label: string): Readonly<Record<string, unknown>> {
  if (
    value === null
    || typeof value !== "object"
    || nodeTypes.isProxy(value)
    || Object.getOwnPropertySymbols(value).length !== 0
  ) throw new TypeError(`${label} must be an exact non-proxy record.`);
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be an exact non-proxy record.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(descriptors).sort().join("\u0000") !== [...keys].sort().join("\u0000")) {
    throw new TypeError(`${label} has an invalid shape.`);
  }
  const snapshot = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
      throw new TypeError(`${label} requires enumerable data properties.`);
    }
    Object.defineProperty(snapshot, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(snapshot);
}

function capturePortMethod<T extends PortMethod>(port: unknown, methodName: string, label: string): T {
  if (port === null || typeof port !== "object" || nodeTypes.isProxy(port)) {
    throw new TypeError(`${label} must be a non-proxy object.`);
  }
  let current: object | null = port;
  while (current !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(current, methodName);
    if (descriptor !== undefined) {
      if (!("value" in descriptor) || typeof descriptor.value !== "function") {
        throw new TypeError(`${label} requires a stable data method.`);
      }
      return descriptor.value.bind(port) as T;
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  throw new TypeError(`${label} is missing.`);
}

function invalidPlan(): never {
  throw new DuffelHttpTransportError({
    code: "invalid_request_plan",
    message: "Duffel request plan is not dispatchable by this transport gate.",
  });
}

function exactObjectKeys(value: unknown, expected: readonly string[]) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value).sort().join("\u0000") === [...expected].sort().join("\u0000");
}

type ReviewedPlan = Readonly<{
  plan: DuffelSandboxRequestPlan;
  orderPlan: DuffelSandboxOrderCreatePlan | null;
  operation: DuffelDispatchableSandboxOperation;
  endpointClass: DuffelSafeEndpointClass;
  url: string;
  body: string | null;
  bodyBytes: number;
  bodyDigest: string | null;
  timeoutMs: number;
}>;

function reviewPlan(value: unknown): ReviewedPlan {
  const orderPlan = isDuffelSandboxOrderCreatePlan(value) ? value : null;
  if (orderPlan === null && !isDuffelSandboxRequestPlan(value)) invalidPlan();
  const plan: DuffelSandboxRequestPlan = orderPlan?.plan ?? (value as DuffelSandboxRequestPlan);
  if (
    plan.providerId !== DUFFEL_SANDBOX_PROVIDER_ID
    || plan.baseUrl !== DUFFEL_API_BASE_URL
    || plan.apiVersion !== DUFFEL_API_VERSION
    || plan.requiresBearerToken !== true
    || plan.bearerTokenIncluded !== false
    || plan.providerTrafficAuthorized !== false
    || plan.externalRequestMade !== false
    || plan.providerIdempotencyKeyIncluded !== false
    || !sha256Pattern.test(plan.requestDigest)
  ) invalidPlan();

  let endpointClass: DuffelSafeEndpointClass;
  let expectedHeaders: readonly string[];
  let url: URL;
  let timeoutMs: number;

  if (plan.operation === "create_offer_request") {
    if (
      plan.method !== "POST"
      || plan.path !== "/air/offer_requests"
      || plan.body === null
      || plan.minimumTimeoutMs !== 70_000
      || !exactObjectKeys(plan.query, ["return_offers", "supplier_timeout", "view"])
      || (plan.query as Record<string, unknown>).return_offers !== true
      || (plan.query as Record<string, unknown>).supplier_timeout !== 10_000
      || (plan.query as Record<string, unknown>).view !== "offers"
    ) invalidPlan();
    endpointClass = "offer_requests_collection";
    expectedHeaders = ["Accept", "Content-Type", "Duffel-Version", "Authorization"];
    timeoutMs = 70_000;
    url = new URL("/air/offer_requests", DUFFEL_API_BASE_URL);
    url.searchParams.set("return_offers", "true");
    url.searchParams.set("supplier_timeout", "10000");
    url.searchParams.set("view", "offers");
  } else if (plan.operation === "retrieve_offer") {
    const match = plan.path.match(/^\/air\/offers\/(off_[A-Za-z0-9]{8,252})$/);
    if (
      plan.method !== "GET"
      || match === null
      || !providerOfferIdPattern.test(match[1] ?? "")
      || plan.body !== null
      || plan.minimumTimeoutMs !== 30_000
      || !exactObjectKeys(plan.query, ["return_available_services"])
      || (plan.query as Record<string, unknown>).return_available_services !== true
    ) invalidPlan();
    endpointClass = "offer_resource";
    expectedHeaders = ["Accept", "Duffel-Version", "Authorization"];
    timeoutMs = 30_000;
    url = new URL(plan.path, DUFFEL_API_BASE_URL);
    url.searchParams.set("return_available_services", "true");
  } else if (plan.operation === "list_orders_by_offer") {
    if (
      plan.method !== "GET"
      || plan.path !== "/air/orders"
      || plan.body !== null
      || plan.minimumTimeoutMs !== 30_000
      || !exactObjectKeys(plan.query, ["limit", "offer_id"])
      || (plan.query as Record<string, unknown>).limit !== 50
      || typeof (plan.query as Record<string, unknown>).offer_id !== "string"
      || !providerOfferIdPattern.test((plan.query as Record<string, string>).offer_id)
    ) invalidPlan();
    endpointClass = "orders_collection";
    expectedHeaders = ["Accept", "Duffel-Version", "Authorization"];
    timeoutMs = 30_000;
    url = new URL("/air/orders", DUFFEL_API_BASE_URL);
    url.searchParams.set("offer_id", (plan.query as Record<string, string>).offer_id);
    url.searchParams.set("limit", "50");
  } else if (plan.operation === "create_order") {
    if (
      orderPlan === null
      || plan.method !== "POST"
      || plan.path !== "/air/orders"
      || plan.body === null
      || plan.minimumTimeoutMs !== DUFFEL_ORDER_MINIMUM_TIMEOUT_MS
      || !exactObjectKeys(plan.query, [])
      || orderPlan.providerTrafficAuthorized !== false
      || orderPlan.bookingAuthorized !== false
      || orderPlan.paymentAuthorized !== false
      || orderPlan.externalRequestMade !== false
      || !sha256Pattern.test(orderPlan.bridgeReceiptDigest)
      || !sha256Pattern.test(orderPlan.authorityReceiptDigest)
      || !sha256Pattern.test(orderPlan.acceptedTermsDigest)
      || !sha256Pattern.test(orderPlan.travelerBindingsDigest)
      || !sha256Pattern.test(orderPlan.settlementBindingDigest)
      || Date.parse(orderPlan.dispatchNotAfter) <= Date.parse(orderPlan.verifiedAt)
    ) invalidPlan();
    endpointClass = "orders_collection";
    expectedHeaders = ["Accept", "Content-Type", "Duffel-Version", "Authorization"];
    timeoutMs = DUFFEL_ORDER_MINIMUM_TIMEOUT_MS;
    url = new URL("/air/orders", DUFFEL_API_BASE_URL);
  } else {
    invalidPlan();
  }

  if (
    plan.requiredHeaderNames.length !== expectedHeaders.length
    || plan.requiredHeaderNames.some((header, index) => header !== expectedHeaders[index])
    || url.origin !== new URL(DUFFEL_API_BASE_URL).origin
  ) invalidPlan();

  let body: string | null = null;
  try {
    body = plan.body === null ? null : canonicalFlightJson(plan.body);
  } catch {
    invalidPlan();
  }
  const bodyBytes = body === null ? 0 : Buffer.byteLength(body, "utf8");
  if (bodyBytes > DUFFEL_MAX_OUTBOUND_BODY_BYTES) invalidPlan();
  const bodyDigest = body === null ? null : createHash("sha256").update(body, "utf8").digest("hex");

  return Object.freeze({
    plan,
    orderPlan,
    operation: plan.operation,
    endpointClass,
    url: url.toString(),
    body,
    bodyBytes,
    bodyDigest,
    timeoutMs,
  });
}

function safeMetadata(reviewed: ReviewedPlan): DuffelSafeRequestMetadata {
  return Object.freeze({
    version: "duffel-safe-request-metadata-v1" as const,
    environment: "sandbox" as const,
    operation: reviewed.operation,
    endpointClass: reviewed.endpointClass,
    method: reviewed.plan.method,
    requestDigest: reviewed.plan.requestDigest,
    requestBodyDigest: reviewed.bodyDigest,
    outboundBodyBytes: reviewed.bodyBytes,
    timeoutMs: reviewed.timeoutMs,
  });
}

function snapshotGateDecision(value: unknown): DuffelTrafficGateDecision {
  if (value !== null && typeof value === "object" && !nodeTypes.isProxy(value)) {
    const decisionDescriptor = Object.getOwnPropertyDescriptor(value, "decision");
    if (decisionDescriptor !== undefined && "value" in decisionDescriptor && decisionDescriptor.value === "denied") {
      const record = exactDataRecord(value, ["version", "decision"], "Duffel traffic-gate decision");
      if (record.version === "duffel-traffic-gate-decision-v1") {
        return Object.freeze({ version: record.version, decision: "denied" });
      }
    }
  }
  const record = exactDataRecord(
    value,
    ["version", "decision", "authorizationReceiptDigest"],
    "Duffel traffic-gate decision",
  );
  if (
    record.version !== "duffel-traffic-gate-decision-v1"
    || record.decision !== "authorized"
    || typeof record.authorizationReceiptDigest !== "string"
    || !sha256Pattern.test(record.authorizationReceiptDigest)
  ) throw new TypeError("Duffel traffic-gate decision is invalid.");
  return Object.freeze({
    version: record.version,
    decision: record.decision,
    authorizationReceiptDigest: record.authorizationReceiptDigest,
  });
}

type PreparedAttempt = Readonly<{
  attemptId: string;
  revision: 0;
  journalReceiptDigest: string;
}>;

function snapshotPreparedAttempt(value: unknown): PreparedAttempt {
  const record = exactDataRecord(
    value,
    ["version", "state", "attemptId", "revision", "journalReceiptDigest"],
    "Duffel prepared journal receipt",
  );
  if (
    record.version !== "duffel-journal-begin-result-v1"
    || record.state !== "prepared"
    || record.revision !== 0
    || typeof record.attemptId !== "string"
    || !uuidPattern.test(record.attemptId)
    || typeof record.journalReceiptDigest !== "string"
    || !sha256Pattern.test(record.journalReceiptDigest)
  ) throw new TypeError("Duffel prepared journal receipt is invalid.");
  return Object.freeze({
    attemptId: record.attemptId,
    revision: 0,
    journalReceiptDigest: record.journalReceiptDigest,
  });
}

type DispatchClaim = Readonly<{
  attemptId: string;
  revision: 1;
  dispatchReceiptDigest: string;
}>;

function snapshotDispatchClaim(value: unknown, attemptId: string): DispatchClaim | null {
  if (value !== null && typeof value === "object" && !nodeTypes.isProxy(value)) {
    const decisionDescriptor = Object.getOwnPropertyDescriptor(value, "decision");
    if (decisionDescriptor !== undefined && "value" in decisionDescriptor && decisionDescriptor.value === "refused") {
      const refused = exactDataRecord(value, ["version", "decision"], "Duffel dispatch claim");
      if (refused.version === "duffel-journal-mark-dispatching-result-v1") return null;
      throw new TypeError("Duffel dispatch claim is invalid.");
    }
  }
  const record = exactDataRecord(
    value,
    ["version", "decision", "state", "attemptId", "revision", "dispatchReceiptDigest"],
    "Duffel dispatch claim",
  );
  if (
    record.version !== "duffel-journal-mark-dispatching-result-v1"
    || record.decision !== "claimed"
    || record.state !== "dispatching"
    || record.attemptId !== attemptId
    || record.revision !== 1
    || typeof record.dispatchReceiptDigest !== "string"
    || !sha256Pattern.test(record.dispatchReceiptDigest)
  ) throw new TypeError("Duffel dispatch claim is invalid.");
  return Object.freeze({
    attemptId,
    revision: 1,
    dispatchReceiptDigest: record.dispatchReceiptDigest,
  });
}

function assertCompletionResult(
  value: unknown,
  input: DuffelJournalCompletionInput,
): DuffelJournalCompletionResult {
  const record = exactDataRecord(
    value,
    ["version", "state", "attemptId", "revision", "completionReceiptDigest"],
    "Duffel journal completion receipt",
  );
  const expectedRevision = input.expectedRevision + 1;
  if (
    record.version !== "duffel-journal-completion-result-v1"
    || record.state !== input.terminalState
    || record.attemptId !== input.attemptId
    || record.revision !== expectedRevision
    || typeof record.completionReceiptDigest !== "string"
    || !sha256Pattern.test(record.completionReceiptDigest)
  ) throw new TypeError("Duffel journal completion receipt is invalid.");
  return Object.freeze({
    version: record.version,
    state: record.state as DuffelJournalCompletionResult["state"],
    attemptId: record.attemptId,
    revision: record.revision as 1 | 2,
    completionReceiptDigest: record.completionReceiptDigest,
  });
}

type DuffelAmbiguityDetailCode =
  | "dispatch_failed"
  | "dispatch_timed_out"
  | "redirect_refused"
  | "response_origin_refused"
  | "response_invalid"
  | "response_too_large"
  | "response_body_failed"
  | "response_media_type_refused"
  | "response_utf8_refused"
  | "response_json_refused";

class PostDispatchFailure extends Error {
  readonly detailCode: DuffelAmbiguityDetailCode;
  readonly httpStatus: number | null;
  readonly bodyBytes: number | null;
  readonly responseDigest: string | null;

  constructor(
    detailCode: DuffelAmbiguityDetailCode,
    input: Readonly<{
      httpStatus?: number;
      bodyBytes?: number;
      responseDigest?: string;
    }> = {},
  ) {
    super("Duffel response could not be accepted.");
    this.name = "PostDispatchFailure";
    this.detailCode = detailCode;
    this.httpStatus = input.httpStatus ?? null;
    this.bodyBytes = input.bodyBytes ?? null;
    this.responseDigest = input.responseDigest ?? null;
  }
}

function assertJsonMediaType(value: string | null) {
  return value !== null && /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(value.trim());
}

function snapshotResponseChunk(value: unknown, remainingBytes: number): Readonly<{ bytes: Uint8Array; length: number }> {
  if (
    value === null
    || typeof value !== "object"
    || nodeTypes.isProxy(value)
    || Object.getPrototypeOf(value) !== intrinsicUint8ArrayPrototype
    || Object.getOwnPropertySymbols(value).length !== 0
  ) throw new PostDispatchFailure("response_body_failed");
  for (const key of ["buffer", "byteOffset", "byteLength", "set"] as const) {
    if (Object.prototype.hasOwnProperty.call(value, key)) throw new PostDispatchFailure("response_body_failed");
  }
  try {
    const backing = Reflect.apply(intrinsicTypedArrayBufferGetter, value, []) as ArrayBufferLike;
    const offset = Reflect.apply(intrinsicTypedArrayByteOffsetGetter, value, []) as number;
    const length = Reflect.apply(intrinsicTypedArrayByteLengthGetter, value, []) as number;
    if (
      intrinsicSharedArrayBuffer !== null && backing instanceof intrinsicSharedArrayBuffer
      || Object.getPrototypeOf(backing) !== ArrayBuffer.prototype
      || !Number.isSafeInteger(offset)
      || !Number.isSafeInteger(length)
      || offset < 0
      || length < 0
      || length > remainingBytes
    ) throw new PostDispatchFailure("response_too_large");
    const source = new intrinsicUint8Array(backing, offset, length);
    const snapshot = new intrinsicUint8Array(length);
    Reflect.apply(intrinsicUint8ArraySet, snapshot, [source]);
    if (
      Reflect.apply(intrinsicTypedArrayBufferGetter, value, []) !== backing
      || Reflect.apply(intrinsicTypedArrayByteOffsetGetter, value, []) !== offset
      || Reflect.apply(intrinsicTypedArrayByteLengthGetter, value, []) !== length
    ) throw new PostDispatchFailure("response_body_failed");
    return Object.freeze({ bytes: snapshot, length });
  } catch (error) {
    if (error instanceof PostDispatchFailure) throw error;
    throw new PostDispatchFailure("response_body_failed");
  }
}

async function readJsonResponse(
  responseValue: unknown,
  expectedUrl: string,
  signal: AbortSignal,
): Promise<Readonly<{
  status: number;
  bytes: number;
  responseDigest: string;
  rawBody: Uint8Array;
}>> {
  const response = exactDataRecord(
    responseValue,
    ["status", "url", "redirected", "headers", "body"],
    "Duffel HTTP response",
  );
  const status = response.status;
  const responseUrl = response.url;
  const redirected = response.redirected;
  if (!Number.isSafeInteger(status) || typeof status !== "number" || status < 200 || status > 599 || typeof responseUrl !== "string" || typeof redirected !== "boolean") {
    throw new PostDispatchFailure("response_invalid");
  }
  if (redirected || status >= 300 && status < 400) {
    throw new PostDispatchFailure("redirect_refused", { httpStatus: status });
  }
  let parsedResponseUrl: URL;
  try {
    parsedResponseUrl = new URL(responseUrl);
  } catch {
    throw new PostDispatchFailure("response_invalid", { httpStatus: status });
  }
  const expected = new URL(expectedUrl);
  if (parsedResponseUrl.origin !== expected.origin) {
    throw new PostDispatchFailure("response_origin_refused", { httpStatus: status });
  }
  if (parsedResponseUrl.toString() !== expected.toString()) {
    throw new PostDispatchFailure("redirect_refused", { httpStatus: status });
  }

  const headerRecord = exactDataRecord(response.headers, ["get"], "Duffel response headers");
  if (typeof headerRecord.get !== "function") throw new PostDispatchFailure("response_invalid", { httpStatus: status });
  const getHeader = headerRecord.get as (name: string) => string | null;
  let contentType: string | null;
  let contentLength: string | null;
  try {
    contentType = getHeader("content-type");
    contentLength = getHeader("content-length");
  } catch {
    throw new PostDispatchFailure("response_invalid", { httpStatus: status });
  }
  if (!assertJsonMediaType(contentType)) {
    throw new PostDispatchFailure("response_media_type_refused", { httpStatus: status });
  }
  if (contentLength !== null) {
    if (typeof contentLength !== "string" || !/^(?:0|[1-9]\d*)$/.test(contentLength)) {
      throw new PostDispatchFailure("response_invalid", { httpStatus: status });
    }
    const declaredLength = Number(contentLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength > DUFFEL_MAX_INBOUND_BODY_BYTES) {
      throw new PostDispatchFailure("response_too_large", { httpStatus: status });
    }
  }
  const body = response.body;
  if (body === null || typeof body !== "object" || nodeTypes.isProxy(body)) {
    throw new PostDispatchFailure("response_invalid", { httpStatus: status });
  }

  const chunks: Array<Readonly<{ bytes: Uint8Array; length: number }>> = [];
  let totalBytes = 0;
  try {
    if (signal.aborted) throw new PostDispatchFailure("dispatch_timed_out");
    for await (const chunk of body as AsyncIterable<unknown>) {
      if (signal.aborted) throw new PostDispatchFailure("dispatch_timed_out");
      if (chunks.length >= DUFFEL_MAX_INBOUND_CHUNKS) {
        throw new PostDispatchFailure("response_body_failed");
      }
      const snapshot = snapshotResponseChunk(chunk, DUFFEL_MAX_INBOUND_BODY_BYTES - totalBytes);
      if (snapshot.length === 0) throw new PostDispatchFailure("response_body_failed");
      totalBytes += snapshot.length;
      chunks.push(snapshot);
    }
    if (signal.aborted) throw new PostDispatchFailure("dispatch_timed_out");
  } catch (error) {
    if (error instanceof PostDispatchFailure) throw new PostDispatchFailure(error.detailCode, {
      httpStatus: status,
      bodyBytes: totalBytes,
    });
    throw new PostDispatchFailure("response_body_failed", { httpStatus: status, bodyBytes: totalBytes });
  }
  if (contentLength !== null && Number(contentLength) !== totalBytes) {
    throw new PostDispatchFailure("response_invalid", { httpStatus: status, bodyBytes: totalBytes });
  }
  const rawBody = new intrinsicUint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    Reflect.apply(intrinsicUint8ArraySet, rawBody, [chunk.bytes, offset]);
    offset += chunk.length;
  }
  const responseDigest = createHash("sha256").update(rawBody).digest("hex");
  let text: string;
  try {
    text = fatalUtf8Decoder.decode(rawBody);
  } catch {
    throw new PostDispatchFailure("response_utf8_refused", { httpStatus: status, bodyBytes: totalBytes, responseDigest });
  }
  try {
    // Syntax check only. Exact provider evidence is the owned rawBody, not this discarded parse.
    JSON.parse(text);
  } catch {
    throw new PostDispatchFailure("response_json_refused", { httpStatus: status, bodyBytes: totalBytes, responseDigest });
  }
  return Object.freeze({ status, bytes: totalBytes, responseDigest, rawBody });
}

function completion(input: DuffelJournalCompletionInput): DuffelJournalCompletionInput {
  return Object.freeze(input);
}

function safeError(input: Readonly<{
  code: DuffelHttpTransportErrorCode;
  message: string;
  reviewed: ReviewedPlan;
  httpStatus?: number;
  afterDispatchClaim?: boolean;
}>) {
  return new DuffelHttpTransportError({
    code: input.code,
    message: input.message,
    operation: input.reviewed.operation,
    requestDigest: input.reviewed.plan.requestDigest,
    httpStatus: input.httpStatus,
    afterDispatchClaim: input.afterDispatchClaim,
  });
}

type ClaimedTerminalInput =
  | Readonly<{
    state: "succeeded";
    detailCode: "completed";
    httpStatus: number;
    inboundBodyBytes: number;
    responseDigest: string;
  }>
  | Readonly<{
    state: "failed";
    detailCode: "provider_http_status";
    httpStatus: number;
    inboundBodyBytes: number;
    responseDigest: string;
  }>
  | Readonly<{
    state: "ambiguous";
    detailCode: DuffelAmbiguityDetailCode;
    httpStatus: number | null;
    inboundBodyBytes: number | null;
    responseDigest: string | null;
  }>;

class PrivateDuffelSandboxHttpTransport implements DuffelSandboxHttpTransport {
  readonly #authorize: DuffelSandboxTrafficGate["authorize"];
  readonly #journalBegin: DuffelAuthenticatedRequestJournal["begin"];
  readonly #markDispatching: DuffelAuthenticatedRequestJournal["markDispatching"];
  readonly #journalComplete: DuffelAuthenticatedRequestJournal["complete"];
  readonly #readToken: DuffelSandboxCredentialProvider["readSandboxAccessToken"];
  readonly #dispatch: DuffelInjectedHttpDispatcher["dispatch"];

  private constructor(
    dependencies: DuffelSandboxHttpTransportBaseDependencies,
    trafficGate: DuffelSandboxTrafficGate,
  ) {
    this.#authorize = capturePortMethod(trafficGate, "authorize", "Duffel traffic gate");
    this.#journalBegin = capturePortMethod(dependencies.journal, "begin", "Duffel request journal begin");
    this.#markDispatching = capturePortMethod(dependencies.journal, "markDispatching", "Duffel request journal dispatch claim");
    this.#journalComplete = capturePortMethod(dependencies.journal, "complete", "Duffel request journal completion");
    this.#readToken = capturePortMethod(dependencies.credentials, "readSandboxAccessToken", "Duffel credential provider");
    this.#dispatch = capturePortMethod(dependencies.dispatcher, "dispatch", "Duffel HTTP dispatcher");
  }

  static createTest(input: unknown): PrivateDuffelSandboxHttpTransport {
    const dependencies = exactDataRecord(
      input,
      ["enabled", "trafficGate", "journal", "credentials", "dispatcher"],
      "Duffel test transport dependencies",
    );
    if (dependencies.enabled !== true) throw new TypeError("Duffel test transport requires an explicit test-only enablement literal.");
    return new PrivateDuffelSandboxHttpTransport(
      dependencies as DuffelTestHttpTransportDependencies,
      dependencies.trafficGate as DuffelSandboxTrafficGate,
    );
  }

  async #completeExact(input: DuffelJournalCompletionInput): Promise<void> {
    const result = await this.#journalComplete(input);
    assertCompletionResult(result, input);
  }

  async #blockPrepared(
    reviewed: ReviewedPlan,
    attempt: PreparedAttempt,
    detailCode: "credential_unavailable" | "dispatch_claim_refused",
  ): Promise<void> {
    await this.#completeExact(completion({
      version: "duffel-journal-completion-v1",
      attemptId: attempt.attemptId,
      expectedRevision: 0,
      journalReceiptDigest: attempt.journalReceiptDigest,
      dispatchReceiptDigest: null,
      requestDigest: reviewed.plan.requestDigest,
      terminalState: "blocked",
      detailCode,
      httpStatus: null,
      inboundBodyBytes: null,
      responseDigest: null,
    }));
  }

  async #recordClaimedTerminal(
    reviewed: ReviewedPlan,
    attempt: PreparedAttempt,
    claim: DispatchClaim,
    input: ClaimedTerminalInput,
  ): Promise<void> {
    const identity = {
      version: "duffel-journal-completion-v1" as const,
      attemptId: attempt.attemptId,
      expectedRevision: 1 as const,
      journalReceiptDigest: attempt.journalReceiptDigest,
      dispatchReceiptDigest: claim.dispatchReceiptDigest,
      requestDigest: reviewed.plan.requestDigest,
    };
    let terminal: DuffelJournalCompletionInput;
    if (input.state === "ambiguous") {
      terminal = {
        ...identity,
        terminalState: "ambiguous",
        detailCode: input.detailCode,
        httpStatus: null,
        inboundBodyBytes: null,
        responseDigest: null,
      };
    } else if (input.state === "succeeded") {
      terminal = {
        ...identity,
        terminalState: "succeeded",
        detailCode: "completed",
        httpStatus: input.httpStatus,
        inboundBodyBytes: input.inboundBodyBytes,
        responseDigest: input.responseDigest,
      };
    } else {
      terminal = {
        ...identity,
        terminalState: "failed",
        detailCode: "provider_http_status",
        httpStatus: input.httpStatus,
        inboundBodyBytes: input.inboundBodyBytes,
        responseDigest: input.responseDigest,
      };
    }
    await this.#completeExact(completion(terminal));
  }

  async execute(value: unknown): Promise<DuffelHttpTransportResult> {
    const reviewed = reviewPlan(value);
    const metadata = safeMetadata(reviewed);
    let gateDecision: DuffelTrafficGateDecision;
    try {
      gateDecision = snapshotGateDecision(await this.#authorize(metadata));
    } catch {
      throw safeError({
        code: "traffic_gate_unavailable",
        message: "Duffel sandbox traffic gate is unavailable.",
        reviewed,
      });
    }
    if (gateDecision.decision === "denied") {
      throw safeError({
        code: "traffic_disabled",
        message: "Duffel sandbox provider traffic is disabled.",
        reviewed,
      });
    }
    const authorizationReceiptDigest = gateDecision.authorizationReceiptDigest;

    let attempt: PreparedAttempt;
    try {
      attempt = snapshotPreparedAttempt(await this.#journalBegin(Object.freeze({
        version: "duffel-journal-begin-v1" as const,
        metadata,
        authorizationReceiptDigest,
      })));
    } catch {
      throw safeError({
        code: "journal_unavailable",
        message: "Duffel request journal is unavailable.",
        reviewed,
      });
    }

    let token: string;
    try {
      token = validateDuffelSandboxAccessToken(await this.#readToken(Object.freeze({
        version: "duffel-sandbox-token-request-v1" as const,
        requestDigest: reviewed.plan.requestDigest,
        authorizationReceiptDigest,
        journalReceiptDigest: attempt.journalReceiptDigest,
      })));
    } catch {
      try {
        await this.#blockPrepared(reviewed, attempt, "credential_unavailable");
      } catch {
        throw safeError({
          code: "journal_unavailable",
          message: "Duffel request journal is unavailable.",
          reviewed,
        });
      }
      throw safeError({
        code: "credential_unavailable",
        message: "Duffel sandbox credential is unavailable.",
        reviewed,
      });
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Duffel-Version": DUFFEL_API_VERSION,
    };
    if (reviewed.body !== null) headers["Content-Type"] = "application/json";
    const abortController = new AbortController();
    const request = Object.freeze({
      url: reviewed.url,
      method: reviewed.plan.method,
      headers: Object.freeze(headers),
      body: reviewed.body,
      redirect: "error" as const,
      credentials: "omit" as const,
      cache: "no-store" as const,
      signal: abortController.signal,
    });

    let claim: DispatchClaim | null;
    try {
      const claimValue: DuffelJournalMarkDispatchingResult = await this.#markDispatching(Object.freeze({
        version: "duffel-journal-mark-dispatching-v1" as const,
        attemptId: attempt.attemptId,
        expectedRevision: 0 as const,
        journalReceiptDigest: attempt.journalReceiptDigest,
        requestDigest: reviewed.plan.requestDigest,
        authorizationReceiptDigest,
      }));
      claim = snapshotDispatchClaim(claimValue, attempt.attemptId);
    } catch {
      throw safeError({
        code: "journal_unavailable",
        message: "Duffel dispatch claim is unavailable; no HTTP dispatch was attempted.",
        reviewed,
        afterDispatchClaim: true,
      });
    }
    if (claim === null) {
      try {
        await this.#blockPrepared(reviewed, attempt, "dispatch_claim_refused");
      } catch {
        throw safeError({
          code: "journal_unavailable",
          message: "Duffel request journal is unavailable.",
          reviewed,
        });
      }
      throw safeError({
        code: "dispatch_claim_refused",
        message: "Duffel dispatch claim was refused; no HTTP dispatch was attempted.",
        reviewed,
      });
    }

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const operationDeadline = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        abortController.abort();
        reject(new PostDispatchFailure("dispatch_timed_out"));
      }, reviewed.timeoutMs);
    });
    let response: DuffelHttpDispatchResponse;
    try {
      response = await Promise.race([this.#dispatch(request), operationDeadline]);
    } catch (error) {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      const failure = error instanceof PostDispatchFailure
        ? error
        : new PostDispatchFailure("dispatch_failed");
      try {
        await this.#recordClaimedTerminal(reviewed, attempt, claim, {
          state: "ambiguous",
          detailCode: failure.detailCode,
          httpStatus: failure.httpStatus,
          inboundBodyBytes: failure.bodyBytes,
          responseDigest: failure.responseDigest,
        });
      } catch {
        // A failed terminal CAS remains manual-reconciliation-only ambiguity.
      }
      throw safeError({
        code: "ambiguous_after_dispatch",
        message: "Duffel request outcome is ambiguous after dispatch claim.",
        reviewed,
        afterDispatchClaim: true,
      });
    }

    let accepted: Awaited<ReturnType<typeof readJsonResponse>>;
    try {
      accepted = await Promise.race([
        readJsonResponse(response, reviewed.url, abortController.signal),
        operationDeadline,
      ]);
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    } catch (error) {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      const failure = error instanceof PostDispatchFailure
        ? error
        : new PostDispatchFailure("response_invalid");
      try {
        await this.#recordClaimedTerminal(reviewed, attempt, claim, {
          state: "ambiguous",
          detailCode: failure.detailCode,
          httpStatus: failure.httpStatus,
          inboundBodyBytes: failure.bodyBytes,
          responseDigest: failure.responseDigest,
        });
      } catch {
        // A failed terminal CAS remains manual-reconciliation-only ambiguity.
      }
      throw safeError({
        code: "ambiguous_after_dispatch",
        message: "Duffel request outcome is ambiguous after dispatch claim.",
        reviewed,
        httpStatus: failure.httpStatus ?? undefined,
        afterDispatchClaim: true,
      });
    }

    if (accepted.status < 200 || accepted.status >= 300) {
      try {
        await this.#recordClaimedTerminal(reviewed, attempt, claim, {
          state: "failed",
          detailCode: "provider_http_status",
          httpStatus: accepted.status,
          inboundBodyBytes: accepted.bytes,
          responseDigest: accepted.responseDigest,
        });
      } catch {
        throw safeError({
          code: "ambiguous_after_dispatch",
          message: "Duffel request outcome is ambiguous after dispatch claim.",
          reviewed,
          httpStatus: accepted.status,
          afterDispatchClaim: true,
        });
      }
      throw safeError({
        code: "provider_rejected",
        message: "Duffel sandbox request was rejected.",
        reviewed,
        httpStatus: accepted.status,
        afterDispatchClaim: true,
      });
    }

    try {
      await this.#recordClaimedTerminal(reviewed, attempt, claim, {
        state: "succeeded",
        detailCode: "completed",
        httpStatus: accepted.status,
        inboundBodyBytes: accepted.bytes,
        responseDigest: accepted.responseDigest,
      });
    } catch {
      throw safeError({
        code: "ambiguous_after_dispatch",
        message: "Duffel request outcome is ambiguous after dispatch claim.",
        reviewed,
        httpStatus: accepted.status,
        afterDispatchClaim: true,
      });
    }

    const result = Object.freeze({
      version: "duffel-http-transport-result-v1" as const,
      operation: reviewed.operation,
      requestDigest: reviewed.plan.requestDigest,
      status: accepted.status,
      inboundBodyBytes: accepted.bytes,
      responseDigest: accepted.responseDigest,
      rawBodyBase64: Buffer.from(accepted.rawBody).toString("base64"),
      automaticRetryAttempted: false as const,
      idempotencyKeyIncluded: false as const,
    });
    verifiedDuffelHttpTransportResults.add(result);
    return result;
  }
}

class DisabledDuffelSandboxHttpTransport implements DuffelSandboxHttpTransport {
  static readonly instance: DuffelSandboxHttpTransport = Object.freeze(new DisabledDuffelSandboxHttpTransport());

  private constructor() {}

  async execute(value: unknown): Promise<DuffelHttpTransportResult> {
    const reviewed = reviewPlan(value);
    throw safeError({
      code: "traffic_disabled",
      message: "Duffel sandbox provider traffic is disabled.",
      reviewed,
    });
  }
}

/** The only default construction path is no-argument and captures no capabilities. */
export function createDisabledDuffelHttpTransport(): DuffelSandboxHttpTransport {
  return DisabledDuffelSandboxHttpTransport.instance;
}

/** Explicit injected test gate only; no application route imports or constructs this boundary. */
export function createDuffelTestHttpTransport(
  dependencies: DuffelTestHttpTransportDependencies,
): DuffelSandboxHttpTransport {
  return PrivateDuffelSandboxHttpTransport.createTest(dependencies);
}

/**
 * Returns a fresh owned byte copy only for a process-local verified result and
 * revalidates canonical base64, length, and digest before every copy.
 */
export function copyDuffelHttpTransportRawBody(value: unknown): Uint8Array {
  if (
    value === null
    || typeof value !== "object"
    || !verifiedDuffelHttpTransportResults.has(value)
  ) throw new TypeError("Duffel HTTP result is not a verified process-local receipt.");
  const record = exactDataRecord(value, [
    "version",
    "operation",
    "requestDigest",
    "status",
    "inboundBodyBytes",
    "responseDigest",
    "rawBodyBase64",
    "automaticRetryAttempted",
    "idempotencyKeyIncluded",
  ], "Duffel HTTP result");
  if (
    record.version !== "duffel-http-transport-result-v1"
    || typeof record.rawBodyBase64 !== "string"
    || typeof record.inboundBodyBytes !== "number"
    || !Number.isSafeInteger(record.inboundBodyBytes)
    || record.inboundBodyBytes < 0
    || record.inboundBodyBytes > DUFFEL_MAX_INBOUND_BODY_BYTES
    || typeof record.responseDigest !== "string"
    || !sha256Pattern.test(record.responseDigest)
  ) throw new TypeError("Duffel HTTP result body receipt is invalid.");
  const decoded = Buffer.from(record.rawBodyBase64, "base64");
  if (
    decoded.toString("base64") !== record.rawBodyBase64
    || decoded.byteLength !== record.inboundBodyBytes
    || createHash("sha256").update(decoded).digest("hex") !== record.responseDigest
  ) throw new TypeError("Duffel HTTP result body receipt is invalid.");
  const copy = new intrinsicUint8Array(decoded.byteLength);
  Reflect.apply(intrinsicUint8ArraySet, copy, [decoded]);
  return copy;
}
