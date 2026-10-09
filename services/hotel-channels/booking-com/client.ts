import type { BookingComAriRequest } from "./ari";

const MAX_RESPONSE_BYTES = 1_000_000;
const ENDPOINTS = new Set([
  "https://supply-xml.booking.com/hotels/ota/OTA_HotelAvailNotif",
  "https://supply-xml.booking.com/hotels/ota/OTA_HotelRateAmountNotif",
]);

export type BookingComDispatchApproval = {
  mode: "test";
  propertyId: string;
  machineAccountPropertyScope: string;
  partnerApproved: true;
  propertyConnectionApproved: true;
  endpointEnabled: true;
  certificationComplete: true;
  testProperty: true;
};

export type BookingComAcknowledgement = {
  outcome: "accepted" | "accepted_with_warnings" | "rejected" | "retryable" | "unknown";
  httpStatus: number | null;
  errors: Array<{ code?: string; message?: string }>;
  warnings: Array<{ code?: string; message?: string }>;
};

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function decodeXml(value: string) {
  return value.replace(/&(amp|lt|gt|quot|apos);/g, (_, entity: string) => ({
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'",
  })[entity] ?? "");
}

function xmlItems(xml: string, tagName: "Error" | "Warning") {
  const items: Array<{ code?: string; message?: string }> = [];
  const pattern = new RegExp(`<(?:(?:[\\w.-]+):)?${tagName}\\b([^>]*)\\/?\\s*>`, "gi");
  for (const match of xml.matchAll(pattern)) {
    const attributes = match[1] ?? "";
    const attr = (name: string) => {
      const found = new RegExp(`(?:^|\\s)(?:[\\w.-]+:)?${name}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(attributes);
      return found?.[2] ? decodeXml(found[2]).slice(0, 300) : undefined;
    };
    items.push({ code: attr("Code"), message: attr("ShortText") ?? attr("Details") });
    if (items.length >= 25) break;
  }
  return items;
}

export function parseBookingComAcknowledgement(body: string, status: number): BookingComAcknowledgement {
  if (!Number.isInteger(status) || status < 100 || status > 599) throw new Error("invalid_http_status");
  if (body.length > MAX_RESPONSE_BYTES || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(body)) {
    return { outcome: "unknown", httpStatus: status, errors: [], warnings: [] };
  }
  if (status === 408 || status === 429 || status >= 500) {
    return { outcome: "retryable", httpStatus: status, errors: [], warnings: [] };
  }
  const errors = xmlItems(body, "Error");
  const warnings = xmlItems(body, "Warning");
  const hasSuccess = /<(?:[\w.-]+:)?Success\b[^>]*\/?\s*>/i.test(body);
  if (status >= 200 && status < 300 && hasSuccess && errors.length === 0) {
    return { outcome: warnings.length ? "accepted_with_warnings" : "accepted", httpStatus: status, errors, warnings };
  }
  if (status >= 400 || errors.length > 0) {
    return { outcome: "rejected", httpStatus: status, errors, warnings };
  }
  return { outcome: "unknown", httpStatus: status, errors, warnings };
}

async function readBounded(response: Response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("response_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/**
 * Posts one prepared delta only to a caller-injected transport. This intentionally
 * has no default fetcher: callers must wire a controlled test harness explicitly.
 */
export async function postBookingComAriTestRequest(
  request: BookingComAriRequest,
  approval: BookingComDispatchApproval,
  options: { bearerToken: string; fetcher: Fetcher; timeoutMs?: number },
): Promise<BookingComAcknowledgement> {
  if (!request || !ENDPOINTS.has(request.endpoint) || !options?.fetcher || typeof options.fetcher !== "function") {
    throw new Error("invalid_test_transport");
  }
  if (!approval || approval.mode !== "test" || approval.testProperty !== true
    || approval.partnerApproved !== true || approval.propertyConnectionApproved !== true
    || approval.endpointEnabled !== true || approval.certificationComplete !== true
    || approval.propertyId !== request.channelPropertyId
    || approval.machineAccountPropertyScope !== request.channelPropertyId) {
    throw new Error("booking_com_connection_not_authorized");
  }
  if (typeof options.bearerToken !== "string" || options.bearerToken.length < 20 || options.bearerToken.length > 8192
    || /[\r\n]/.test(options.bearerToken)) throw new Error("invalid_bearer_token");
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) throw new Error("invalid_timeout");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await options.fetcher(request.endpoint, {
      method: "POST",
      headers: {
        ...request.headers,
        Authorization: `Bearer ${options.bearerToken}`,
      },
      body: request.body,
      redirect: "error",
      signal: controller.signal,
    });
    const body = await readBounded(response);
    return parseBookingComAcknowledgement(body, response.status);
  } catch {
    return { outcome: "retryable", httpStatus: null, errors: [], warnings: [] };
  } finally {
    clearTimeout(timer);
  }
}
