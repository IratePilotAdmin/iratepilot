import "server-only";

import { buildRatehawkSandboxHotelPrebookRequest } from "./inventory-sandbox-request.server";
import {
  executeInventorySandboxRequest,
  type InventorySandboxFetch,
} from "./inventory-sandbox-transport.server";
import type { InventoryJsonValue } from "./inventory-response.server";

export type RatehawkSandboxPrebookResult = {
  testedAt: string;
  priceChanged: boolean;
  hotelCount: number;
  rateCount: number;
};

export class RatehawkSandboxPrebookError extends Error {
  constructor(readonly code: "credentials_not_ready" | "invalid_input" | "invalid_response") {
    super(`RateHawk sandbox prebook validation failed (${code}).`);
    this.name = "RatehawkSandboxPrebookError";
  }
}

function objectValue(value: InventoryJsonValue | undefined) {
  return value && !Array.isArray(value) && typeof value === "object" ? value : null;
}

function summarizePrebookResponse(response: InventoryJsonValue) {
  const root = objectValue(response ?? undefined);
  if (!root || root.status !== "ok") {
    throw new RatehawkSandboxPrebookError("invalid_response");
  }
  const data = objectValue(root.data);
  const changes = objectValue(data?.changes);
  if (!data || !changes || typeof changes.price_changed !== "boolean" || !Array.isArray(data.hotels)) {
    throw new RatehawkSandboxPrebookError("invalid_response");
  }

  let rateCount = 0;
  for (const hotelValue of data.hotels) {
    const hotel = objectValue(hotelValue);
    if (!hotel || !Array.isArray(hotel.rates)) {
      throw new RatehawkSandboxPrebookError("invalid_response");
    }
    for (const rateValue of hotel.rates) {
      const rate = objectValue(rateValue);
      const bookHash = rate?.book_hash;
      if (!rate || typeof bookHash !== "string" || !bookHash || bookHash.length > 256) {
        throw new RatehawkSandboxPrebookError("invalid_response");
      }
      rateCount += 1;
    }
  }
  if (data.hotels.length < 1 || rateCount < 1) {
    throw new RatehawkSandboxPrebookError("invalid_response");
  }

  return {
    priceChanged: changes.price_changed,
    hotelCount: data.hotels.length,
    rateCount,
  };
}

export async function runRatehawkSandboxPrebookValidation(options: {
  environment: Record<string, string | undefined>;
  rateHash: string;
  priceIncreasePercent?: number;
  fetcher?: InventorySandboxFetch;
  now?: Date;
}): Promise<RatehawkSandboxPrebookResult> {
  const keyId = options.environment.HOTEL_INVENTORY_RATEHAWK_KEY_ID?.trim();
  const apiKey = options.environment.HOTEL_INVENTORY_RATEHAWK_API_KEY?.trim();
  if (!keyId || !apiKey) {
    throw new RatehawkSandboxPrebookError("credentials_not_ready");
  }

  let request;
  try {
    request = buildRatehawkSandboxHotelPrebookRequest({
      keyId,
      apiKey,
      rateHash: options.rateHash,
      priceIncreasePercent: options.priceIncreasePercent,
    });
  } catch {
    throw new RatehawkSandboxPrebookError("invalid_input");
  }

  const testedAt = options.now ? new Date(options.now) : new Date();
  if (Number.isNaN(testedAt.getTime())) {
    throw new RatehawkSandboxPrebookError("invalid_input");
  }
  const response = await executeInventorySandboxRequest(request, {
    environment: options.environment,
    fetcher: options.fetcher,
    timeoutMs: 60_000,
  });

  return {
    testedAt: testedAt.toISOString(),
    ...summarizePrebookResponse(response),
  };
}
