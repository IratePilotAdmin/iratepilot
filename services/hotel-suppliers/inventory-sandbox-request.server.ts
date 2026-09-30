import "server-only";

import {
  buildExpediaRapidAuthorization,
  buildHotelbedsAuthHeaders,
  buildRatehawkAuthorization,
} from "./inventory-auth.server";
import type { InventorySupplierId } from "./inventory-readiness";

export type InventorySandboxRequest = {
  supplierId: InventorySupplierId;
  url: string;
  method: "GET" | "POST";
  headers: Readonly<Record<string, string>>;
  body?: string;
};

type JsonObject = Readonly<Record<string, unknown>>;
type QueryValue = string | number | readonly (string | number)[];

const unsafeTextPattern = /[\u0000-\u001f\u007f]/;
const maxPayloadLength = 1_000_000;

function serializeJsonObject(payload: JsonObject) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Supplier sandbox request payload must be an object.");
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(payload);
  } catch {
    throw new Error("Supplier sandbox request payload is not JSON serializable.");
  }
  if (!serialized || serialized.length > maxPayloadLength) {
    throw new Error("Supplier sandbox request payload is invalid.");
  }
  return serialized;
}

function buildQueryUrl(baseUrl: string, query: Readonly<Record<string, QueryValue>>) {
  const url = new URL(baseUrl);
  for (const [key, rawValue] of Object.entries(query)) {
    if (!key || key.length > 100 || unsafeTextPattern.test(key)) {
      throw new Error("Supplier sandbox query parameter is invalid.");
    }
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    if (values.length === 0 || values.length > 20) {
      throw new Error("Supplier sandbox query parameter is invalid.");
    }
    for (const rawItem of values) {
      const item = String(rawItem);
      if (!item || item.length > 4096 || unsafeTextPattern.test(item)) {
        throw new Error("Supplier sandbox query parameter is invalid.");
      }
      url.searchParams.append(key, item);
    }
  }
  if (!url.search) {
    throw new Error("Supplier sandbox query parameters are required.");
  }
  return url.toString();
}

export function buildHotelbedsSandboxAvailabilityRequest(input: {
  apiKey: string;
  secret: string;
  timestampSeconds: number;
  payload: JsonObject;
}): InventorySandboxRequest {
  return {
    supplierId: "hotelbeds",
    url: "https://api.test.hotelbeds.com/hotel-api/1.0/hotels",
    method: "POST",
    headers: {
      ...buildHotelbedsAuthHeaders(input),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: serializeJsonObject(input.payload),
  };
}

export function buildRatehawkSandboxHotelSearchRequest(input: {
  keyId: string;
  apiKey: string;
  payload: JsonObject;
}): InventorySandboxRequest {
  return {
    supplierId: "ratehawk",
    url: "https://api-sandbox.ratehawk.com/api/b2b/v3/search/serp/hotels/",
    method: "POST",
    headers: {
      Authorization: buildRatehawkAuthorization(input),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: serializeJsonObject(input.payload),
  };
}

export function buildExpediaRapidSandboxAvailabilityRequest(input: {
  apiKey: string;
  sharedSecret: string;
  timestampSeconds: number;
  query: Readonly<Record<string, QueryValue>>;
}): InventorySandboxRequest {
  return {
    supplierId: "expedia-rapid",
    url: buildQueryUrl("https://test.ean.com/v3/properties/availability", input.query),
    method: "GET",
    headers: {
      Authorization: buildExpediaRapidAuthorization(input),
      Accept: "application/json",
    },
  };
}
