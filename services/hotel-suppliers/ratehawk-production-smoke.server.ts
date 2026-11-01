import "server-only";

import { buildRatehawkProductionHotelSearchRequest } from "./inventory-sandbox-request.server";
import type { InventoryJsonValue } from "./inventory-response.server";
import type { InventorySandboxFetch } from "./inventory-sandbox-transport.server";
import { executeRatehawkProductionSmokeRequest } from "./ratehawk-production-transport.server";

export type RatehawkProductionSmokeResult = {
  testedAt: string;
  checkin: string;
  checkout: string;
  hotelCount: number;
  rateCount: number;
};

export class RatehawkProductionSmokeError extends Error {
  constructor(readonly code: "configuration_not_ready" | "invalid_response") {
    super(`RateHawk production smoke failed (${code}).`);
    this.name = "RatehawkProductionSmokeError";
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

function summarize(response: InventoryJsonValue) {
  if (!response || Array.isArray(response) || typeof response !== "object"
    || response.status !== "ok") throw new RatehawkProductionSmokeError("invalid_response");
  const data = response.data;
  if (!data || Array.isArray(data) || typeof data !== "object" || !Array.isArray(data.hotels)) {
    throw new RatehawkProductionSmokeError("invalid_response");
  }
  let rateCount = 0;
  for (const hotel of data.hotels) {
    if (!hotel || Array.isArray(hotel) || typeof hotel !== "object" || !Array.isArray(hotel.rates)) {
      throw new RatehawkProductionSmokeError("invalid_response");
    }
    rateCount += hotel.rates.length;
  }
  if (data.hotels.length < 1 || rateCount < 1) {
    throw new RatehawkProductionSmokeError("invalid_response");
  }
  return { hotelCount: data.hotels.length, rateCount };
}

export async function runRatehawkProductionSmoke(options: {
  environment: Record<string, string | undefined>;
  fetcher?: InventorySandboxFetch;
  now?: Date;
}): Promise<RatehawkProductionSmokeResult> {
  const keyId = options.environment.HOTEL_INVENTORY_RATEHAWK_PRODUCTION_KEY_ID?.trim();
  const apiKey = options.environment.HOTEL_INVENTORY_RATEHAWK_PRODUCTION_API_KEY?.trim();
  const hotelId = Number(options.environment.HOTEL_INVENTORY_RATEHAWK_PRODUCTION_SMOKE_HOTEL_ID);
  if (!keyId || !apiKey || !Number.isSafeInteger(hotelId) || hotelId <= 0) {
    throw new RatehawkProductionSmokeError("configuration_not_ready");
  }
  const testedAt = options.now ? new Date(options.now) : new Date();
  if (Number.isNaN(testedAt.getTime())) throw new RatehawkProductionSmokeError("invalid_response");
  const checkin = dateOnly(addDays(testedAt, 30));
  const checkout = dateOnly(addDays(testedAt, 32));
  const response = await executeRatehawkProductionSmokeRequest(
    buildRatehawkProductionHotelSearchRequest({
      keyId,
      apiKey,
      payload: {
        checkin,
        checkout,
        residency: "us",
        language: "en",
        guests: [{ adults: 2, children: [] }],
        hids: [hotelId],
        currency: "USD",
      },
    }),
    { environment: options.environment, fetcher: options.fetcher },
  );
  return { testedAt: testedAt.toISOString(), checkin, checkout, ...summarize(response) };
}
