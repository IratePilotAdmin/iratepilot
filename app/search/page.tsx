import { ShieldCheck } from "lucide-react";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { SearchForm } from "@/components/search/search-form";
import { SearchResults } from "@/components/search/search-results";
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
  const hotelHrefs = Object.fromEntries(
    hotels.map((hotel) => [hotel.slug, getHotelSearchHref(hotel.slug, search.criteria)]),
  );
  return (
    <>
      <SiteHeader />
      <main>
        <section className="search-hero">
          <div className="container-page py-10 sm:py-14">
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
              <div>
                <span className="section-kicker">Private-pilot marketplace</span>
                <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">Find a stay worth remembering.</h1>
                <p className="mt-3 text-slate-600">Curated hotels, resorts, and premium vacation homes. Approved partner inventory and private demo listings are clearly identified.</p>
              </div>
              <div className="ai-match-note"><ShieldCheck /><span><strong>{source === "database" ? "Approved partner inventory" : "Private demo inventory"}</strong><small>{source === "database" ? "Publication-reviewed marketplace listings" : "Sample properties · booking disabled"}</small></span></div>
            </div>
            <div className="mt-8"><SearchForm key={searchKey} initialValues={search.values} /></div>
          </div>
        </section>

        <section className="container-page py-10">
          {search.error ? (
            <div className="card p-8">
              <h2 className="text-xl font-bold">Check your search details</h2>
              <p className="mt-2 text-slate-600">{search.error}</p>
            </div>
          ) : hotels.length ? (
            <SearchResults
              key={searchKey}
              hotels={hotels}
              source={source}
              availabilitySearch={availabilitySearch}
              hotelHrefs={hotelHrefs}
            />
          ) : (
            <div className="card p-8">
              <h2 className="text-xl font-bold">No stays match this search</h2>
              <p className="mt-2 text-slate-600">Try different dates, fewer guests, or another destination.</p>
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
