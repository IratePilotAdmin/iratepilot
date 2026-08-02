import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bot, Check, ChevronRight, Heart, MapPin, ShieldCheck, Sparkles, Star } from "lucide-react";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { RoomCard } from "@/components/hotels/room-card";
import { BookingRequestForm } from "@/components/bookings/booking-request-form";
import { getMarketplaceHotel } from "@/lib/data/marketplace";
import { getPresentedRooms, getReviewPresentation } from "@/lib/marketplace-presentation";
import { parseHotelStay } from "@/lib/marketplace-search";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function HotelPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const stay = parseHotelStay(query);
  const { hotel, source, rooms } = await getMarketplaceHotel(slug, stay.criteria);
  if (!hotel) notFound();
  const stringParam = (name: string) => typeof query[name] === "string" ? query[name] : undefined;
  const initialSelection = {
    roomId: stringParam("roomId"),
    checkIn: stringParam("checkIn"),
    checkOut: stringParam("checkOut"),
    guests: stringParam("guests")
  };
  const testCheckoutEnabled = process.env.ENABLE_TEST_CHECKOUT === "true" && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_") === true;
  const presentedRooms = getPresentedRooms(source, rooms, hotel.price);
  const review = getReviewPresentation(hotel.rating, hotel.reviews);

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
                <span className="rating-box">{review.score}</span><div><strong className="block text-lg">{review.label}</strong><span className="text-sm text-slate-500">{review.detail}</span></div>
                <div className="ml-auto hidden text-right sm:block"><strong className="block">Premium quality verified</strong><span className="text-sm text-slate-500">{source === "database" ? "Approved marketplace property" : "Private demo property"}</span></div>
              </div>
              <section className="py-9"><h2 className="text-2xl font-black">About this stay</h2><p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">{hotel.description}</p><div className="mt-6 grid gap-3 sm:grid-cols-2">{hotel.amenities.map((amenity) => <span key={amenity} className="amenity-row"><Check /> {amenity}</span>)}</div></section>
              <div className="ai-property-note"><Bot /><div><strong>Why iRatePilot recommends it</strong><p>{source === "database" ? "This partner listing passed iRatePilot publication review and includes active room inventory." : "This private demonstration property shows how premium partner inventory will appear."}</p></div></div>
            </div>
            <aside className="booking-summary">
              <div className="flex items-end justify-between"><div><span className="text-sm text-slate-500">From</span><p><strong>${hotel.price}</strong> / night</p></div><span className="rounded-lg bg-violet-700 px-2.5 py-1.5 text-sm font-black text-white">{review.score}</span></div>
              <div className="booking-dates"><span>Check in<small>Add date</small></span><span>Check out<small>Add date</small></span><span className="col-span-2">Travelers<small>2 guests · 1 room</small></span></div>
              <a href="#rooms" className="btn-primary w-full">Choose a room</a>
              <p className="mt-3 text-center text-xs text-slate-500">You will not be charged yet</p>
              <div className="mt-5 border-t border-slate-200 pt-5 text-sm"><p className="flex justify-between"><span>Traveler service fee</span><strong>5%</strong></p><p className="mt-2 flex items-center gap-2 font-bold text-violet-700"><Sparkles className="h-4 w-4" /> Basic & Business members pay 0%</p></div>
            </aside>
          </div>

          <section id="rooms" className="border-t border-slate-200 py-12">
            <span className="section-kicker">Room options</span><h2 className="mt-3 text-3xl font-black tracking-tight">Choose your room</h2><p className="mt-2 text-slate-600">{source === "database" ? (stay.criteria ? "Showing rooms available for every selected night, with the average nightly rate for your stay." : "Select dates to verify live room availability and nightly rates.") : "These sample room types demonstrate the listing layout; live availability is not connected."}</p>
            {stay.error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-medium text-red-700">{stay.error} Update the dates and guest count below to request this stay.</p>}
            {source === "database" && stay.criteria && rooms.length === 0 && <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-medium text-amber-800">No rooms fit these dates and guest count. Change your stay details to check other options.</p>}
            <div className="mt-7 grid gap-4">{presentedRooms.map((room) => <RoomCard key={room.id} name={room.name} price={room.price} notes={room.notes} bookable={room.bookable} />)}</div>
            <div className="mt-8"><BookingRequestForm hotelSlug={hotel.slug} rooms={rooms} testCheckoutEnabled={testCheckoutEnabled} initialSelection={initialSelection} emptyMessage={source === "database" && stay.criteria ? "No available room can be requested for this stay. Change the dates or guest count and try again." : undefined} /></div>
          </section>
          <div className="trust-booking"><ShieldCheck /><div><strong>Book with verified availability</strong><p>Room availability, nightly pricing, and the trip total are verified before confirmation. {testCheckoutEnabled ? "Payments remain in test mode during development." : "Private booking requests are reviewed by the property before payment."}</p></div></div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
