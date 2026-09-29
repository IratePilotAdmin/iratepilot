"use client";

import Link from "next/link";
import { ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { Hotel } from "@/data/hotels";
import { HotelCard } from "@/components/hotels/hotel-card";
import { FilterPanel } from "@/components/search/filter-panel";
import {
  filterAndSortMarketplaceHotels,
  type MarketplaceSort,
} from "@/lib/marketplace-results";

type SearchResultsProps = {
  hotels: Hotel[];
  source: "database" | "demo";
  availabilitySearch: boolean;
  hotelHrefs: Record<string, string>;
};

export function SearchResults({
  hotels,
  source,
  availabilitySearch,
  hotelHrefs,
}: SearchResultsProps) {
  const highestPrice = useMemo(
    () => Math.max(100, Math.ceil(Math.max(...hotels.map((hotel) => hotel.price), 0) / 50) * 50),
    [hotels],
  );
  const [maxPrice, setMaxPrice] = useState(highestPrice);
  const [fourStar, setFourStar] = useState(true);
  const [fiveStar, setFiveStar] = useState(true);
  const [sort, setSort] = useState<MarketplaceSort>("recommended");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const visibleHotels = useMemo(
    () => filterAndSortMarketplaceHotels(hotels, {
      maxPrice,
      stars: [fourStar ? 4 : null, fiveStar ? 5 : null].filter(
        (star): star is 4 | 5 => star !== null,
      ),
      sort,
    }),
    [fiveStar, fourStar, hotels, maxPrice, sort],
  );

  const resetFilters = () => {
    setMaxPrice(highestPrice);
    setFourStar(true);
    setFiveStar(true);
  };
  const filtersChanged = maxPrice < highestPrice || !fourStar || !fiveStar;
  const sourceLabel = source === "database"
    ? availabilitySearch
      ? "available"
      : "approved"
    : "demo";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div aria-live="polite">
          <strong className="text-xl text-slate-950">
            {visibleHotels.length} {sourceLabel} {visibleHotels.length === 1 ? "stay" : "stays"}
          </strong>
          <span className="ml-2 text-sm text-slate-500">
            {source === "database"
              ? availabilitySearch
                ? "Verified for every selected night"
                : "Approved marketplace inventory"
              : "Private demo listings · availability not connected"}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="result-control lg:hidden"
            aria-expanded={mobileFiltersOpen}
            onClick={() => setMobileFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal /> Filters
          </button>
          <select
            className="result-control"
            value={sort}
            onChange={(event) => setSort(event.target.value as MarketplaceSort)}
            aria-label="Sort results"
          >
            <option value="recommended">Recommended</option>
            <option value="rating">Guest rating</option>
            <option value="price-low">Price: low to high</option>
          </select>
        </div>
      </div>

      <div className="mt-7 grid gap-8 lg:grid-cols-[280px_1fr]">
        <div className="hidden lg:block">
          <FilterPanel
            maxPrice={maxPrice}
            highestPrice={highestPrice}
            fourStar={fourStar}
            fiveStar={fiveStar}
            filtersChanged={filtersChanged}
            onMaxPriceChange={setMaxPrice}
            onFourStarChange={setFourStar}
            onFiveStarChange={setFiveStar}
            onReset={resetFilters}
          />
        </div>
        <div>
          {mobileFiltersOpen && (
            <div className="mb-5 lg:hidden">
              <FilterPanel
                maxPrice={maxPrice}
                highestPrice={highestPrice}
                fourStar={fourStar}
                fiveStar={fiveStar}
                filtersChanged={filtersChanged}
                onMaxPriceChange={setMaxPrice}
                onFourStarChange={setFourStar}
                onFiveStarChange={setFiveStar}
                onReset={resetFilters}
              />
            </div>
          )}
          <div className="smart-result-banner">
            {source === "database" ? <ShieldCheck /> : <Sparkles />}
            <div>
              <strong>
                {source === "database"
                  ? availabilitySearch
                    ? "Availability verified"
                    : "Approved partner inventory"
                  : "Private demo preview"}
              </strong>
              <p>
                {source === "database"
                  ? availabilitySearch
                    ? "Every result has an active room for your dates and guest count."
                    : "Add dates to verify room availability and nightly rates."
                  : "Sample properties demonstrate discovery; availability and booking are disabled."}
              </p>
            </div>
            <Link href="/ai-planner">Preview AI planner</Link>
          </div>
          {visibleHotels.length ? (
            <div className="mt-5 grid gap-5">
              {visibleHotels.map((hotel, index) => (
                <HotelCard
                  key={hotel.slug}
                  hotel={hotel}
                  rank={index + 1}
                  source={source}
                  hotelHref={hotelHrefs[hotel.slug]}
                />
              ))}
            </div>
          ) : (
            <div className="card mt-5 p-8">
              <h2 className="text-xl font-bold">No stays match these filters</h2>
              <p className="mt-2 text-slate-600">Increase the price limit or restore a property class.</p>
              <button type="button" className="btn-secondary mt-5" onClick={resetFilters}>
                Reset filters
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
