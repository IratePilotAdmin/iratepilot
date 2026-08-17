import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("marketplace private-pilot disclosures", () => {
  it("keeps search source-aware and removes inactive controls", () => {
    const searchPage = read("../app/search/page.tsx");
    const searchResults = read("../components/search/search-results.tsx");

    expect(searchPage).not.toContain("Verified 4- and 5-star");
    expect(searchPage).toContain("Private-pilot marketplace");
    expect(searchResults).toContain("Private demo preview");
    expect(searchResults).not.toContain("Map view");
    expect(searchResults).not.toContain("Smart Match");
  });

  it("labels demo property details, ratings, and rates as samples", () => {
    const hotelPage = read("../app/hotels/[slug]/page.tsx");
    const hotelCard = read("../components/hotels/hotel-card.tsx");
    const vacationHomes = read("../app/vacation-homes/page.tsx");

    expect(hotelPage).not.toContain("{hotel.stars}-star verified");
    expect(hotelPage).toContain("Private demo · booking disabled");
    expect(hotelPage).toContain('loading="eager"');
    expect(hotelCard).toContain("Sample from");
    expect(hotelCard).toContain("Demo order");
    expect(hotelCard).toContain('loading={rank === 1 ? "eager" : "lazy"}');
    expect(vacationHomes).toContain("They are not verified partner listings");
  });
});
