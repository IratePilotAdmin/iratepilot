export type FlightConsumerPreviewClientSearchRequest = Readonly<{
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string | null;
  cabin: "economy" | "premium_economy" | "business" | "first";
  travelerCount: number;
}>;

export type FlightConsumerPreviewSearchStatus =
  | "created"
  | "searching"
  | "complete"
  | "failed"
  | "expired";

type SearchNextAction = "poll" | "results" | "new_search";
type SearchStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StoredSearchAttempt = Readonly<{
  version: "flight-consumer-preview-search-attempt-v1";
  requestSha256: string;
  idempotencyKey: string;
  searchId: string | null;
  status: FlightConsumerPreviewSearchStatus | null;
}>;

export type FlightConsumerPreviewSearchRequestResult =
  | Readonly<{
    decision: "observed";
    searchId: string;
    status: FlightConsumerPreviewSearchStatus;
    nextAction: SearchNextAction;
  }>
  | Readonly<{ decision: "unavailable" }>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256Pattern = /^[0-9a-f]{64}$/;
const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const statuses = new Set<FlightConsumerPreviewSearchStatus>([
  "created",
  "searching",
  "complete",
  "failed",
  "expired",
]);
const nextActions = new Set<SearchNextAction>(["poll", "results", "new_search"]);

function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length
    && expected.every((key, index) => actual[index] === key);
}

function validateSearchRequest(value: FlightConsumerPreviewClientSearchRequest) {
  return /^[A-Z]{3}$/.test(value.origin)
    && /^[A-Z]{3}$/.test(value.destination)
    && value.origin !== value.destination
    && localDatePattern.test(value.departureDate)
    && (value.returnDate === null || (
      localDatePattern.test(value.returnDate)
      && value.returnDate > value.departureDate
    ))
    && ["economy", "premium_economy", "business", "first"].includes(value.cabin)
    && Number.isInteger(value.travelerCount)
    && value.travelerCount >= 1
    && value.travelerCount <= 4;
}

export function canonicalFlightConsumerPreviewSearchRequest(
  value: FlightConsumerPreviewClientSearchRequest,
) {
  if (!validateSearchRequest(value)) throw new Error("The test search request is invalid.");
  return JSON.stringify({
    origin: value.origin,
    destination: value.destination,
    departureDate: value.departureDate,
    returnDate: value.returnDate,
    cabin: value.cabin,
    travelerCount: value.travelerCount,
  });
}

export async function sha256FlightConsumerPreviewSearchRequest(
  value: FlightConsumerPreviewClientSearchRequest,
) {
  const bytes = new TextEncoder().encode(canonicalFlightConsumerPreviewSearchRequest(value));
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function storageKey(requestSha256: string) {
  if (!sha256Pattern.test(requestSha256)) throw new Error("The test search identity is invalid.");
  return `iratepilot:flight-preview:search:v1:${requestSha256}`;
}

function parseStoredAttempt(value: string | null, requestSha256: string) {
  if (value === null) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (!exactKeys(record, ["idempotencyKey", "requestSha256", "searchId", "status", "version"])) return null;
    if (
      record.version !== "flight-consumer-preview-search-attempt-v1"
      || record.requestSha256 !== requestSha256
      || typeof record.idempotencyKey !== "string"
      || !uuidPattern.test(record.idempotencyKey)
      || (record.searchId !== null && (typeof record.searchId !== "string" || !uuidPattern.test(record.searchId)))
      || (record.status !== null && (
        typeof record.status !== "string"
        || !statuses.has(record.status as FlightConsumerPreviewSearchStatus)
      ))
    ) return null;
    return Object.freeze({
      version: record.version,
      requestSha256,
      idempotencyKey: record.idempotencyKey.toLowerCase(),
      searchId: record.searchId === null ? null : String(record.searchId).toLowerCase(),
      status: record.status as FlightConsumerPreviewSearchStatus | null,
    }) satisfies StoredSearchAttempt;
  } catch {
    return null;
  }
}

function retainAttempt(storage: SearchStorage, attempt: StoredSearchAttempt) {
  const key = storageKey(attempt.requestSha256);
  storage.setItem(key, JSON.stringify(attempt));
  const retained = parseStoredAttempt(storage.getItem(key), attempt.requestSha256);
  if (
    retained === null
    || retained.idempotencyKey !== attempt.idempotencyKey
    || retained.searchId !== attempt.searchId
    || retained.status !== attempt.status
  ) throw new Error("The test search identity could not be retained.");
  return retained;
}

export async function durableFlightConsumerPreviewSearchAttempt(input: Readonly<{
  request: FlightConsumerPreviewClientSearchRequest;
  storage: SearchStorage;
  createUuid?: () => string;
  digestRequest?: (request: FlightConsumerPreviewClientSearchRequest) => Promise<string>;
}>) {
  canonicalFlightConsumerPreviewSearchRequest(input.request);
  const requestSha256 = await (
    input.digestRequest ?? sha256FlightConsumerPreviewSearchRequest
  )(input.request);
  if (!sha256Pattern.test(requestSha256)) throw new Error("The test search identity is invalid.");
  const key = storageKey(requestSha256);
  const rawExisting = input.storage.getItem(key);
  const existing = parseStoredAttempt(rawExisting, requestSha256);
  if (existing !== null) return existing;
  if (rawExisting !== null) throw new Error("The test search identity is unavailable.");
  const idempotencyKey = (input.createUuid ?? (() => globalThis.crypto.randomUUID()))().toLowerCase();
  if (!uuidPattern.test(idempotencyKey)) throw new Error("The test search identity is invalid.");
  return retainAttempt(input.storage, Object.freeze({
    version: "flight-consumer-preview-search-attempt-v1" as const,
    requestSha256,
    idempotencyKey,
    searchId: null,
    status: null,
  }));
}

function serverObservation(value: unknown) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const data = (value as { data?: unknown }).data;
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  if (!exactKeys(record, ["nextAction", "searchId", "status"])) return null;
  if (
    typeof record.searchId !== "string"
    || !uuidPattern.test(record.searchId)
    || typeof record.status !== "string"
    || !statuses.has(record.status as FlightConsumerPreviewSearchStatus)
    || typeof record.nextAction !== "string"
    || !nextActions.has(record.nextAction as SearchNextAction)
  ) return null;
  const status = record.status as FlightConsumerPreviewSearchStatus;
  const nextAction = record.nextAction as SearchNextAction;
  if (
    (nextAction === "results" && status !== "complete")
    || (nextAction === "poll" && status !== "created" && status !== "searching")
    || (nextAction === "new_search" && status !== "failed" && status !== "expired")
  ) return null;
  return Object.freeze({
    searchId: record.searchId.toLowerCase(),
    status,
    nextAction,
  });
}

export async function requestFlightConsumerPreviewSearch(input: Readonly<{
  request: FlightConsumerPreviewClientSearchRequest;
  storage: SearchStorage;
  post?: (url: string, init: RequestInit) => Promise<Response>;
  createUuid?: () => string;
  digestRequest?: (request: FlightConsumerPreviewClientSearchRequest) => Promise<string>;
}>) : Promise<FlightConsumerPreviewSearchRequestResult> {
  const attempt = await durableFlightConsumerPreviewSearchAttempt(input);
  let response: Response;
  try {
    response = await (input.post ?? fetch)("/api/flights/preview/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": attempt.idempotencyKey,
      },
      body: canonicalFlightConsumerPreviewSearchRequest(input.request),
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
  } catch {
    return Object.freeze({ decision: "unavailable" });
  }
  const body = await response.json().catch(() => null) as unknown;
  const observation = serverObservation(body);
  if (!response.ok || observation === null) {
    return Object.freeze({ decision: "unavailable" });
  }
  if (observation.nextAction === "poll") {
    retainAttempt(input.storage, Object.freeze({
      ...attempt,
      searchId: observation.searchId,
      status: observation.status,
    }));
  } else {
    try {
      input.storage.removeItem(storageKey(attempt.requestSha256));
    } catch {
      // Server-confirmed terminal state remains authoritative if cleanup is unavailable.
    }
  }
  return Object.freeze({ decision: "observed", ...observation });
}

export function clearFlightConsumerPreviewSearchAttempt(
  requestSha256: string,
  storage: SearchStorage,
) {
  storage.removeItem(storageKey(requestSha256));
}
