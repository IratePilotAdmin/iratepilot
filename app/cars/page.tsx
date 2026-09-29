import type { Metadata } from "next";
import { ArrowRight, BadgeDollarSign, CalendarClock, Car, KeyRound, MapPin, ShieldCheck, UserRoundCheck } from "lucide-react";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import {
  carDriverAgeBands,
  carVehicleClasses,
  formatCarDriverAge,
  formatCarRentalDateTime,
  formatCarVehicleClass,
  parseCarRentalSearch,
} from "@/lib/cars/search";

export const metadata: Metadata = {
  title: "Car rental planning preview",
  description: "Prepare a car-rental request while live vehicles, rates, protection products, reservations, and payments remain disabled.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CarsPage({ searchParams }: { searchParams: SearchParams }) {
  const search = parseCarRentalSearch(await searchParams);
  const { values } = search;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b border-neutral-200 bg-[#f4f1eb]">
          <div className="container-page grid gap-12 py-14 lg:grid-cols-[.9fr_1.1fr] lg:items-end lg:py-20">
            <div>
              <span className="section-kicker">Car rentals · Phase 1</span>
              <h1 className="mt-4 text-5xl text-neutral-950 sm:text-6xl">Plan the drive. Keep every vehicle and price claim honest.</h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-600">
                Prepare a rental request by location, date, time, driver age range, and vehicle class. Rental-company inventory is not connected yet, so iRatePilot does not display live vehicles, rates, taxes, fees, protection products, availability, or reservations in this phase.
              </p>
              <div className="mt-7 inline-flex items-center gap-3 border border-neutral-400 bg-white px-4 py-3 text-sm">
                <ShieldCheck className="h-5 w-5" />
                <span><strong className="block">Supplier-offline planning preview</strong><small className="text-neutral-500">No rental-company API request or payment is made</small></span>
              </div>
            </div>

            <form action="/cars" method="get" className="border border-black bg-white p-5 sm:p-7">
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-600 sm:col-span-2">
                  Pickup city, airport, or location
                  <input name="pickupLocation" defaultValue={values.pickupLocation} className="input mt-2" placeholder="Miami International Airport" maxLength={80} autoComplete="off" required />
                </label>
                <label className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-600">
                  Return location
                  <select name="returnType" defaultValue={values.returnType} className="input mt-2">
                    <option value="same">Same as pickup</option>
                    <option value="different">Different location</option>
                  </select>
                </label>
                <label className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-600">
                  Different return location
                  <input name="dropoffLocation" defaultValue={values.dropoffLocation} className="input mt-2" placeholder="Required only if different" maxLength={80} autoComplete="off" />
                </label>
                <label className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-600">
                  Pickup date
                  <input name="pickupDate" defaultValue={values.pickupDate} className="input mt-2" type="date" min={today} required />
                </label>
                <label className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-600">
                  Pickup time
                  <input name="pickupTime" defaultValue={values.pickupTime} className="input mt-2" type="time" required />
                </label>
                <label className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-600">
                  Return date
                  <input name="dropoffDate" defaultValue={values.dropoffDate} className="input mt-2" type="date" min={values.pickupDate || today} required />
                </label>
                <label className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-600">
                  Return time
                  <input name="dropoffTime" defaultValue={values.dropoffTime} className="input mt-2" type="time" required />
                </label>
                <label className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-600">
                  Primary driver age
                  <select name="driverAge" defaultValue={values.driverAge} className="input mt-2">
                    {carDriverAgeBands.map((age) => <option key={age} value={age}>{formatCarDriverAge(age)}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-600">
                  Vehicle class
                  <select name="vehicleClass" defaultValue={values.vehicleClass} className="input mt-2">
                    {carVehicleClasses.map((vehicleClass) => <option key={vehicleClass} value={vehicleClass}>{formatCarVehicleClass(vehicleClass)}</option>)}
                  </select>
                </label>
              </div>
              <button type="submit" className="btn-primary mt-6 w-full gap-2">Prepare rental request <ArrowRight className="h-4 w-4" /></button>
              <p className="mt-3 text-xs leading-5 text-neutral-500">This validates planning details only. It does not search a rental company, guarantee driver eligibility, reserve a vehicle, select protection, or create a charge.</p>
            </form>
          </div>
        </section>

        <section aria-live="polite" className="container-page py-12">
          {search.errors.length > 0 && (
            <div role="alert" className="border border-red-300 bg-red-50 p-6">
              <h2 className="text-2xl">Check the rental request</h2>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-red-900">
                {search.errors.map((error) => <li key={error}>{error}</li>)}
              </ul>
            </div>
          )}

          {search.query && (
            <div className="grid gap-7 border border-black p-7 lg:grid-cols-[1.2fr_.8fr] lg:p-9">
              <div>
                <span className="section-kicker">Validated planning request</span>
                <h2 className="mt-3 text-4xl">{search.query.pickupLocation} <span aria-hidden="true">→</span> {search.query.dropoffLocation}</h2>
                <div className="mt-7 grid gap-px border border-neutral-300 bg-neutral-300 sm:grid-cols-2">
                  <div className="bg-white p-5"><CalendarClock className="h-5 w-5" /><strong className="mt-4 block">{formatCarRentalDateTime(search.query.pickupDate, search.query.pickupTime)}</strong><span className="mt-1 block text-sm text-neutral-500">Return {formatCarRentalDateTime(search.query.dropoffDate, search.query.dropoffTime)}</span></div>
                  <div className="bg-white p-5"><Car className="h-5 w-5" /><strong className="mt-4 block">{formatCarVehicleClass(search.query.vehicleClass)}</strong><span className="mt-1 block text-sm text-neutral-500">{formatCarDriverAge(search.query.driverAge)} · {Math.ceil(search.query.durationHours / 24)} rental {Math.ceil(search.query.durationHours / 24) === 1 ? "day" : "days"}</span></div>
                </div>
              </div>
              <aside className="bg-neutral-950 p-6 text-white">
                <KeyRound className="h-6 w-6" />
                <h3 className="mt-5 text-xl font-semibold">Live vehicles and rates are unavailable</h3>
                <p className="mt-3 text-sm leading-6 text-neutral-300">The request is valid, but no approved rental company, broker, aggregator, or connectivity provider is connected. Nothing was searched externally, priced, held, or reserved.</p>
              </aside>
            </div>
          )}
        </section>

        <section className="bg-neutral-950 py-16 text-white">
          <div className="container-page">
            <div className="max-w-3xl"><span className="section-kicker text-neutral-400">Activation boundary</span><h2 className="mt-4 text-4xl text-white">What must happen before live car-rental shopping.</h2><p className="mt-5 leading-7 text-neutral-300">Later phases must name an authorized inventory source, normalize total prices and policies, complete sandbox certification, define servicing ownership, and separately approve Production traffic.</p></div>
            <div className="mt-10 grid gap-px bg-white/20 md:grid-cols-3">
              <article className="bg-neutral-950 p-6"><MapPin className="h-6 w-6" /><strong className="mt-6 block">Approved inventory source</strong><p className="mt-3 text-sm leading-6 text-neutral-400">Rental-company, broker, or aggregator contracts, locations, fleets, and endpoint scope.</p></article>
              <article className="bg-neutral-950 p-6"><UserRoundCheck className="h-6 w-6" /><strong className="mt-6 block">Eligibility and protection</strong><p className="mt-3 text-sm leading-6 text-neutral-400">Driver age, license, deposit, geographic, insurance, protection, fuel, mileage, and additional-driver rules.</p></article>
              <article className="bg-neutral-950 p-6"><BadgeDollarSign className="h-6 w-6" /><strong className="mt-6 block">Booking and payment authorization</strong><p className="mt-3 text-sm leading-6 text-neutral-400">Total-price accuracy, taxes, fees, deposits, modifications, cancellations, refunds, disputes, legal, and Production approvals.</p></article>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
