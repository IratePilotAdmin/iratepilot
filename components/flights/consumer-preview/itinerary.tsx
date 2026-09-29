import { ArrowRight, BriefcaseBusiness, Clock3, Luggage } from "lucide-react";
import {
  formatConsumerFlightDateTime,
  formatConsumerFlightDuration,
  type ConsumerFlightFareTermsDto,
  type ConsumerFlightSegmentDto,
} from "@/components/flights/consumer-preview/types";

export function ConsumerFlightItinerary({ segments }: { segments: readonly ConsumerFlightSegmentDto[] }) {
  if (!segments.length) {
    return <p className="border border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600">Itinerary details are not yet available.</p>;
  }

  return (
    <ol className="divide-y divide-neutral-200 border-y border-neutral-300">
      {segments.map((segment) => (
        <li key={segment.id} className="grid gap-5 py-5 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[.14em] text-neutral-500">Depart</span>
            <strong className="mt-1 block text-2xl">{segment.origin}</strong>
            <time className="mt-1 block text-sm text-neutral-600" dateTime={segment.departsAt}>
              {formatConsumerFlightDateTime(segment.departsAt)}
            </time>
          </div>
          <div className="flex items-center gap-3 text-sm text-neutral-500 sm:flex-col" aria-label={formatConsumerFlightDuration(segment.durationMinutes)}>
            <Clock3 aria-hidden="true" className="h-4 w-4" />
            <span>{formatConsumerFlightDuration(segment.durationMinutes)}</span>
            <ArrowRight aria-hidden="true" className="h-4 w-4 sm:rotate-90" />
          </div>
          <div className="sm:text-right">
            <span className="text-xs font-semibold uppercase tracking-[.14em] text-neutral-500">Arrive</span>
            <strong className="mt-1 block text-2xl">{segment.destination}</strong>
            <time className="mt-1 block text-sm text-neutral-600" dateTime={segment.arrivesAt}>
              {formatConsumerFlightDateTime(segment.arrivesAt)}
            </time>
          </div>
          <p className="text-sm text-neutral-600 sm:col-span-3">
            {segment.marketingCarrier} {segment.flightNumber}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function ConsumerFlightFareTerms({ terms }: { terms: ConsumerFlightFareTermsDto | null }) {
  if (!terms) return <p className="text-sm text-neutral-600">Fare restrictions have not been persisted for this test offer.</p>;

  return (
    <ul className="grid gap-3 text-sm text-neutral-700 sm:grid-cols-2">
      <li className="flex items-center gap-2"><Luggage aria-hidden="true" className="h-4 w-4" />{terms.checkedBagPieces} checked bag{terms.checkedBagPieces === 1 ? "" : "s"}</li>
      <li className="flex items-center gap-2"><BriefcaseBusiness aria-hidden="true" className="h-4 w-4" />{terms.carryOnPieces} carry-on bag{terms.carryOnPieces === 1 ? "" : "s"}</li>
      <li>{terms.changeable ? "Changes shown as permitted" : "Changes shown as restricted"}</li>
      <li>{terms.refundable ? "Refundability shown as permitted" : "Refundability shown as restricted"}</li>
    </ul>
  );
}
