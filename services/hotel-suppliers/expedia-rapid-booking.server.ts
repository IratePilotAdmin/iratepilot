import "server-only";

import { buildExpediaRapidAuthorization } from "./inventory-auth.server";

type ExpediaPhone = {
  country_code: string;
  area_code: string;
  number: string;
};

type ExpediaAddress = {
  line_1: string;
  line_2?: string;
  line_3?: string;
  city: string;
  state_province_code?: string;
  postal_code: string;
  country_code: string;
};

type ExpediaBillingContact = {
  given_name: string;
  family_name: string;
  address: ExpediaAddress;
};

type ExpediaPayment = {
  type: "customer_card";
  number: string;
  security_code: string;
  expiration_month: string;
  expiration_year: string;
  billing_contact: ExpediaBillingContact;
};

type ExpediaTravelerRoom = {
  given_name: string;
  family_name: string;
  smoking: boolean;
  special_request?: string;
};

export type ExpediaRapidBookingRequest = {
  url: string;
  method: "POST";
  headers: Readonly<Record<string, string>>;
  body: string;
};

export type ExpediaRapidRetrieveRequest = {
  url: string;
  method: "GET";
  headers: Readonly<Record<string, string>>;
};

export type ExpediaRapidBookingFetch = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, "status" | "headers" | "text">>;

const controlCharacters = /[\u0000-\u001f\u007f]/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const countryCodePattern = /^[A-Z]{2}$/;

function requireText(value: string, label: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || controlCharacters.test(normalized)) {
    throw new Error(`Expedia Rapid ${label} is invalid.`);
  }
  return normalized;
}

function validateAddress(address: ExpediaAddress): ExpediaAddress {
  const countryCode = requireText(address.country_code, "billing country", 2).toUpperCase();
  if (!countryCodePattern.test(countryCode)) throw new Error("Expedia Rapid billing country is invalid.");
  return {
    line_1: requireText(address.line_1, "billing address", 255),
    ...(address.line_2 ? { line_2: requireText(address.line_2, "billing address", 255) } : {}),
    ...(address.line_3 ? { line_3: requireText(address.line_3, "billing address", 255) } : {}),
    city: requireText(address.city, "billing city", 255),
    ...(address.state_province_code
      ? { state_province_code: requireText(address.state_province_code, "billing state", 20) }
      : {}),
    postal_code: requireText(address.postal_code, "billing postal code", 20),
    country_code: countryCode,
  };
}

function validateBookingLink(link: string, environment: "sandbox" | "production") {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new Error("Expedia Rapid booking link is invalid.");
  }
  const expectedHost = environment === "sandbox" ? "test.ean.com" : "api.ean.com";
  if (url.protocol !== "https:" || url.hostname !== expectedHost || url.pathname !== "/v3/itineraries"
    || !url.searchParams.get("token")) {
    throw new Error("Expedia Rapid booking link is not an approved Price Check link.");
  }
  return url.toString();
}

export function buildExpediaRapidOccupancy(adults: number, childAges: number[]) {
  if (!Number.isInteger(adults) || adults < 1 || adults > 8
    || childAges.length > 6
    || childAges.some((age) => !Number.isInteger(age) || age < 0 || age > 17)) {
    throw new Error("Expedia Rapid occupancy is invalid.");
  }
  return [adults, ...childAges].join("-");
}

export function buildExpediaRapidBookingRequest(input: {
  environment: "sandbox" | "production";
  bookingLink: string;
  apiKey: string;
  sharedSecret: string;
  timestampSeconds: number;
  customerIp: string;
  customerSessionId: string;
  userAgent: string;
  affiliateReferenceId: string;
  email: string;
  phone: ExpediaPhone;
  rooms: ExpediaTravelerRoom[];
  payments: ExpediaPayment[];
}): ExpediaRapidBookingRequest {
  const affiliateReferenceId = requireText(input.affiliateReferenceId, "affiliate reference ID", 28);
  const email = requireText(input.email, "traveler email", 254).toLowerCase();
  if (!emailPattern.test(email)) throw new Error("Expedia Rapid traveler email is invalid.");
  if (input.rooms.length < 1 || input.payments.length < 1) {
    throw new Error("Expedia Rapid traveler and payment details are required.");
  }

  const body = {
    affiliate_reference_id: affiliateReferenceId,
    hold: false,
    email,
    phone: {
      country_code: requireText(input.phone.country_code, "traveler phone country code", 4),
      area_code: requireText(input.phone.area_code, "traveler phone area code", 8),
      number: requireText(input.phone.number, "traveler phone number", 24),
    },
    rooms: input.rooms.map((room) => ({
      given_name: requireText(room.given_name, "traveler given name", 255),
      family_name: requireText(room.family_name, "traveler family name", 255),
      smoking: room.smoking,
      ...(room.special_request
        ? { special_request: requireText(room.special_request, "special request", 250) }
        : {}),
    })),
    payments: input.payments.map((payment) => ({
      type: payment.type,
      number: requireText(payment.number, "card number", 19),
      security_code: requireText(payment.security_code, "card security code", 4),
      expiration_month: requireText(payment.expiration_month, "card expiration month", 2),
      expiration_year: requireText(payment.expiration_year, "card expiration year", 4),
      billing_contact: {
        given_name: requireText(payment.billing_contact.given_name, "payor given name", 255),
        family_name: requireText(payment.billing_contact.family_name, "payor family name", 255),
        address: validateAddress(payment.billing_contact.address),
      },
    })),
  };

  return {
    url: validateBookingLink(input.bookingLink, input.environment),
    method: "POST",
    headers: {
      Authorization: buildExpediaRapidAuthorization(input),
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "Content-Type": "application/json",
      "Customer-Ip": requireText(input.customerIp, "customer IP", 64),
      "Customer-Session-Id": requireText(input.customerSessionId, "customer session ID", 128),
      "User-Agent": requireText(input.userAgent, "user agent", 512),
    },
    body: JSON.stringify(body),
  };
}

export function buildExpediaRapidRetrieveRequest(input: {
  environment: "sandbox" | "production";
  apiKey: string;
  sharedSecret: string;
  timestampSeconds: number;
  customerIp: string;
  customerSessionId: string;
  userAgent: string;
  affiliateReferenceId: string;
  email: string;
}): ExpediaRapidRetrieveRequest {
  const affiliateReferenceId = requireText(input.affiliateReferenceId, "affiliate reference ID", 28);
  const email = requireText(input.email, "traveler email", 254).toLowerCase();
  if (!emailPattern.test(email)) throw new Error("Expedia Rapid traveler email is invalid.");

  const host = input.environment === "sandbox" ? "test.ean.com" : "api.ean.com";
  const url = new URL(`https://${host}/v3/itineraries`);
  url.searchParams.set("affiliate_reference_id", affiliateReferenceId);
  url.searchParams.set("email", email);

  return {
    url: url.toString(),
    method: "GET",
    headers: {
      Authorization: buildExpediaRapidAuthorization(input),
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "Customer-Ip": requireText(input.customerIp, "customer IP", 64),
      "Customer-Session-Id": requireText(input.customerSessionId, "customer session ID", 128),
      "User-Agent": requireText(input.userAgent, "user agent", 512),
    },
  };
}

export type ExpediaRapidBookingRecovery =
  | "do_not_retry"
  | "reconcile_by_affiliate_reference"
  | "refresh_price_check"
  | "re_shop";

export function classifyExpediaRapidBookingFailure(status: number, errorType?: string): ExpediaRapidBookingRecovery {
  const normalized = errorType?.trim().toLowerCase();
  if (normalized === "duplicate_itinerary" || status === 429 || status >= 500) {
    return "reconcile_by_affiliate_reference";
  }
  if (normalized === "price_mismatch") return "refresh_price_check";
  if (normalized === "rooms_unavailable") return "re_shop";
  return "do_not_retry";
}

export type ExpediaRapidBookingExecutionResult =
  | {
      outcome: "confirmed";
      status: number;
      itineraryId: string;
      retrieveLink: string;
      transactionIdPresent: boolean;
    }
  | {
      outcome: "action_required";
      status: number | null;
      recovery: ExpediaRapidBookingRecovery;
      transactionIdPresent: boolean;
    };

type ExpediaRapidJsonObject = Record<string, unknown>;

function parseJsonObject(value: string): ExpediaRapidJsonObject | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as ExpediaRapidJsonObject
      : null;
  } catch {
    return null;
  }
}

function readErrorType(body: ExpediaRapidJsonObject | null) {
  if (!body) return undefined;
  if (typeof body.type === "string") return body.type;
  if (Array.isArray(body.errors)) {
    const first = body.errors[0];
    if (first && typeof first === "object" && !Array.isArray(first)
      && typeof (first as ExpediaRapidJsonObject).type === "string") {
      return (first as ExpediaRapidJsonObject).type as string;
    }
  }
  return undefined;
}

function readRetrieveLink(body: ExpediaRapidJsonObject, bookingRequestUrl: string) {
  const links = body.links;
  if (!links || typeof links !== "object" || Array.isArray(links)) return null;
  const retrieve = (links as ExpediaRapidJsonObject).retrieve;
  if (!retrieve || typeof retrieve !== "object" || Array.isArray(retrieve)) return null;
  const href = (retrieve as ExpediaRapidJsonObject).href;
  if (typeof href !== "string" || !href.trim()) return null;
  try {
    const bookingUrl = new URL(bookingRequestUrl);
    const retrieveUrl = new URL(href.trim());
    return retrieveUrl.protocol === "https:"
      && retrieveUrl.hostname === bookingUrl.hostname
      && /^\/v3\/itineraries\/[^/]+$/.test(retrieveUrl.pathname)
      ? retrieveUrl.toString()
      : null;
  } catch {
    return null;
  }
}

/**
 * Sends a Create Booking request exactly once. Ambiguous outcomes are never
 * retried here: Expedia requires reconciliation with Retrieve Booking using
 * the original affiliate reference and traveler email first.
 */
export async function executeExpediaRapidBookingRequest(
  request: ExpediaRapidBookingRequest,
  options: { fetcher?: ExpediaRapidBookingFetch; signal?: AbortSignal } = {},
): Promise<ExpediaRapidBookingExecutionResult> {
  const fetcher = options.fetcher ?? fetch;
  try {
    const response = await fetcher(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      cache: "no-store",
      redirect: "error",
      signal: options.signal,
    });
    const transactionIdPresent = Boolean(response.headers.get("transaction-id")?.trim());
    const parsed = parseJsonObject(await response.text());

    if (response.status >= 200 && response.status < 300) {
      const itineraryId = parsed && (typeof parsed.itinerary_id === "string" || typeof parsed.itinerary_id === "number")
        ? String(parsed.itinerary_id).trim()
        : "";
      const retrieveLink = parsed ? readRetrieveLink(parsed, request.url) : null;
      if (itineraryId && retrieveLink) {
        return {
          outcome: "confirmed",
          status: response.status,
          itineraryId,
          retrieveLink,
          transactionIdPresent,
        };
      }
      return {
        outcome: "action_required",
        status: response.status,
        recovery: "reconcile_by_affiliate_reference",
        transactionIdPresent,
      };
    }

    return {
      outcome: "action_required",
      status: response.status,
      recovery: classifyExpediaRapidBookingFailure(response.status, readErrorType(parsed)),
      transactionIdPresent,
    };
  } catch {
    return {
      outcome: "action_required",
      status: null,
      recovery: "reconcile_by_affiliate_reference",
      transactionIdPresent: false,
    };
  }
}

export type ExpediaRapidBookingEvidence = {
  version: "expedia-rapid-booking-evidence-v1";
  outcome: ExpediaRapidBookingExecutionResult["outcome"];
  status: number | null;
  recovery: ExpediaRapidBookingRecovery | null;
  transactionIdPresent: boolean;
  itineraryIdPresent: boolean;
  retrieveLinkPresent: boolean;
  requestCoverage: {
    affiliateReferenceId: boolean;
    travelerEmail: boolean;
    travelerPhone: boolean;
    roomGuestNames: boolean;
    paymentCard: boolean;
    billingContact: boolean;
    billingAddress: boolean;
  };
};

/** Produces allowlisted evidence without traveler, payment, credential, or supplier identifiers. */
export function sanitizeExpediaRapidBookingEvidence(
  request: ExpediaRapidBookingRequest,
  result: ExpediaRapidBookingExecutionResult,
): ExpediaRapidBookingEvidence {
  const body = parseJsonObject(request.body);
  const phone = body?.phone;
  const rooms = body?.rooms;
  const payments = body?.payments;
  const firstPayment = Array.isArray(payments) && payments[0] && typeof payments[0] === "object"
    ? payments[0] as ExpediaRapidJsonObject
    : null;
  const billingContact = firstPayment?.billing_contact;
  const billingAddress = billingContact && typeof billingContact === "object" && !Array.isArray(billingContact)
    ? (billingContact as ExpediaRapidJsonObject).address
    : null;

  return {
    version: "expedia-rapid-booking-evidence-v1",
    outcome: result.outcome,
    status: result.status,
    recovery: result.outcome === "action_required" ? result.recovery : null,
    transactionIdPresent: result.transactionIdPresent,
    itineraryIdPresent: result.outcome === "confirmed" && Boolean(result.itineraryId),
    retrieveLinkPresent: result.outcome === "confirmed" && Boolean(result.retrieveLink),
    requestCoverage: {
      affiliateReferenceId: typeof body?.affiliate_reference_id === "string",
      travelerEmail: typeof body?.email === "string",
      travelerPhone: Boolean(phone && typeof phone === "object" && !Array.isArray(phone)),
      roomGuestNames: Array.isArray(rooms) && rooms.length > 0 && rooms.every((room) => {
        if (!room || typeof room !== "object" || Array.isArray(room)) return false;
        const value = room as ExpediaRapidJsonObject;
        return typeof value.given_name === "string" && typeof value.family_name === "string";
      }),
      paymentCard: Boolean(firstPayment && typeof firstPayment.number === "string"
        && typeof firstPayment.security_code === "string"),
      billingContact: Boolean(billingContact && typeof billingContact === "object" && !Array.isArray(billingContact)),
      billingAddress: Boolean(billingAddress && typeof billingAddress === "object" && !Array.isArray(billingAddress)),
    },
  };
}
