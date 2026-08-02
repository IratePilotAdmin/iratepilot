import Link from "next/link";
import { ArrowRight, Bot, Map, SlidersHorizontal, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { FilterPanel } from "@/components/search/filter-panel";
import { SearchForm } from "@/components/search/search-form";
import { HotelCard } from "@/components/hotels/hotel-card";
import { getMarketplaceHotels } from "@/lib/data/marketplace";
import { getHotelSearchHref, hasStayCriteria, parseMarketplaceSearch } from "@/lib/marketplace-search";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const search = parseMarketplaceSearch(query);
  const marketplace = await getMarketplaceHotels(search.criteria);
  const hotels = search.error ? [] : marketplace.hotels;
  const { source } = marketplace;
  const availabilitySearch = hasStayCriteria(search.criteria);
  const searchKey = Object.values(search.values).join("|");
  return (
    <>
      <SiteHeader />
      <main>
        <section className="search-hero">
          <div className="container-page py-10 sm:py-14">
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
              <div>
                <span className="section-kicker">Premium collection</span>
                <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">Find a stay worth remembering.</h1>
                <p className="mt-3 text-slate-600">Verified 4- and 5-star hotels, resorts, and premium vacation homes.</p>
              </div>
              <div className="ai-match-note"><Bot /><span><strong>AI-curated results</strong><small>Ranked for quality, value, and guest fit</small></span></div>
            </div>
            <div className="mt-8"><SearchForm key={searchKey} initialValues={search.values} /></div>
          </div>
        </section>

        <section className="container-page py-10">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6">
            <div><strong className="text-xl text-slate-950">{hotels.length} {source === "database" && availabilitySearch ? "available" : "premium"} stays</strong><span className="ml-2 text-sm text-slate-500">{source === "database" ? availabilitySearch ? "Verified for every selected night" : "Approved marketplace inventory" : "Private demo listings · availability not connected"}</span></div>
            <div className="flex gap-2">
              <button className="result-control lg:hidden"><SlidersHorizontal /> Filters</button>
              <button className="result-control"><Map /> Map view</button>
              <select className="result-control" defaultValue="recommended" aria-label="Sort results">
                <option value="recommended">Recommended</option>
                <option value="rating">Guest rating</option>
                <option value="price-low">Price: low to high</option>
              </select>
            </div>
          </div>

          <div className="mt-7 grid gap-8 lg:grid-cols-[280px_1fr]">
            <div className="hidden lg:block"><FilterPanel /></div>
            <div>
              <div className="smart-result-banner">
                <Sparkles />
                <div><strong>{availabilitySearch && source === "database" ? "Availability verified" : "Smart Match is on"}</strong><p>{availabilitySearch && source === "database" ? "Every result has an active room for your dates and guest count." : "Results prioritize premium quality and total value—not paid placement."}</p></div>
                <Link href="/ai-planner">Refine with AI <ArrowRight /></Link>
              </div>
              {search.error ? <div className="card mt-5 p-8"><h2 className="text-xl font-bold">Check your search details</h2><p className="mt-2 text-slate-600">{search.error}</p></div> : hotels.length ? <div className="mt-5 grid gap-5">{hotels.map((hotel, index) => <HotelCard key={hotel.slug} hotel={hotel} rank={index + 1} source={source} hotelHref={getHotelSearchHref(hotel.slug, search.criteria)} />)}</div> : <div className="card mt-5 p-8"><h2 className="text-xl font-bold">No stays match this search</h2><p className="mt-2 text-slate-600">Try different dates, fewer guests, or another destination.</p></div>}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
