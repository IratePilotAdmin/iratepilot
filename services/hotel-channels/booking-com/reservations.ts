const ROOT = "https://secure-supply-xml.booking.com/hotels/ota";
const IDENTIFIER = /^[A-Za-z0-9_-]{1,80}$/;
const PROPERTY_ID = /^\d{1,10}$/;

export type BookingComReservationKind = "new" | "modified_or_cancelled";

export type BookingComReservationRequest = {
  method: "GET" | "POST";
  url: string;
  headers: { "Accept-Version": "1.1"; "Content-Type": "application/xml" };
  body?: string;
  kind: BookingComReservationKind;
};

async function readBoundedResponse(response: Response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_000_000) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function xml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function endpoint(kind: BookingComReservationKind) {
  return `${ROOT}/${kind === "new" ? "OTA_HotelResNotif" : "OTA_HotelResModifyNotif"}`;
}

/** Build a one-property poll. The API returns unacknowledged reservations again until acknowledged. */
export function buildBookingComReservationPoll(propertyId: string, kind: BookingComReservationKind): BookingComReservationRequest {
  if (!PROPERTY_ID.test(propertyId) || !["new", "modified_or_cancelled"].includes(kind)) throw new Error("invalid_reservation_poll");
  const url = new URL(endpoint(kind));
  url.searchParams.set("hotel_ids", propertyId);
  return { method: "GET", url: url.toString(), headers: { "Accept-Version": "1.1", "Content-Type": "application/xml" }, kind };
}

/**
 * Build Booking.com's per-message response only after the caller's durable,
 * idempotent PMS write has succeeded. Failures are explicitly reported as
 * provider processing errors, leaving the reservation available for retry.
 */
export function buildBookingComReservationAcknowledgement(input: {
  kind: BookingComReservationKind;
  reservationId: string;
  persisted: boolean;
  timestamp: string;
  failureCode?: string;
  failureMessage?: string;
}): BookingComReservationRequest {
  if (!input || !["new", "modified_or_cancelled"].includes(input.kind)
    || !IDENTIFIER.test(input.reservationId)
    || !Number.isFinite(Date.parse(input.timestamp))
    || new Date(input.timestamp).toISOString() !== input.timestamp) throw new Error("invalid_reservation_acknowledgement");
  const rootTag = input.kind === "new" ? "OTA_HotelResNotifRS" : "OTA_HotelResModifyNotifRS";
  let body: string;
  if (input.persisted === true) {
    body = `<?xml version="1.0" encoding="UTF-8"?><${rootTag} TimeStamp="${xml(input.timestamp)}" Target="Test"><Success/><HotelReservations><HotelReservation><ResGlobalInfo><HotelReservationIDs><HotelReservationID ResID_Value="${xml(input.reservationId)}"/></HotelReservationIDs></ResGlobalInfo></HotelReservation></HotelReservations></${rootTag}>`;
  } else {
    const message = input.failureMessage?.trim();
    if (input.failureCode !== "193" || !message || message.length > 160 || /[\u0000-\u001f\u007f]/.test(message)) {
      throw new Error("reservation_failure_reason_required");
    }
    body = `<?xml version="1.0" encoding="UTF-8"?><${rootTag} TimeStamp="${xml(input.timestamp)}" Target="Test"><Errors><Error Code="193" RecordID="${xml(input.reservationId)}" ShortText="${xml(message)}"/></Errors></${rootTag}>`;
  }
  return { method: "POST", url: endpoint(input.kind), headers: { "Accept-Version": "1.1", "Content-Type": "application/xml" }, body, kind: input.kind };
}

/** Narrowly-scoped test client; the transport must be injected by the caller. */
export async function callBookingComReservationTestApi(
  request: BookingComReservationRequest,
  approval: {
    mode: "test";
    propertyId: string;
    machineAccountPropertyScope: string;
    partnerApproved: true;
    reservationConnectionApproved: true;
    endpointEnabled: true;
    certificationComplete: true;
    piiComplianceApproved: true;
    testProperty: true;
  },
  options: { bearerToken: string; fetcher: typeof fetch; timeoutMs?: number },
) {
  if (!approval || approval.mode !== "test" || approval.testProperty !== true
    || approval.partnerApproved !== true || approval.reservationConnectionApproved !== true
    || approval.endpointEnabled !== true || approval.certificationComplete !== true
    || approval.piiComplianceApproved !== true
    || approval.propertyId !== approval.machineAccountPropertyScope) throw new Error("booking_com_reservation_connection_not_authorized");
  if (!request || !["GET", "POST"].includes(request.method)
    || !["new", "modified_or_cancelled"].includes(request.kind)
    || request.url !== (request.method === "GET"
      ? buildBookingComReservationPoll(approval?.propertyId ?? "", request.kind).url
      : endpoint(request.kind))
    || request.headers["Accept-Version"] !== "1.1"
    || request.headers["Content-Type"] !== "application/xml"
    || (request.method === "GET" && request.body !== undefined)
    || (request.method === "POST" && (typeof request.body !== "string" || request.body.length > 100_000
      || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(request.body)
      || !request.body.includes(request.kind === "new" ? "<OTA_HotelResNotifRS " : "<OTA_HotelResModifyNotifRS ")
      || !request.body.includes('Target="Test"')))
    || !options || typeof options.fetcher !== "function") throw new Error("invalid_reservation_transport");
  if (typeof options.bearerToken !== "string" || options.bearerToken.length < 20
    || options.bearerToken.length > 8192 || /[\r\n]/.test(options.bearerToken)) throw new Error("invalid_bearer_token");
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) throw new Error("invalid_timeout");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await options.fetcher(request.url, {
      method: request.method,
      headers: { ...request.headers, Authorization: `Bearer ${options.bearerToken}` },
      ...(request.body ? { body: request.body } : {}),
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) return { outcome: response.status === 408 || response.status === 429 || response.status >= 500 ? "retryable" as const : "rejected" as const, status: response.status, body: "" };
    const body = await readBoundedResponse(response);
    if (body === null) return { outcome: "unknown" as const, status: response.status, body: "" };
    return { outcome: "received" as const, status: response.status, body };
  } catch {
    return { outcome: "retryable" as const, status: null, body: "" };
  } finally {
    clearTimeout(timer);
  }
}
