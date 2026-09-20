import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn() }));

vi.mock("@/data/hotels", () => ({ hotels: [{ city: "Miami", country: "US", name: "Demo Hotel" }] }));
vi.mock("@/config/fees", () => ({ fees: { serviceFeeRate: 0.03 } }));
vi.mock("@/config/memberships", () => ({ memberships: {} }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/memberships/eligibility", () => ({ getActiveMembershipTier: vi.fn() }));
vi.mock("@/lib/inventory-limits", () => ({
  inventoryLimits: { minGuests: 1, maxGuests: 20, minNightlyRate: 25, maxNightlyRate: 25_000 },
}));
vi.mock("@/lib/hotels/publication-gate", () => ({
  isHotelPublicationEnabled: () => process.env.HOTEL_PUBLICATION_ENABLED === "true",
}));
vi.mock("@/lib/marketplace-search", () => ({
  getAvailableRoomRates: vi.fn(),
  getAvailableRooms: vi.fn(),
  hasStayCriteria: vi.fn(),
  matchesMarketplaceDestination: (hotel: { city: string }, destination: string) =>
    hotel.city.toLowerCase().includes(destination.toLowerCase()),
}));

import { getMarketplaceHotels } from "../lib/data/marketplace";

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env.HOTEL_PUBLICATION_ENABLED;
});

describe("public marketplace publication gate", () => {
  it("never reads production hotel records while publication is locked", async () => {
    const result = await getMarketplaceHotels({ destination: "Ridgeland" });

    expect(result.source).toBe("demo");
    expect(result.hotels).toEqual([]);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
