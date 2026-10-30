import "server-only";

import { buildExpediaRapidSandboxAvailabilityRequest } from "./inventory-sandbox-request.server";
import {
  executeInventorySandboxRequest,
  type InventorySandboxFetch,
} from "./inventory-sandbox-transport.server";
import type { InventoryJsonValue } from "./inventory-response.server";

const sandboxPropertyId = "19248";

export type ExpediaRapidSandboxValidationResult = {
  testedAt: string;
  checkin: string;
  checkout: string;
  hotelCount: number;
  rateCount: number;
};

export class ExpediaRapidSandboxValidationError extends Error {
  constructor(readonly code: "credentials_not_ready" | "invalid_response") {
    super(`Expedia Rapid sandbox validation failed (${code}).`);
    this.name = "ExpediaRapidSandboxValidationError";
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
  if (!Array.isArray(response) || response.length < 1) {
    throw new ExpediaRapidSandboxValidationError("invalid_response");
  }

  let hotelCount = 0;
  let rateCount = 0;
  for (const property of response) {
    if (!property || Array.isArray(property) || typeof property !== "object") {
      throw new ExpediaRapidSandboxValidationError("invalid_response");
    }
    if (typeof property.property_id !== "string" && typeof property.property_id !== "number") {
      throw new ExpediaRapidSandboxValidationError("invalid_response");
    }
    if (!Array.isArray(property.rooms)) continue;

    let propertyRateCount = 0;
    for (const room of property.rooms) {
      if (!room || Array.isArray(room) || typeof room !== "object" || !Array.isArray(room.rates)) {
        throw new ExpediaRapidSandboxValidationError("invalid_response");
      }
      for (const rate of room.rates) {
        if (!rate || Array.isArray(rate) || typeof rate !== "object") {
          throw new ExpediaRapidSandboxValidationError("invalid_response");
        }
        propertyRateCount += 1;
      }
    }
    if (propertyRateCount > 0) hotelCount += 1;
    rateCount += propertyRateCount;
  }

  if (hotelCount < 1 || rateCount < 1) {
    throw new ExpediaRapidSandboxValidationError("invalid_response");
  }
  return { hotelCount, rateCount };
}

export async function runExpediaRapidSandboxValidation(options: {
  environment: Record<string, string | undefined>;
  fetcher?: InventorySandboxFetch;
  now?: Date;
}): Promise<ExpediaRapidSandboxValidationResult> {
  const apiKey = options.environment.HOTEL_INVENTORY_EXPEDIA_RAPID_API_KEY?.trim();
  const sharedSecret = options.environment.HOTEL_INVENTORY_EXPEDIA_RAPID_SHARED_SECRET?.trim();
  if (!apiKey || !sharedSecret) {
    throw new ExpediaRapidSandboxValidationError("credentials_not_ready");
  }

  const testedAt = options.now ? new Date(options.now) : new Date();
  if (Number.isNaN(testedAt.getTime())) {
    throw new ExpediaRapidSandboxValidationError("invalid_response");
  }
  const checkin = formatUtcDate(addUtcDays(testedAt, 30));
  const checkout = formatUtcDate(addUtcDays(testedAt, 32));
  const request = buildExpediaRapidSandboxAvailabilityRequest({
    apiKey,
    sharedSecret,
    timestampSeconds: Math.floor(testedAt.getTime() / 1000),
    query: {
      property_id: sandboxPropertyId,
      checkin,
      checkout,
      currency: "USD",
      country_code: "US",
      language: "en-US",
      occupancy: 2,
      rate_plan_count: 1,
      sales_channel: "website",
      sales_environment: "hotel_only",
      travel_purpose: "leisure",
    },
  });
  const response = await executeInventorySandboxRequest(request, {
    environment: options.environment,
    fetcher: options.fetcher,
  });

  return {
    testedAt: testedAt.toISOString(),
    checkin,
    checkout,
    ...summarizeResponse(response),
  };
}
