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
