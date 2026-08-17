import { describe, expect, it } from "vitest";
import type { Hotel } from "../data/hotels";
import { filterAndSortMarketplaceHotels } from "../lib/marketplace-results";

const stays: Hotel[] = [
  {
    slug: "five-expensive",
    name: "Five Expensive",
    city: "Miami",
    country: "United States",
    stars: 5,
    rating: 9.6,
    reviews: 10,
    price: 500,
    image: "https://example.com/five.jpg",
    amenities: [],
    description: "Five-star test stay",
  },
  {
    slug: "four-affordable",
    name: "Four Affordable",
    city: "Miami",
    country: "United States",
    stars: 4,
    rating: 8.8,
    reviews: 10,
    price: 200,
    image: "https://example.com/four.jpg",
    amenities: [],
    description: "Four-star test stay",
  },
  {
    slug: "five-value",
    name: "Five Value",
    city: "Miami",
    country: "United States",
    stars: 5,
    rating: 9.1,
    reviews: 10,
    price: 300,
    image: "https://example.com/value.jpg",
    amenities: [],
    description: "Five-star value stay",
  },
];

describe("marketplace result controls", () => {
  it("filters by price and selected star classes", () => {
    const result = filterAndSortMarketplaceHotels(stays, {
      maxPrice: 350,
      stars: [5],
      sort: "recommended",
    });

    expect(result.map((hotel) => hotel.slug)).toEqual(["five-value"]);
  });

  it("sorts visible results without mutating the server-provided order", () => {
    const result = filterAndSortMarketplaceHotels(stays, {
      maxPrice: 1000,
      stars: [4, 5],
      sort: "price-low",
    });

    expect(result.map((hotel) => hotel.price)).toEqual([200, 300, 500]);
    expect(stays.map((hotel) => hotel.price)).toEqual([500, 200, 300]);
  });
});
