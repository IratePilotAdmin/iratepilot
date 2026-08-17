import type { Hotel } from "@/data/hotels";

export type MarketplaceSort = "recommended" | "rating" | "price-low";

export type MarketplaceResultFilters = {
  maxPrice: number;
  stars: Array<4 | 5>;
  sort: MarketplaceSort;
};

export function filterAndSortMarketplaceHotels(
  hotels: Hotel[],
  filters: MarketplaceResultFilters,
) {
  const filtered = hotels.filter(
    (hotel) => hotel.price <= filters.maxPrice && filters.stars.includes(hotel.stars),
  );

  if (filters.sort === "rating") {
    return filtered.sort((left, right) => right.rating - left.rating);
  }

  if (filters.sort === "price-low") {
    return filtered.sort((left, right) => left.price - right.price);
  }

  return filtered;
}
