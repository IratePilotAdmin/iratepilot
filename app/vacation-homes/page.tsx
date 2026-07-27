import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { HotelCard } from "@/components/hotels/hotel-card";
import { hotels } from "@/data/hotels";

export default function VacationHomesPage() {
  const homes = hotels.filter(h => h.slug.includes("villa"));
  return <><SiteHeader /><main className="container-page py-12"><h1 className="text-3xl font-bold">Luxury vacation homes</h1><p className="mt-2 text-slate-500">Private, verified, and professionally managed.</p><div className="mt-8 grid gap-6">{homes.map(h => <HotelCard key={h.slug} hotel={h} />)}</div></main><SiteFooter /></>;
}
