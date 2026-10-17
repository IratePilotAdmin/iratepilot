"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { flightCabins, formatFlightCabin, type FlightSearchValues, type FlightTripType } from "@/lib/flights/search";

export function FlightPlannerForm({ values, today }: { values: FlightSearchValues; today: string }) {
  const [tripType, setTripType] = useState<FlightTripType>(values.tripType);
  const isMultiCity = tripType === "multicity";
  const isReturnIgnored = tripType === "oneway" || isMultiCity;

  return (
    <form action="/flights/results" method="get" className="border border-black bg-white p-5 sm:p-7">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-600">
          Trip type
          <select name="tripType" value={tripType} onChange={(event) => setTripType(event.target.value as FlightTripType)} className="input mt-2">
            <option value="roundtrip">Round trip</option>
            <option value="oneway">One way</option>
            <option value="multicity">Multi-city</option>
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-600">
          Travelers
          <select name="travelers" defaultValue={values.travelers} className="input mt-2">
            {Array.from({ length: 9 }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-600">
          From
          <input name="origin" defaultValue={values.origin} disabled={isMultiCity} className="input mt-2 uppercase disabled:cursor-not-allowed disabled:bg-neutral-100" placeholder="ORD" maxLength={3} inputMode="text" autoComplete="off" />
        </label>
        <label className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-600">
          To
          <input name="destination" defaultValue={values.destination} disabled={isMultiCity} className="input mt-2 uppercase disabled:cursor-not-allowed disabled:bg-neutral-100" placeholder="MIA" maxLength={3} inputMode="text" autoComplete="off" />
        </label>
        <label className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-600">
          Depart
          <input name="departureDate" defaultValue={values.departureDate} disabled={isMultiCity} className="input mt-2 disabled:cursor-not-allowed disabled:bg-neutral-100" type="date" min={today} />
        </label>
        <label className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-600">
          Return {isReturnIgnored && <span className="normal-case tracking-normal text-neutral-400">(ignored for {isMultiCity ? "multi-city" : "one way"})</span>}
          <input name="returnDate" defaultValue={values.returnDate} disabled={isReturnIgnored} className="input mt-2 disabled:cursor-not-allowed disabled:bg-neutral-100" type="date" min={values.departureDate || today} />
        </label>
        <label className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-600 sm:col-span-2">
          Cabin
          <select name="cabin" defaultValue={values.cabin} className="input mt-2">
            {flightCabins.map((cabin) => <option key={cabin} value={cabin}>{formatFlightCabin(cabin)}</option>)}
          </select>
        </label>
      </div>
      <fieldset disabled={!isMultiCity} className="mt-6 border border-neutral-300 bg-neutral-50 p-4 disabled:opacity-70">
        <legend className="cursor-pointer px-1 text-sm font-semibold text-neutral-800">Multi-city legs (use when Trip type is Multi-city)</legend>
        <p className="mt-3 text-xs leading-5 text-neutral-500">Add 2–4 connected legs. Each leg must depart from the previous leg’s arrival airport, and dates cannot move backwards.</p>
        <div className="mt-4 grid gap-4">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="grid gap-4 border-t border-neutral-200 pt-4 sm:grid-cols-[1fr_1fr_1fr]">
              <div className="sm:col-span-3 text-xs font-semibold uppercase tracking-[.12em] text-neutral-600">Leg {index + 1}{index < 2 ? " · required for multi-city" : " · optional"}</div>
              <label className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-600">
                From
                <input name="segmentOrigin" defaultValue={values.segments[index]?.origin ?? ""} className="input mt-2 uppercase" placeholder="ORD" maxLength={3} inputMode="text" autoComplete="off" />
              </label>
              <label className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-600">
                To
                <input name="segmentDestination" defaultValue={values.segments[index]?.destination ?? ""} className="input mt-2 uppercase" placeholder="MIA" maxLength={3} inputMode="text" autoComplete="off" />
              </label>
              <label className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-600">
                Depart
                <input name="segmentDepartureDate" defaultValue={values.segments[index]?.departureDate ?? ""} className="input mt-2" type="date" min={today} />
              </label>
            </div>
          ))}
        </div>
      </fieldset>
      <button type="submit" className="btn-primary mt-6 w-full gap-2">Preview synthetic options <ArrowRight className="h-4 w-4" /></button>
      <p className="mt-3 text-xs leading-5 text-neutral-500">This validates planning details and displays deterministic product fixtures only. It does not reserve a seat, quote a live fare, contact an airline, or create a charge.</p>
    </form>
  );
}
