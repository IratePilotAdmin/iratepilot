import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "../../supabase/admin";
import {
  DUFFEL_MAX_RAW_BODY_BYTES,
  DuffelContractError,
  parseDuffelJsonBody,
} from "../duffel-sandbox-contract";
import type { FlightCanonicalJsonValue } from "../runtime-safety";
import { validateDuffelSandboxAccessToken } from "./credentials.server";

const PREVIEW_PROJECT_REF = "eiqmdldjnedqgbtoozqa";
const PREVIEW_SUPABASE_URL = `https://${PREVIEW_PROJECT_REF}.supabase.co`;
const RECONCILIATION_URL = "https://api.duffel.com/air/orders?limit=10&sort=-created_at&passenger_name[]=Synthetic&passenger_name[]=Traveler";
const ORDER_CREATED_AT_FLOOR = "2026-08-25T18:23:00.000Z";
const EXPECTED_ORIGIN = "ORD";
const EXPECTED_DESTINATION = "MIA";
const EXPECTED_DEPARTURE_DATE = "2026-11-05";
const EXPECTED_GIVEN_NAME = "Synthetic";
const EXPECTED_FAMILY_NAME = "Traveler";
const DUFFEL_REQUEST_TIMEOUT_MS = 30_000;

const EXPECTED_RUNTIME_CONTROL = Object.freeze({
  control_key: "global",
  execution_kill_switch_engaged: true,
  synthetic_execution_enabled: false,
  provider_sandbox_traffic_enabled: false,
  provider_live_traffic_enabled: false,
  shopping_enabled: false,
  order_enabled: false,
  payment_enabled: false,
  ticketing_enabled: false,
  servicing_enabled: false,
  provider_events_enabled: false,
  production_release_enabled: false,
  bound_environment: "preview",
  bound_project_ref: PREVIEW_PROJECT_REF,
  bound_database_name: "postgres",
  bound_session_user: "authenticator",
  bound_provider_code: "duffel",
  bound_provider_account_sha256: "4042ef85e7f76551315599ba93d1b6ebcabc6bd234f7028e904bbefef4717ded",
  bound_point_of_sale: "US",
  bound_content_scope_sha256: "6068aef35776b9f0b327e2ef1e1713c46d065f07cd234671d5cff55ca49a5f4f",
  bound_adapter_version_sha256: "ef1dc66c6661c1dfa8b4cf23462d6fdb4cb7d2900aafde92777856327a7adc5f",
  bound_payment_processor_code: "duffel_balance",
  bound_payment_account_sha256: "977baedaa2f75b01ec8c574462da33605b83abea43de526d7b6b6708e192ba1a",
  bound_payment_environment: "test",
  bound_payment_source_sha256: "d08b01e8d463516f8fdfab9f0b67aef7b90641830635697c05e89abf898ecf1a",
  bound_payment_adapter_version_sha256: "4bc675487d35646ca013c121797b373ed9ebfb3beb68affcdcd0124faa474734",
  bound_execution_scope_sha256: "507b96b7d08058645d2c9717338c9b87cf09f836e5b78bc31ae19dfc977fad4b",
  activation_evidence_sha256: "366590876dc9b25bcf4182386320777b900b2fdf18206e11296a18d97e215892",
});

const CONTROL_COLUMNS = Object.freeze(Object.keys(EXPECTED_RUNTIME_CONTROL));
const CONTROL_SELECT = CONTROL_COLUMNS.join(",");
const instantPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;
const localDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const providerOrderIdPattern = /^ord_[A-Za-z0-9]{8,252}$/;
const bookingReferencePattern = /^[A-Z0-9]{5,13}$/;
const passengerNamePattern = /^[A-Za-z][A-Za-z '-]{0,63}$/;
const documentTypePattern = /^[a-z][a-z0-9_]{0,63}$/;
const exactUsdPattern = /^(0|[1-9]\d{0,10})\.(\d{2})$/;

type CanonicalRecord = Readonly<Record<string, FlightCanonicalJsonValue>>;

export type DuffelPreviewOrderReconciliationResult = Readonly<{
  mode: "duffel_test_mode";
  operation: "list_orders_read_only";
  matchCount: 1;
  providerOrderId: string;
  createdAt: string;
  bookingReferenceDigest: string;
  total: Readonly<{ currency: "USD"; amountMinor: number }>;
  paymentStatus: Readonly<{ awaitingPayment: boolean; paidAt: string | null }>;
  ticketDocuments: Readonly<{ count: number; types: readonly string[] }>;
  cancellation: Readonly<{
    cancelled: boolean;
    cancelledAt: string | null;
    cancellationRecordPresent: boolean;
  }>;
  route: Readonly<{
    origin: "ORD";
    destination: "MIA";
    departureDate: "2026-11-05";
  }>;
  rawResponseSha256: string;
  rawResponseBytes: number;
  externalProviderRead: true;
  externalMutationAttempted: false;
  automaticRetryAttempted: false;
}>;

function fail(message: string): never {
  throw new DuffelContractError(message);
}

function asRecord(value: FlightCanonicalJsonValue | undefined, label: string): CanonicalRecord {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.prototype.hasOwnProperty.call(value, "$duffelExactDecimalLexeme")
  ) fail(`${label} is malformed.`);
  return value as CanonicalRecord;
}

function asArray(value: FlightCanonicalJsonValue | undefined, label: string) {
  if (!Array.isArray(value)) fail(`${label} is malformed.`);
  return value;
}

function asString(value: FlightCanonicalJsonValue | undefined, label: string, pattern: RegExp) {
  if (typeof value !== "string" || !pattern.test(value)) fail(`${label} is malformed.`);
  return value;
}

function asBoolean(value: FlightCanonicalJsonValue | undefined, label: string) {
  if (typeof value !== "boolean") fail(`${label} is malformed.`);
  return value;
}

function assertCalendarFields(match: RegExpMatchArray, label: string) {
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const candidate = new Date(Date.UTC(year!, month! - 1, day!, hour!, minute!, second!));
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() + 1 !== month
    || candidate.getUTCDate() !== day
    || candidate.getUTCHours() !== hour
    || candidate.getUTCMinutes() !== minute
    || candidate.getUTCSeconds() !== second
  ) fail(`${label} is malformed.`);
}

function normalizeInstant(value: FlightCanonicalJsonValue | undefined, label: string) {
  const text = asString(value, label, instantPattern);
  const match = text.match(instantPattern)!;
  assertCalendarFields(match, label);
  if (match[8] !== "Z") {
    const [offsetHour, offsetMinute] = match[8]!.slice(1).split(":").map(Number);
    if (offsetHour! > 23 || offsetMinute! > 59) fail(`${label} is malformed.`);
  }
  const epoch = Date.parse(text);
  if (!Number.isFinite(epoch)) fail(`${label} is malformed.`);
  return new Date(epoch).toISOString();
}

function optionalInstant(value: FlightCanonicalJsonValue | undefined, label: string) {
  if (value === undefined || value === null) return null;
  return normalizeInstant(value, label);
}

function locationCode(value: FlightCanonicalJsonValue | undefined, label: string) {
  if (typeof value === "string") return asString(value, label, /^[A-Z]{3}$/);
  return asString(asRecord(value, label).iata_code, label, /^[A-Z]{3}$/);
}

function localDateTime(value: FlightCanonicalJsonValue | undefined, label: string) {
  const text = asString(value, label, localDateTimePattern);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/)!;
  assertCalendarFields(match, label);
  return text;
}

function projectRoute(order: CanonicalRecord, index: number) {
  const slices = asArray(order.slices, `Duffel order ${index} slices`);
  if (slices.length !== 1) fail(`Duffel order ${index} route is malformed.`);
  const slice = asRecord(slices[0], `Duffel order ${index} slice`);
  const segments = asArray(slice.segments, `Duffel order ${index} segments`);
  if (segments.length < 1 || segments.length > 2) fail(`Duffel order ${index} route is malformed.`);
  const projected = segments.map((value, segmentIndex) => {
    const segment = asRecord(value, `Duffel order ${index} segment ${segmentIndex + 1}`);
    const departingAt = localDateTime(
      segment.departing_at,
      `Duffel order ${index} departure`,
    );
    return Object.freeze({
      origin: locationCode(segment.origin, `Duffel order ${index} origin`),
      destination: locationCode(segment.destination, `Duffel order ${index} destination`),
      departingAt,
    });
  });
  for (let segmentIndex = 1; segmentIndex < projected.length; segmentIndex += 1) {
    if (projected[segmentIndex - 1]!.destination !== projected[segmentIndex]!.origin) {
      fail(`Duffel order ${index} route is disconnected.`);
    }
  }
  return Object.freeze({
    origin: projected[0]!.origin,
    destination: projected.at(-1)!.destination,
    departureDate: projected[0]!.departingAt.slice(0, 10),
  });
}

function hasExpectedSyntheticTraveler(order: CanonicalRecord, index: number) {
  const passengers = asArray(order.passengers, `Duffel order ${index} passengers`);
  if (passengers.length !== 1) {
    fail(`Duffel order ${index} passengers are malformed.`);
  }
  return passengers.every((value, passengerIndex) => {
    const passenger = asRecord(
      value,
      `Duffel order ${index} passenger ${passengerIndex + 1}`,
    );
    const givenName = asString(
      passenger.given_name,
      `Duffel order ${index} passenger given name`,
      passengerNamePattern,
    );
    const familyName = asString(
      passenger.family_name,
      `Duffel order ${index} passenger family name`,
      passengerNamePattern,
    );
    return givenName === EXPECTED_GIVEN_NAME && familyName === EXPECTED_FAMILY_NAME;
  });
}

function projectTotal(order: CanonicalRecord) {
  if (order.total_currency !== "USD") fail("Duffel order total currency is malformed.");
  const amount = asString(order.total_amount, "Duffel order total amount", exactUsdPattern);
  const match = amount.match(exactUsdPattern)!;
  const amountMinor = Number(match[1]) * 100 + Number(match[2]);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    fail("Duffel order total amount is malformed.");
  }
  return Object.freeze({ currency: "USD" as const, amountMinor });
}

function projectPaymentStatus(order: CanonicalRecord, createdAt: string) {
  const status = asRecord(order.payment_status, "Duffel order payment status");
  const awaitingPayment = asBoolean(
    status.awaiting_payment,
    "Duffel order awaiting-payment status",
  );
  const paidAt = optionalInstant(status.paid_at, "Duffel order paid-at");
  if (awaitingPayment && paidAt !== null) {
    fail("Duffel order payment status is internally inconsistent.");
  }
  if (paidAt !== null) {
    const paidAtMs = Date.parse(paidAt);
    const createdAtMs = Date.parse(createdAt);
    if (
      paidAtMs < createdAtMs
      && Math.floor(paidAtMs / 1_000) !== Math.floor(createdAtMs / 1_000)
    ) fail("Duffel order payment status is chronologically invalid.");
  }
  return Object.freeze({ awaitingPayment, paidAt });
}

function projectTicketDocuments(order: CanonicalRecord) {
  const documents = order.documents === undefined
    ? []
    : asArray(order.documents, "Duffel order documents");
  if (documents.length > 50) fail("Duffel order documents exceed the reconciliation limit.");
  const types = documents.map((value, index) => asString(
    asRecord(value, `Duffel order document ${index + 1}`).type,
    `Duffel order document ${index + 1} type`,
    documentTypePattern,
  ));
  return Object.freeze({
    count: documents.length,
    types: Object.freeze([...new Set(types)].sort()),
  });
}

function projectCancellation(order: CanonicalRecord) {
  const cancelledAt = optionalInstant(order.cancelled_at, "Duffel order cancelled-at");
  const cancellation = order.cancellation;
  if (cancellation !== undefined && cancellation !== null) {
    asRecord(cancellation, "Duffel order cancellation");
  }
  const cancellationRecordPresent = cancellation !== undefined && cancellation !== null;
  return Object.freeze({
    cancelled: cancelledAt !== null || cancellationRecordPresent,
    cancelledAt,
    cancellationRecordPresent,
  });
}

function bookingReferenceDigest(value: FlightCanonicalJsonValue | undefined) {
  const reference = asString(
    value,
    "Duffel order booking reference",
    bookingReferencePattern,
  );
  return createHash("sha256")
    .update("duffel-booking-reference-v1\0", "utf8")
    .update(reference, "utf8")
    .digest("hex");
}

function parseContentLength(response: Response) {
  const value = response.headers.get("content-length");
  if (value === null) return null;
  if (!/^(0|[1-9]\d{0,6})$/.test(value)) fail("Duffel response content length is malformed.");
  const length = Number(value);
  if (!Number.isSafeInteger(length) || length > DUFFEL_MAX_RAW_BODY_BYTES) {
    fail("Duffel response body exceeds the reconciliation limit.");
  }
  return length;
}

async function readBoundedResponseBody(response: Response) {
  const declaredLength = parseContentLength(response);
  if (response.body === null) fail("Duffel response body is missing.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      if (!(item.value instanceof Uint8Array)) fail("Duffel response body chunk is malformed.");
      byteLength += item.value.byteLength;
      if (byteLength > DUFFEL_MAX_RAW_BODY_BYTES) {
        await reader.cancel();
        fail("Duffel response body exceeds the reconciliation limit.");
      }
      const snapshot = new Uint8Array(item.value.byteLength);
      snapshot.set(item.value);
      chunks.push(snapshot);
    }
  } finally {
    reader.releaseLock();
  }
  if (byteLength === 0) fail("Duffel response body is missing.");
  const contentEncoding = response.headers.get("content-encoding")?.trim().toLowerCase() ?? null;
  if (
    declaredLength !== null
    && (contentEncoding === null || contentEncoding === "identity")
    && declaredLength !== byteLength
  ) fail("Duffel response content length does not match its body.");
  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function assertResponseEnvelope(response: Response) {
  if (
    response.status !== 200
    || response.redirected
    || response.url !== RECONCILIATION_URL
  ) fail("Duffel reconciliation response status or location is invalid.");
  const contentType = response.headers.get("content-type")?.trim() ?? "";
  if (!/^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i.test(contentType)) {
    fail("Duffel reconciliation response content type is invalid.");
  }
}

function projectReconciliationBody(rawBody: Uint8Array): Omit<
  DuffelPreviewOrderReconciliationResult,
  "mode" | "operation" | "rawResponseSha256" | "rawResponseBytes"
  | "externalProviderRead" | "externalMutationAttempted" | "automaticRetryAttempted"
> {
  const parsed = asRecord(parseDuffelJsonBody(rawBody), "Duffel order-list response");
  const metadata = asRecord(parsed.meta, "Duffel order-list metadata");
  if (
    metadata.before !== null
    || metadata.after !== null
    || metadata.limit !== 10
  ) fail("Duffel order-list pagination is incomplete.");
  const orders = asArray(parsed.data, "Duffel order-list data");
  if (orders.length > 10) fail("Duffel order-list data exceeds its requested limit.");

  const ids = new Set<string>();
  const matches: Array<Readonly<{
    order: CanonicalRecord;
    providerOrderId: string;
    createdAt: string;
    route: Readonly<{ origin: string; destination: string; departureDate: string }>;
  }>> = [];
  orders.forEach((value, offset) => {
    const index = offset + 1;
    const order = asRecord(value, `Duffel order ${index}`);
    const providerOrderId = asString(
      order.id,
      `Duffel order ${index} ID`,
      providerOrderIdPattern,
    );
    if (ids.has(providerOrderId)) fail("Duffel order-list contains a duplicate order ID.");
    ids.add(providerOrderId);
    const liveMode = asBoolean(order.live_mode, `Duffel order ${index} live mode`);
    const createdAt = normalizeInstant(order.created_at, `Duffel order ${index} created-at`);
    const route = projectRoute(order, index);
    const syntheticTraveler = hasExpectedSyntheticTraveler(order, index);
    if (
      liveMode === false
      && Date.parse(createdAt) >= Date.parse(ORDER_CREATED_AT_FLOOR)
      && syntheticTraveler
      && route.origin === EXPECTED_ORIGIN
      && route.destination === EXPECTED_DESTINATION
      && route.departureDate === EXPECTED_DEPARTURE_DATE
    ) matches.push(Object.freeze({ order, providerOrderId, createdAt, route }));
  });
  if (matches.length !== 1) fail("Duffel V8 order reconciliation is not uniquely matched.");
  const match = matches[0]!;
  return Object.freeze({
    matchCount: 1 as const,
    providerOrderId: match.providerOrderId,
    createdAt: match.createdAt,
    bookingReferenceDigest: bookingReferenceDigest(match.order.booking_reference),
    total: projectTotal(match.order),
    paymentStatus: projectPaymentStatus(match.order, match.createdAt),
    ticketDocuments: projectTicketDocuments(match.order),
    cancellation: projectCancellation(match.order),
    route: Object.freeze({
      origin: EXPECTED_ORIGIN,
      destination: EXPECTED_DESTINATION,
      departureDate: EXPECTED_DEPARTURE_DATE,
    }),
  });
}

async function requireExactRuntimeControl() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("flight_runtime_controls")
    .select(CONTROL_SELECT)
    .eq("control_key", "global")
    .limit(2);
  if (error !== null || !Array.isArray(data) || data.length !== 1) {
    throw new Error("Duffel Preview reconciliation controls are unavailable.");
  }
  const row = data[0];
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    throw new Error("Duffel Preview reconciliation controls are invalid.");
  }
  const actualKeys = Object.keys(row).sort();
  const expectedKeys = [...CONTROL_COLUMNS].sort();
  if (
    actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])
    || Object.entries(EXPECTED_RUNTIME_CONTROL).some(([key, value]) => (
      (row as Record<string, unknown>)[key] !== value
    ))
  ) throw new Error("Duffel Preview reconciliation controls are not exactly locked.");
}

function readAccessToken() {
  return validateDuffelSandboxAccessToken(process.env.DUFFEL_TEST_ACCESS_TOKEN);
}

export async function executeDuffelPreviewOrderReconciliation(): Promise<
  DuffelPreviewOrderReconciliationResult
> {
  if (
    process.env.VERCEL_ENV !== "preview"
    || process.env.FLIGHT_DUFFEL_TEST_BOOKING_ENABLED !== "true"
    || process.env.FLIGHT_DUFFEL_TEST_CREDENTIAL_PROBE_ENABLED !== "false"
    || process.env.NEXT_PUBLIC_SUPABASE_URL !== PREVIEW_SUPABASE_URL
  ) throw new Error("Duffel Preview order reconciliation is disabled.");

  await requireExactRuntimeControl();
  const token = readAccessToken();
  const response = await fetch(RECONCILIATION_URL, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Duffel-Version": "v2",
    },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(DUFFEL_REQUEST_TIMEOUT_MS),
  });
  assertResponseEnvelope(response);
  const rawBody = await readBoundedResponseBody(response);
  const projected = projectReconciliationBody(rawBody);
  return Object.freeze({
    mode: "duffel_test_mode" as const,
    operation: "list_orders_read_only" as const,
    ...projected,
    rawResponseSha256: createHash("sha256").update(rawBody).digest("hex"),
    rawResponseBytes: rawBody.byteLength,
    externalProviderRead: true as const,
    externalMutationAttempted: false as const,
    automaticRetryAttempted: false as const,
  });
}

export const DUFFEL_PREVIEW_ORDER_RECONCILIATION_URL = RECONCILIATION_URL;
export const DUFFEL_PREVIEW_ORDER_RECONCILIATION_RUNTIME_CONTROL = EXPECTED_RUNTIME_CONTROL;
