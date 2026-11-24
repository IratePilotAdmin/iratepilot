import "server-only";

import type { Hotel } from "@/data/hotels";
import type { MarketplaceStayCriteria } from "@/lib/marketplace-search";
import { buildRatehawkSandboxHotelSearchRequest } from "./inventory-sandbox-request.server";
import {
  executeInventorySandboxRequest,
  InventorySandboxTransportError,
  type InventorySandboxFetch,
} from "./inventory-sandbox-transport.server";
import {
  InventorySupplierResponseError,
  type InventoryJsonValue,
} from "./inventory-response.server";

type Environment = Record<string, string | undefined>;

const certificationHotels = new Map([
  ["10004834", { name: "Conrad Los Angeles", city: "Los Angeles" }],
  ["8819557", { name: "Rosa Bell Motel", city: "Los Angeles" }],
]);
const fallbackImage = "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80";

type CertificationSearchDiagnostic = {
  event: "ratehawk_certification_search";
  outcome:
    | "mapped"
    | "no_hotels"
    | "no_certification_hotels"
    | "no_usable_rates"
    | "invalid_supplier_response"
    | "transport_error"
    | "supplier_response_error"
    | "unexpected_error";
  hotelCount?: number;
  certificationHotelCount?: number;
  mappedHotelCount?: number;
  errorCode?: string;
  httpStatus?: number;
};

type CertificationSearchLogger = (diagnostic: CertificationSearchDiagnostic) => void;

function objectValue(value: InventoryJsonValue | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function isLosAngeles(destination: string) {
  return destination.trim().toLocaleLowerCase().includes("los angeles");
}

function isCertificationRuntime(environment: Environment) {
  const vercelEnvironment = environment.VERCEL_ENV?.trim().toLocaleLowerCase();
  if (vercelEnvironment) return vercelEnvironment === "preview";
  return environment.NODE_ENV?.trim().toLocaleLowerCase() !== "production";
}

function isSandboxEnabled(environment: Environment) {
  return environment.HOTEL_INVENTORY_RATEHAWK_SANDBOX_ENABLED?.trim().toLocaleLowerCase() === "true";
}

function isWithinRatehawkSearchHorizon(checkIn: string, now = new Date()) {
  const checkInDate = new Date(`${checkIn}T00:00:00Z`);
  if (!Number.isFinite(checkInDate.getTime())) return false;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysUntilCheckIn = Math.floor((checkInDate.getTime() - today) / 86_400_000);
  return daysUntilCheckIn >= 0 && daysUntilCheckIn <= 730;
}

function rateNightlyPrice(rate: InventoryJsonValue, nights: number) {
  const source = objectValue(rate);
  if (!source) return null;
  const dailyPrices = Array.isArray(source.daily_prices)
    ? source.daily_prices.map(Number).filter((value) => Number.isFinite(value) && value > 0)
    : [];
  if (dailyPrices.length > 0) {
    return Math.round((dailyPrices.reduce((sum, value) => sum + value, 0) / dailyPrices.length) * 100) / 100;
  }
  const paymentOptions = objectValue(source.payment_options);
  const paymentTypes = Array.isArray(paymentOptions?.payment_types) ? paymentOptions.payment_types : [];
  const totals = paymentTypes.flatMap((paymentType) => {
    const payment = objectValue(paymentType);
    const amount = Number(payment?.amount);
    return Number.isFinite(amount) && amount > 0 ? [amount] : [];
  });
  return totals.length > 0 ? Math.round((Math.min(...totals) / nights) * 100) / 100 : null;
}

function parseHotels(response: InventoryJsonValue, nights: number): {
  hotels: Hotel[];
  diagnostic: CertificationSearchDiagnostic;
} {
  const root = objectValue(response);
  const data = objectValue(root?.data);
  if (root?.status !== "ok" || !Array.isArray(data?.hotels)) {
    return {
      hotels: [],
      diagnostic: { event: "ratehawk_certification_search", outcome: "invalid_supplier_response" },
    };
  }
  const supplierHotels = data.hotels.slice(0, 20);
  let certificationHotelCount = 0;
  const hotels = supplierHotels.flatMap((hotelValue): Hotel[] => {
    const hotel = objectValue(hotelValue);
    const hotelIdentifier = hotel?.hid ?? hotel?.id;
    const id = typeof hotelIdentifier === "string" || typeof hotelIdentifier === "number"
      ? String(hotelIdentifier)
      : "";
    const certificationHotel = certificationHotels.get(id);
    if (!certificationHotel) return [];
    certificationHotelCount += 1;
    const rates = Array.isArray(hotel?.rates) ? hotel.rates : [];
    const prices = rates.flatMap((rate) => {
      const price = rateNightlyPrice(rate, nights);
      return price !== null && price >= 25 && price <= 25_000 ? [price] : [];
    });
    if (!id || prices.length === 0) return [];
    return [{
      slug: `ratehawk-sandbox-${encodeURIComponent(id)}`,
      name: certificationHotel.name,
      city: certificationHotel.city,
      country: "United States",
      stars: 4,
      rating: 0,
      reviews: 0,
      price: Math.min(...prices),
      image: fallbackImage,
      amenities: ["RateHawk SERP", "Sandbox availability", "Certification preview"],
      description: "Availability returned by RateHawk's sandbox geographic hotel search for certification review. Booking is disabled in this preview.",
    }];
  });
  const outcome = hotels.length > 0
    ? "mapped"
    : supplierHotels.length === 0
      ? "no_hotels"
      : certificationHotelCount === 0
        ? "no_certification_hotels"
        : "no_usable_rates";
  return {
    hotels,
    diagnostic: {
      event: "ratehawk_certification_search",
      outcome,
      hotelCount: supplierHotels.length,
      certificationHotelCount,
      mappedHotelCount: hotels.length,
    },
  };
}

export async function getRatehawkCertificationHotels(
  criteria: MarketplaceStayCriteria,
  options: {
    environment?: Environment;
    fetcher?: InventorySandboxFetch;
    logger?: CertificationSearchLogger;
  } = {},
): Promise<Hotel[] | null> {
  const environment = options.environment ?? process.env;
  if (
    !isLosAngeles(criteria.destination)
    || !isCertificationRuntime(environment)
    || !isSandboxEnabled(environment)
    || !isWithinRatehawkSearchHorizon(criteria.checkIn)
  ) return null;
  const adults = criteria.guests - criteria.childAges.length;
  if (criteria.guests > 10 || adults > 6 || criteria.childAges.length > 4) return null;
  const keyId = environment.HOTEL_INVENTORY_RATEHAWK_KEY_ID?.trim();
  const apiKey = environment.HOTEL_INVENTORY_RATEHAWK_API_KEY?.trim();
  if (!keyId || !apiKey) return null;
  const request = buildRatehawkSandboxHotelSearchRequest({
    keyId,
    apiKey,
    payload: {
      checkin: criteria.checkIn,
      checkout: criteria.checkOut,
      residency: "us",
      language: "en",
      guests: [{ adults, children: criteria.childAges }],
      hids: [...certificationHotels.keys()].map(Number),
      currency: "USD",
      timeout: 8,
    },
  });
  try {
    const response = await executeInventorySandboxRequest(request, { environment, fetcher: options.fetcher });
    const checkin = new Date(`${criteria.checkIn}T00:00:00Z`);
    const checkout = new Date(`${criteria.checkOut}T00:00:00Z`);
    const nights = Math.max(1, Math.round((checkout.getTime() - checkin.getTime()) / 86_400_000));
    const parsed = parseHotels(response, nights);
    (options.logger ?? console.info)(parsed.diagnostic);
    return parsed.hotels;
  } catch (error) {
    const diagnostic: CertificationSearchDiagnostic = error instanceof InventorySandboxTransportError
      ? {
          event: "ratehawk_certification_search",
          outcome: "transport_error",
          errorCode: error.code,
        }
      : error instanceof InventorySupplierResponseError
        ? {
            event: "ratehawk_certification_search",
            outcome: "supplier_response_error",
            errorCode: error.code,
            ...(error.status === undefined ? {} : { httpStatus: error.status }),
          }
        : { event: "ratehawk_certification_search", outcome: "unexpected_error" };
    (options.logger ?? console.warn)(diagnostic);
    return [];
  }
}
