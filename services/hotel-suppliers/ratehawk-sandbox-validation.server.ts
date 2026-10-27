import "server-only";

import {
  buildRatehawkSandboxHotelpageRequest,
  buildRatehawkSandboxHotelSearchRequest,
} from "./inventory-sandbox-request.server";
import {
  executeInventorySandboxRequest,
  type InventorySandboxFetch,
} from "./inventory-sandbox-transport.server";
import type { InventoryJsonValue } from "./inventory-response.server";

const sandboxHotelId = 10004834;

export type RatehawkSandboxValidationResult = {
  testedAt: string;
  checkin: string;
  checkout: string;
  hotelCount: number;
  rateCount: number;
};

export class RatehawkSandboxValidationError extends Error {
  constructor(readonly code: "credentials_not_ready" | "invalid_response") {
    super(`RateHawk sandbox validation failed (${code}).`);
    this.name = "RatehawkSandboxValidationError";
  }
}

function formatUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function summarizeResponse(response: InventoryJsonValue) {
  if (!response || Array.isArray(response) || typeof response !== "object") {
    throw new RatehawkSandboxValidationError("invalid_response");
  }
  if (response.status !== "ok") {
    throw new RatehawkSandboxValidationError("invalid_response");
  }
  const data = response.data;
  if (!data || Array.isArray(data) || typeof data !== "object" || !Array.isArray(data.hotels)) {
    throw new RatehawkSandboxValidationError("invalid_response");
  }

  let rateCount = 0;
  let rateHash = "";
  for (const hotel of data.hotels) {
    if (!hotel || Array.isArray(hotel) || typeof hotel !== "object" || !Array.isArray(hotel.rates)) {
      throw new RatehawkSandboxValidationError("invalid_response");
    }
    for (const rate of hotel.rates) {
      if (!rate || Array.isArray(rate) || typeof rate !== "object") {
        throw new RatehawkSandboxValidationError("invalid_response");
      }
      if (!rateHash && typeof rate.book_hash === "string" && rate.book_hash.length > 0 && rate.book_hash.length <= 256) {
        rateHash = rate.book_hash;
      }
      rateCount += 1;
    }
  }
  if (data.hotels.length < 1 || rateCount < 1) {
    throw new RatehawkSandboxValidationError("invalid_response");
  }
  return { hotelCount: data.hotels.length, rateCount, rateHash };
}

async function runSearch(options: {
  environment: Record<string, string | undefined>;
  fetcher?: InventorySandboxFetch;
  now?: Date;
}) {
  const keyId = options.environment.HOTEL_INVENTORY_RATEHAWK_KEY_ID?.trim();
  const apiKey = options.environment.HOTEL_INVENTORY_RATEHAWK_API_KEY?.trim();
  if (!keyId || !apiKey) {
    throw new RatehawkSandboxValidationError("credentials_not_ready");
  }

  const testedAt = options.now ? new Date(options.now) : new Date();
  if (Number.isNaN(testedAt.getTime())) {
    throw new RatehawkSandboxValidationError("invalid_response");
  }
  const checkin = formatUtcDate(addUtcDays(testedAt, 30));
  const checkout = formatUtcDate(addUtcDays(testedAt, 32));
  const request = buildRatehawkSandboxHotelSearchRequest({
    keyId,
    apiKey,
    payload: {
      checkin,
      checkout,
      residency: "us",
      language: "en",
      guests: [{ adults: 2, children: [] }],
      hids: [sandboxHotelId],
      currency: "USD",
    },
  });
  const response = await executeInventorySandboxRequest(request, {
    environment: options.environment,
    fetcher: options.fetcher,
  });
  const summary = summarizeResponse(response);

  return {
    testedAt: testedAt.toISOString(),
    checkin,
    checkout,
    ...summary,
  };
}

export async function runRatehawkSandboxValidation(options: {
  environment: Record<string, string | undefined>;
  fetcher?: InventorySandboxFetch;
  now?: Date;
}): Promise<RatehawkSandboxValidationResult> {
  const result = await runSearch(options);
  return {
    testedAt: result.testedAt,
    checkin: result.checkin,
    checkout: result.checkout,
    hotelCount: result.hotelCount,
    rateCount: result.rateCount,
  };
}

export async function runRatehawkSandboxHotelpageForPrebook(options: {
  environment: Record<string, string | undefined>;
  fetcher?: InventorySandboxFetch;
  now?: Date;
}) {
  const keyId = options.environment.HOTEL_INVENTORY_RATEHAWK_KEY_ID?.trim();
  const apiKey = options.environment.HOTEL_INVENTORY_RATEHAWK_API_KEY?.trim();
  if (!keyId || !apiKey) {
    throw new RatehawkSandboxValidationError("credentials_not_ready");
  }

  const testedAt = options.now ? new Date(options.now) : new Date();
  if (Number.isNaN(testedAt.getTime())) {
    throw new RatehawkSandboxValidationError("invalid_response");
  }
  const checkin = formatUtcDate(addUtcDays(testedAt, 30));
  const checkout = formatUtcDate(addUtcDays(testedAt, 32));
  const request = buildRatehawkSandboxHotelpageRequest({
    keyId,
    apiKey,
    payload: {
      checkin,
      checkout,
      residency: "us",
      language: "en",
      guests: [{ adults: 2, children: [] }],
      hid: sandboxHotelId,
      currency: "USD",
    },
  });
  const response = await executeInventorySandboxRequest(request, {
    environment: options.environment,
    fetcher: options.fetcher,
  });
  const summary = summarizeResponse(response);
  if (!summary.rateHash) {
    throw new RatehawkSandboxValidationError("invalid_response");
  }

  return {
    testedAt: testedAt.toISOString(),
    checkin,
    checkout,
    ...summary,
  };
}
