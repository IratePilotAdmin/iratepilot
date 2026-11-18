import "server-only";

import type { Hotel } from "@/data/hotels";
import type { MarketplaceStayCriteria } from "@/lib/marketplace-search";
import { buildRatehawkSandboxGeoSearchRequest } from "./inventory-sandbox-request.server";
import {
  executeInventorySandboxRequest,
  type InventorySandboxFetch,
} from "./inventory-sandbox-transport.server";
import type { InventoryJsonValue } from "./inventory-response.server";

type Environment = Record<string, string | undefined>;

const losAngeles = { latitude: 34.077194, longitude: -118.36068, radius: 20_000 };
const fallbackImage = "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80";

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

function parseHotels(response: InventoryJsonValue, nights: number): Hotel[] {
  const root = objectValue(response);
  const data = objectValue(root?.data);
  if (root?.status !== "ok" || !Array.isArray(data?.hotels)) return [];
  return data.hotels.slice(0, 20).flatMap((hotelValue): Hotel[] => {
    const hotel = objectValue(hotelValue);
    const hotelIdentifier = hotel?.id ?? hotel?.hid;
    const id = typeof hotelIdentifier === "string" || typeof hotelIdentifier === "number"
      ? String(hotelIdentifier)
      : "";
    const rates = Array.isArray(hotel?.rates) ? hotel.rates : [];
    const prices = rates.flatMap((rate) => {
      const price = rateNightlyPrice(rate, nights);
      return price !== null && price >= 25 && price <= 25_000 ? [price] : [];
    });
    if (!id || prices.length === 0) return [];
    return [{
      slug: `ratehawk-sandbox-${encodeURIComponent(id)}`,
      name: `RateHawk sandbox hotel ${id}`,
      city: "Los Angeles",
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
}

export async function getRatehawkCertificationHotels(
  criteria: MarketplaceStayCriteria,
  options: { environment?: Environment; fetcher?: InventorySandboxFetch } = {},
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
  const request = buildRatehawkSandboxGeoSearchRequest({
    keyId,
    apiKey,
    payload: {
      checkin: criteria.checkIn,
      checkout: criteria.checkOut,
      residency: "us",
      language: "en",
      guests: [{ adults, children: criteria.childAges }],
      latitude: losAngeles.latitude,
      longitude: losAngeles.longitude,
      radius: losAngeles.radius,
      hotels_limit: 20,
      currency: "USD",
      timeout: 8,
    },
  });
  try {
    const response = await executeInventorySandboxRequest(request, { environment, fetcher: options.fetcher });
    const checkin = new Date(`${criteria.checkIn}T00:00:00Z`);
    const checkout = new Date(`${criteria.checkOut}T00:00:00Z`);
    const nights = Math.max(1, Math.round((checkout.getTime() - checkin.getTime()) / 86_400_000));
    return parseHotels(response, nights);
  } catch {
    return [];
  }
}
