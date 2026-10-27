import "server-only";

import { randomUUID } from "node:crypto";

import type { InventoryJsonValue } from "./inventory-response.server";
import {
  InventorySupplierResponseError,
} from "./inventory-response.server";
import {
  buildRatehawkSandboxBookingCancelRequest,
  buildRatehawkSandboxBookingFinishRequest,
  buildRatehawkSandboxBookingFormRequest,
  buildRatehawkSandboxBookingStatusRequest,
  buildRatehawkSandboxHotelpageRequest,
  buildRatehawkSandboxHotelPrebookRequest,
  type RatehawkSandboxGuest,
} from "./inventory-sandbox-request.server";
import {
  executeInventorySandboxRequest,
  InventorySandboxTransportError,
  type InventorySandboxFetch,
} from "./inventory-sandbox-transport.server";
import {
  createRatehawkBookingFormWithRetry,
  pollRatehawkBookingUntilFinal,
} from "./ratehawk-booking-workflow.server";
import { parseRatehawkCancellationResponse } from "./ratehawk-booking-response.server";

export const ratehawkCertificationScenarioIds = [
  "children",
  "citizenship",
  "multiroom",
  "price_change",
  "unknown_success",
  "unknown_soldout",
  "unknown_book_limit",
] as const;

export type RatehawkCertificationScenarioId = typeof ratehawkCertificationScenarioIds[number];

type Scenario = {
  id: RatehawkCertificationScenarioId;
  hotelId: number;
  residency: string;
  searchGuests: readonly { adults: number; children: readonly number[] }[];
  rooms: readonly { guests: readonly RatehawkSandboxGuest[] }[];
  priceIncreasePercent?: number;
  orderSuffix?: "unknown_success" | "unknown_soldout" | "unknown_book_limit";
};

export type RatehawkCertificationScenarioResult = {
  scenario: RatehawkCertificationScenarioId;
  partnerOrderId: string;
  finalStatus: "confirmed" | "failed" | "timed_out";
  finalError: string | null;
  bookingFormAttempts: number;
  statusAttempts: number;
  cancelled: boolean;
  cancellationAmount: string | null;
  cancellationCurrency: string | null;
};

export class RatehawkCertificationRunnerError extends Error {
  constructor(readonly code:
    | "credentials_not_ready"
    | "invalid_response"
    | "booking_form_failed"
    | "unexpected_outcome") {
    super(`RateHawk certification run failed (${code}).`);
    this.name = "RatehawkCertificationRunnerError";
  }
}

export type RatehawkCertificationFailure = {
  code: string;
  status: number | null;
};

export function classifyRatehawkCertificationFailure(
  error: unknown,
): RatehawkCertificationFailure {
  if (error instanceof RatehawkCertificationRunnerError) {
    return { code: `runner_${error.code}`, status: null };
  }
  if (error instanceof InventorySandboxTransportError) {
    return { code: `transport_${error.code}`, status: null };
  }
  if (error instanceof InventorySupplierResponseError) {
    return {
      code: `supplier_${error.code}`,
      status: error.status && error.status >= 100 && error.status <= 599
        ? error.status
        : null,
    };
  }
  return { code: "unknown_error", status: null };
}

const scenarios: Record<RatehawkCertificationScenarioId, Scenario> = {
  children: {
    id: "children",
    hotelId: 10004834,
    residency: "mc",
    searchGuests: [{ adults: 2, children: [0, 17] }],
    rooms: [{ guests: [
      { firstName: "Test", lastName: "AdultOne" },
      { firstName: "Test", lastName: "AdultTwo" },
      { firstName: "Test", lastName: "ChildZero", isChild: true, age: 0 },
      { firstName: "Test", lastName: "ChildSeventeen", isChild: true, age: 17 },
    ] }],
  },
  citizenship: {
    id: "citizenship",
    hotelId: 10004834,
    residency: "uz",
    searchGuests: [{ adults: 2, children: [] }],
    rooms: [{ guests: [
      { firstName: "Test", lastName: "AdultOne" },
      { firstName: "Test", lastName: "AdultTwo" },
    ] }],
  },
  multiroom: {
    id: "multiroom",
    hotelId: 10004834,
    residency: "us",
    searchGuests: [
      { adults: 2, children: [3] },
      { adults: 2, children: [1, 5, 17] },
    ],
    rooms: [
      { guests: [
        { firstName: "Test", lastName: "AdultOne" },
        { firstName: "Test", lastName: "AdultTwo" },
        { firstName: "Test", lastName: "ChildThree", isChild: true, age: 3 },
      ] },
      { guests: [
        { firstName: "Test", lastName: "AdultThree" },
        { firstName: "Test", lastName: "AdultFour" },
        { firstName: "Test", lastName: "ChildOne", isChild: true, age: 1 },
        { firstName: "Test", lastName: "ChildFive", isChild: true, age: 5 },
        { firstName: "Test", lastName: "ChildSeventeen", isChild: true, age: 17 },
      ] },
    ],
  },
  price_change: {
    id: "price_change",
    hotelId: 8819557,
    residency: "us",
    searchGuests: [{ adults: 2, children: [] }],
    rooms: [{ guests: [
      { firstName: "Test", lastName: "AdultOne" },
      { firstName: "Test", lastName: "AdultTwo" },
    ] }],
    priceIncreasePercent: 10,
  },
  unknown_success: {
    id: "unknown_success",
    hotelId: 10004834,
    residency: "us",
    searchGuests: [{ adults: 2, children: [] }],
    rooms: [{ guests: [
      { firstName: "Test", lastName: "AdultOne" },
      { firstName: "Test", lastName: "AdultTwo" },
    ] }],
    orderSuffix: "unknown_success",
  },
  unknown_soldout: {
    id: "unknown_soldout",
    hotelId: 10004834,
    residency: "us",
    searchGuests: [{ adults: 2, children: [] }],
    rooms: [{ guests: [
      { firstName: "Test", lastName: "AdultOne" },
      { firstName: "Test", lastName: "AdultTwo" },
    ] }],
    orderSuffix: "unknown_soldout",
  },
  unknown_book_limit: {
    id: "unknown_book_limit",
    hotelId: 10004834,
    residency: "us",
    searchGuests: [{ adults: 2, children: [] }],
    rooms: [{ guests: [
      { firstName: "Test", lastName: "AdultOne" },
      { firstName: "Test", lastName: "AdultTwo" },
    ] }],
    orderSuffix: "unknown_book_limit",
  },
};

function objectValue(value: InventoryJsonValue | undefined) {
  return value && !Array.isArray(value) && typeof value === "object" ? value : null;
}

function firstHash(response: InventoryJsonValue, field: "book_hash") {
  const root = objectValue(response ?? undefined);
  const data = objectValue(root?.data);
  if (root?.status !== "ok" || !data || !Array.isArray(data.hotels)) {
    throw new RatehawkCertificationRunnerError("invalid_response");
  }
  for (const hotelValue of data.hotels) {
    const hotel = objectValue(hotelValue);
    if (!hotel || !Array.isArray(hotel.rates)) continue;
    for (const rateValue of hotel.rates) {
      const rate = objectValue(rateValue);
      const hash = rate?.[field];
      if (typeof hash === "string" && hash.length > 0 && hash.length <= 256) return hash;
    }
  }
  throw new RatehawkCertificationRunnerError("invalid_response");
}

function paymentType(response: InventoryJsonValue) {
  const root = objectValue(response ?? undefined);
  const data = objectValue(root?.data);
  if (root?.status !== "ok" || !data || !Array.isArray(data.payment_types)) {
    throw new RatehawkCertificationRunnerError("invalid_response");
  }
  for (const value of data.payment_types) {
    const payment = objectValue(value);
    if ((payment?.type === "deposit" || payment?.type === "hotel")
      && typeof payment.amount === "string"
      && typeof payment.currency_code === "string") {
      return {
        type: payment.type,
        amount: payment.amount,
        currencyCode: payment.currency_code,
      } as const;
    }
  }
  throw new RatehawkCertificationRunnerError("invalid_response");
}

function prebookPriceChanged(response: InventoryJsonValue) {
  const root = objectValue(response ?? undefined);
  const data = objectValue(root?.data);
  const changes = objectValue(data?.changes);
  return changes?.price_changed === true;
}

function assertExpectedOutcome(
  scenario: Scenario,
  final: Awaited<ReturnType<typeof pollRatehawkBookingUntilFinal>>,
  prebook: InventoryJsonValue,
) {
  if (scenario.id === "unknown_soldout") {
    if (final.status !== "failed" || final.error !== "soldout") {
      throw new RatehawkCertificationRunnerError("unexpected_outcome");
    }
    return;
  }
  if (scenario.id === "unknown_book_limit") {
    if (final.status !== "failed" || final.error !== "book_limit") {
      throw new RatehawkCertificationRunnerError("unexpected_outcome");
    }
    return;
  }
  if (final.status !== "confirmed"
    || (scenario.id === "price_change" && !prebookPriceChanged(prebook))) {
    throw new RatehawkCertificationRunnerError("unexpected_outcome");
  }
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function partnerOrderId(scenario: Scenario) {
  const id = randomUUID();
  return scenario.orderSuffix ? `${id}_${scenario.orderSuffix}` : id;
}

function retryableTransportFailure(error: unknown) {
  return (error instanceof InventorySupplierResponseError && (error.status ?? 0) >= 500)
    || (error instanceof InventorySandboxTransportError
      && ["timeout", "network_error"].includes(error.code));
}

async function request(
  requestValue: Parameters<typeof executeInventorySandboxRequest>[0],
  options: {
    environment: Record<string, string | undefined>;
    fetcher?: InventorySandboxFetch;
    timeoutMs?: number;
  },
) {
  return executeInventorySandboxRequest(requestValue, options);
}

export async function runRatehawkCertificationScenario(options: {
  environment: Record<string, string | undefined>;
  scenarioId: RatehawkCertificationScenarioId;
  fetcher?: InventorySandboxFetch;
  now?: Date;
}): Promise<RatehawkCertificationScenarioResult> {
  const keyId = options.environment.HOTEL_INVENTORY_RATEHAWK_KEY_ID?.trim();
  const apiKey = options.environment.HOTEL_INVENTORY_RATEHAWK_API_KEY?.trim();
  if (!keyId || !apiKey) throw new RatehawkCertificationRunnerError("credentials_not_ready");

  const scenario = scenarios[options.scenarioId];
  const now = options.now ? new Date(options.now) : new Date();
  if (!scenario || Number.isNaN(now.getTime())) {
    throw new RatehawkCertificationRunnerError("invalid_response");
  }
  const checkin = dateOnly(addDays(now, 30));
  const checkout = dateOnly(addDays(now, 32));
  const hotelpage = await request(buildRatehawkSandboxHotelpageRequest({
    keyId,
    apiKey,
    payload: {
      checkin,
      checkout,
      residency: scenario.residency,
      language: "en",
      guests: scenario.searchGuests,
      hid: scenario.hotelId,
      currency: "USD",
    },
  }), { environment: options.environment, fetcher: options.fetcher, timeoutMs: 5_000 });
  const rateHash = firstHash(hotelpage, "book_hash");
  const prebook = await request(buildRatehawkSandboxHotelPrebookRequest({
    keyId,
    apiKey,
    rateHash,
    priceIncreasePercent: scenario.priceIncreasePercent,
  }), { environment: options.environment, fetcher: options.fetcher, timeoutMs: 60_000 });
  const bookHash = firstHash(prebook, "book_hash");

  let acceptedPayment: ReturnType<typeof paymentType> | null = null;
  const bookingForm = await createRatehawkBookingFormWithRetry({
    createPartnerOrderId: () => partnerOrderId(scenario),
    isRetryableTransportFailure: retryableTransportFailure,
    requestBookingForm: async (currentPartnerOrderId) => {
      const response = await request(buildRatehawkSandboxBookingFormRequest({
        keyId,
        apiKey,
        partnerOrderId: currentPartnerOrderId,
        bookHash,
        userIp: "203.0.113.10",
      }), { environment: options.environment, fetcher: options.fetcher, timeoutMs: 5_000 });
      if (objectValue(response ?? undefined)?.status === "ok") acceptedPayment = paymentType(response);
      return response;
    },
  });
  if (bookingForm.status !== "accepted" || !acceptedPayment) {
    throw new RatehawkCertificationRunnerError("booking_form_failed");
  }

  await request(buildRatehawkSandboxBookingFinishRequest({
    keyId,
    apiKey,
    partnerOrderId: bookingForm.partnerOrderId,
    user: { email: "certification@iratepilot.com", phone: "+15555550100" },
    supplier: {
      firstName: "IRatePilot",
      lastName: "Certification",
      email: "certification@iratepilot.com",
      phone: "+15555550100",
    },
    rooms: scenario.rooms,
    paymentType: acceptedPayment,
  }), { environment: options.environment, fetcher: options.fetcher, timeoutMs: 5_000 });

  const final = await pollRatehawkBookingUntilFinal({
    partnerOrderId: bookingForm.partnerOrderId,
    isRetryableTransportFailure: retryableTransportFailure,
    maximumAttempts: 10,
    checkStatus: (currentPartnerOrderId) => request(buildRatehawkSandboxBookingStatusRequest({
      keyId,
      apiKey,
      partnerOrderId: currentPartnerOrderId,
    }), { environment: options.environment, fetcher: options.fetcher, timeoutMs: 5_000 }),
  });

  let cancellation: ReturnType<typeof parseRatehawkCancellationResponse> | null = null;
  if (final.status === "confirmed") {
    cancellation = parseRatehawkCancellationResponse(await request(
      buildRatehawkSandboxBookingCancelRequest({
        keyId,
        apiKey,
        partnerOrderId: bookingForm.partnerOrderId,
      }),
      { environment: options.environment, fetcher: options.fetcher, timeoutMs: 5_000 },
    ));
  }
  assertExpectedOutcome(scenario, final, prebook);

  return {
    scenario: scenario.id,
    partnerOrderId: bookingForm.partnerOrderId,
    finalStatus: final.status,
    finalError: final.status === "failed" ? final.error : null,
    bookingFormAttempts: bookingForm.attempts,
    statusAttempts: final.attempts,
    cancelled: cancellation?.cancelled === true,
    cancellationAmount: cancellation?.amountPayable ?? null,
    cancellationCurrency: cancellation?.currencyCode ?? null,
  };
}
