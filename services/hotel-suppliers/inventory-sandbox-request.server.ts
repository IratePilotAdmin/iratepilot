import "server-only";
import { isIP } from "node:net";

import {
  buildExpediaRapidAuthorization,
  buildHotelbedsAuthHeaders,
  buildRatehawkAuthorization,
} from "./inventory-auth.server";
import type { InventorySupplierId } from "./inventory-readiness";
import { isRatehawkSandboxPartnerOrderId } from "./ratehawk-partner-order-id.server";

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

export function buildRatehawkSandboxHotelpageRequest(input: {
  keyId: string;
  apiKey: string;
  payload: JsonObject;
}): InventorySandboxRequest {
  return {
    supplierId: "ratehawk",
    url: "https://api-sandbox.ratehawk.com/api/b2b/v3/search/hp/",
    method: "POST",
    headers: {
      Authorization: buildRatehawkAuthorization(input),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: serializeJsonObject(input.payload),
  };
}

export function buildRatehawkSandboxHotelPrebookRequest(input: {
  keyId: string;
  apiKey: string;
  rateHash: string;
  priceIncreasePercent?: number;
}): InventorySandboxRequest {
  const rateHash = input.rateHash.trim();
  if (!rateHash || rateHash.length > 256 || unsafeTextPattern.test(rateHash)) {
    throw new Error("RateHawk sandbox rate hash is invalid.");
  }
  if (input.priceIncreasePercent !== undefined
    && (!Number.isSafeInteger(input.priceIncreasePercent)
      || input.priceIncreasePercent < 0
      || input.priceIncreasePercent > 100)) {
    throw new Error("RateHawk sandbox price increase percentage is invalid.");
  }

  return {
    supplierId: "ratehawk",
    url: "https://api-sandbox.ratehawk.com/api/b2b/v3/hotel/prebook/",
    method: "POST",
    headers: {
      Authorization: buildRatehawkAuthorization(input),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: serializeJsonObject({
      hash: rateHash,
      ...(input.priceIncreasePercent === undefined
        ? {}
        : { price_increase_percent: input.priceIncreasePercent }),
    }),
  };
}

const ratehawkNamePattern = /^[\p{L}\p{M} .'-]+$/u;
const ratehawkEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ratehawkPhonePattern = /^\+?[0-9]{7,20}$/;
const decimalAmountPattern = /^(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,2})?$/;

function ratehawkText(value: string, label: string, maximumLength = 256) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength || unsafeTextPattern.test(normalized)) {
    throw new Error(`RateHawk sandbox ${label} is invalid.`);
  }
  return normalized;
}

function ratehawkPartnerOrderId(value: string) {
  const normalized = ratehawkText(value, "partner order ID");
  if (!isRatehawkSandboxPartnerOrderId(normalized)) {
    throw new Error(
      "RateHawk sandbox partner order ID must be a UUID or documented certification trigger.",
    );
  }
  return normalized;
}

function ratehawkRequest(input: {
  keyId: string;
  apiKey: string;
  url: string;
  payload: JsonObject;
}): InventorySandboxRequest {
  return {
    supplierId: "ratehawk",
    url: input.url,
    method: "POST",
    headers: {
      Authorization: buildRatehawkAuthorization(input),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: serializeJsonObject(input.payload),
  };
}

export function buildRatehawkSandboxBookingFormRequest(input: {
  keyId: string;
  apiKey: string;
  partnerOrderId: string;
  bookHash: string;
  userIp: string;
  language?: string;
}): InventorySandboxRequest {
  const userIp = ratehawkText(input.userIp, "user IP", 45);
  if (isIP(userIp) === 0) {
    throw new Error("RateHawk sandbox user IP is invalid.");
  }
  return ratehawkRequest({
    ...input,
    url: "https://api-sandbox.ratehawk.com/api/b2b/v3/hotel/order/booking/form/",
    payload: {
      partner_order_id: ratehawkPartnerOrderId(input.partnerOrderId),
      book_hash: ratehawkText(input.bookHash, "book hash"),
      language: ratehawkText(input.language ?? "en", "language", 5),
      user_ip: userIp,
    },
  });
}

export type RatehawkSandboxGuest = {
  firstName: string;
  lastName: string;
  isChild?: boolean;
  age?: number;
};

function ratehawkGuest(guest: RatehawkSandboxGuest) {
  const firstName = ratehawkText(guest.firstName, "guest first name", 100);
  const lastName = ratehawkText(guest.lastName, "guest last name", 100);
  if (!ratehawkNamePattern.test(firstName) || !ratehawkNamePattern.test(lastName)) {
    throw new Error("RateHawk sandbox guest name is invalid.");
  }
  if (guest.isChild) {
    if (!Number.isSafeInteger(guest.age) || (guest.age ?? -1) < 0 || (guest.age ?? 99) > 17) {
      throw new Error("RateHawk sandbox child age is invalid.");
    }
    return { first_name: firstName, last_name: lastName, is_child: true, age: guest.age };
  }
  if (guest.age !== undefined) {
    throw new Error("RateHawk sandbox adult guest must not include a child age.");
  }
  return { first_name: firstName, last_name: lastName };
}

export function buildRatehawkSandboxBookingFinishRequest(input: {
  keyId: string;
  apiKey: string;
  partnerOrderId: string;
  user: { email: string; phone: string; comment?: string };
  supplier: { firstName: string; lastName: string; email: string; phone: string };
  rooms: readonly { guests: readonly RatehawkSandboxGuest[] }[];
  paymentType: { type: "deposit" | "hotel"; amount: string; currencyCode: string };
  amountSellB2b2c?: string;
  language?: string;
}): InventorySandboxRequest {
  const email = ratehawkText(input.user.email, "user email", 254);
  const supplierEmail = ratehawkText(input.supplier.email, "supplier email", 254);
  const phone = ratehawkText(input.user.phone, "user phone", 21);
  const supplierPhone = ratehawkText(input.supplier.phone, "supplier phone", 21);
  if (!ratehawkEmailPattern.test(email) || !ratehawkEmailPattern.test(supplierEmail)) {
    throw new Error("RateHawk sandbox email is invalid.");
  }
  if (!ratehawkPhonePattern.test(phone) || !ratehawkPhonePattern.test(supplierPhone)) {
    throw new Error("RateHawk sandbox phone is invalid.");
  }
  if (input.rooms.length < 1 || input.rooms.length > 9
    || input.rooms.some((room) => room.guests.length < 1 || room.guests.length > 8)) {
    throw new Error("RateHawk sandbox room guests are invalid.");
  }
  if (!decimalAmountPattern.test(input.paymentType.amount)
    || !/^[A-Z]{3}$/.test(input.paymentType.currencyCode)) {
    throw new Error("RateHawk sandbox payment amount or currency is invalid.");
  }
  if (input.amountSellB2b2c !== undefined && !decimalAmountPattern.test(input.amountSellB2b2c)) {
    throw new Error("RateHawk sandbox sell amount is invalid.");
  }
  const supplierFirstName = ratehawkText(input.supplier.firstName, "supplier first name", 100);
  const supplierLastName = ratehawkText(input.supplier.lastName, "supplier last name", 100);
  if (!ratehawkNamePattern.test(supplierFirstName) || !ratehawkNamePattern.test(supplierLastName)) {
    throw new Error("RateHawk sandbox supplier name is invalid.");
  }

  return ratehawkRequest({
    ...input,
    url: "https://api-sandbox.ratehawk.com/api/b2b/v3/hotel/order/booking/finish/",
    payload: {
      user: {
        email,
        phone,
        ...(input.user.comment ? { comment: ratehawkText(input.user.comment, "user comment", 500) } : {}),
      },
      supplier_data: {
        first_name_original: supplierFirstName,
        last_name_original: supplierLastName,
        email: supplierEmail,
        phone: supplierPhone,
      },
      partner: {
        partner_order_id: ratehawkPartnerOrderId(input.partnerOrderId),
        ...(input.amountSellB2b2c === undefined ? {} : { amount_sell_b2b2c: input.amountSellB2b2c }),
      },
      language: ratehawkText(input.language ?? "en", "language", 5),
      rooms: input.rooms.map((room) => ({ guests: room.guests.map(ratehawkGuest) })),
      payment_type: {
        type: input.paymentType.type,
        amount: input.paymentType.amount,
        currency_code: input.paymentType.currencyCode,
      },
    },
  });
}

function buildRatehawkPartnerOrderRequest(input: {
  keyId: string;
  apiKey: string;
  partnerOrderId: string;
}, url: string) {
  return ratehawkRequest({
    ...input,
    url,
    payload: { partner_order_id: ratehawkPartnerOrderId(input.partnerOrderId) },
  });
}

export function buildRatehawkSandboxBookingStatusRequest(input: {
  keyId: string;
  apiKey: string;
  partnerOrderId: string;
}) {
  return buildRatehawkPartnerOrderRequest(
    input,
    "https://api-sandbox.ratehawk.com/api/b2b/v3/hotel/order/booking/finish/status/",
  );
}

export function buildRatehawkSandboxBookingCancelRequest(input: {
  keyId: string;
  apiKey: string;
  partnerOrderId: string;
}) {
  return buildRatehawkPartnerOrderRequest(
    input,
    "https://api-sandbox.ratehawk.com/api/b2b/v3/hotel/order/cancel/",
  );
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

export function buildStubaSandboxHotelSearchRequest(input: {
  authApiKey: string;
  payload: JsonObject;
}): InventorySandboxRequest {
  const authApiKey = input.authApiKey.trim();
  if (!authApiKey || authApiKey.length > 4096 || unsafeTextPattern.test(authApiKey)) {
    throw new Error("Stuba sandbox API key is invalid.");
  }

  return {
    supplierId: "stuba",
    url: "https://testapijson.stuba.com/HotelSearch",
    method: "POST",
    headers: {
      AuthApiKey: authApiKey,
      Accept: "application/json",
      "Accept-Encoding": "gzip,br",
      "Content-Type": "application/json",
    },
    body: serializeJsonObject(input.payload),
  };
}
