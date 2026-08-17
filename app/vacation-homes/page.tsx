import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { HotelCard } from "@/components/hotels/hotel-card";
import { hotels } from "@/data/hotels";

export default function VacationHomesPage() {
  const homes = hotels.filter(h => h.slug.includes("villa"));
  return <><SiteHeader /><main className="container-page py-12"><span className="section-kicker">Private-pilot preview</span><h1 className="mt-3 text-3xl font-bold">Luxury vacation homes</h1><p className="mt-2 max-w-2xl text-slate-500">These sample homes demonstrate the future marketplace experience. They are not verified partner listings, live inventory, or currently bookable.</p><div className="mt-8 grid gap-6">{homes.map(h => <HotelCard key={h.slug} hotel={h} source="demo" />)}</div></main><SiteFooter /></>;
}
