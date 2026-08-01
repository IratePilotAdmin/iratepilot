import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bot, Check, ChevronRight, Heart, MapPin, ShieldCheck, Sparkles, Star } from "lucide-react";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { RoomCard } from "@/components/hotels/room-card";
import { BookingRequestForm } from "@/components/bookings/booking-request-form";
import { getMarketplaceHotel } from "@/lib/data/marketplace";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function HotelPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { hotel, source, rooms } = await getMarketplaceHotel(slug);
  if (!hotel) notFound();
  const stringParam = (name: string) => typeof query[name] === "string" ? query[name] : undefined;
  const initialSelection = {
    roomId: stringParam("roomId"),
    checkIn: stringParam("checkIn"),
    checkOut: stringParam("checkOut"),
    guests: stringParam("guests")
  };
  const testCheckoutEnabled = process.env.ENABLE_TEST_CHECKOUT === "true" && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_") === true;

  return (
    <>
      <SiteHeader />
      <main className="bg-white">
        <section className="container-page py-7">
          <nav className="flex items-center gap-2 text-sm text-slate-500"><Link href="/">Home</Link><ChevronRight className="h-4 w-4" /><Link href="/search">Premium stays</Link><ChevronRight className="h-4 w-4" /><span className="text-slate-800">{hotel.name}</span></nav>
          <div className="mt-6 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <div className="flex items-center gap-3"><span className="badge">{hotel.stars}-star verified</span><span className="flex text-amber-500">{Array.from({ length: hotel.stars }).map((_, i) => <Star key={i} className="h-4 w-4 fill-current" />)}</span></div>
              <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">{hotel.name}</h1>
              <p className="mt-2 flex items-center gap-2 font-semibold text-slate-600"><MapPin className="h-4 w-4 text-violet-600" /> {hotel.city}, {hotel.country}</p>
            </div>
            <button className="result-control"><Heart /> Save property</button>
          </div>

          <div className="property-gallery mt-7">
            <div className="relative min-h-[430px] overflow-hidden rounded-l-[28px]"><Image src={hotel.image} alt={hotel.name} fill priority className="object-cover" /></div>
            <div className="grid gap-2">
              <div className="relative overflow-hidden rounded-tr-[28px]"><Image src={hotel.image} alt={`${hotel.name} property view`} fill className="object-cover" /></div>
              <div className="relative overflow-hidden rounded-br-[28px]"><Image src={hotel.image} alt={`${hotel.name} guest experience`} fill className="object-cover" /></div>
            </div>
          </div>

          <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_350px]">
            <div>
              <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 pb-8">
                <span className="rating-box">{hotel.rating}</span><div><strong className="block text-lg">Exceptional</strong><span className="text-sm text-slate-500">{hotel.reviews} verified guest reviews</span></div>
                <div className="ml-auto hidden text-right sm:block"><strong className="block">Premium quality verified</strong><span className="text-sm text-slate-500">{source === "database" ? "Approved marketplace property" : "Private demo property"}</span></div>
              </div>
              <section className="py-9"><h2 className="text-2xl font-black">About this stay</h2><p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">{hotel.description}</p><div className="mt-6 grid gap-3 sm:grid-cols-2">{hotel.amenities.map((amenity) => <span key={amenity} className="amenity-row"><Check /> {amenity}</span>)}</div></section>
              <div className="ai-property-note"><Bot /><div><strong>Why iRatePilot recommends it</strong><p>Excellent guest satisfaction, premium amenities, and strong overall value for this destination.</p></div></div>
            </div>
            <aside className="booking-summary">
              <div className="flex items-end justify-between"><div><span className="text-sm text-slate-500">From</span><p><strong>${hotel.price}</strong> / night</p></div><span className="rounded-lg bg-violet-700 px-2.5 py-1.5 text-sm font-black text-white">{hotel.rating}</span></div>
              <div className="booking-dates"><span>Check in<small>Add date</small></span><span>Check out<small>Add date</small></span><span className="col-span-2">Travelers<small>2 guests · 1 room</small></span></div>
              <a href="#rooms" className="btn-primary w-full">Choose a room</a>
              <p className="mt-3 text-center text-xs text-slate-500">You will not be charged yet</p>
              <div className="mt-5 border-t border-slate-200 pt-5 text-sm"><p className="flex justify-between"><span>Traveler service fee</span><strong>5%</strong></p><p className="mt-2 flex items-center gap-2 font-bold text-violet-700"><Sparkles className="h-4 w-4" /> Basic & Business members pay 0%</p></div>
            </aside>
          </div>

          <section id="rooms" className="border-t border-slate-200 py-12">
            <span className="section-kicker">Flexible options</span><h2 className="mt-3 text-3xl font-black tracking-tight">Choose your room</h2><p className="mt-2 text-slate-600">Select rates and cancellation terms before checkout.</p>
            <div className="mt-7 grid gap-4"><RoomCard name="Deluxe King" price={hotel.price} perks={["King bed", "Free Wi-Fi", "Pay later option"]}/><RoomCard name="Premium Suite" price={hotel.price + 140} perks={["Separate living area", "Breakfast included", "Priority support"]}/></div>
            <div className="mt-8"><BookingRequestForm hotelSlug={hotel.slug} rooms={rooms} testCheckoutEnabled={testCheckoutEnabled} initialSelection={initialSelection} /></div>
          </section>
          <div className="trust-booking"><ShieldCheck /><div><strong>Book with clear policies</strong><p>Review the full room, cancellation, tax, and fee details before confirming. {testCheckoutEnabled ? "Payments remain in test mode during development." : "Private booking requests are reviewed by the property before payment."}</p></div></div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
