import { Clock3, RefreshCcw } from "lucide-react";
import { ConsumerFlightAcceptOfferButton } from "@/components/flights/consumer-preview/accept-offer-button";
import { ConsumerFlightFareTerms, ConsumerFlightItinerary } from "@/components/flights/consumer-preview/itinerary";
import { ConsumerFlightPreviewSearchProgress } from "@/components/flights/consumer-preview/search-progress";
import {
  formatConsumerFlightDate,
  formatConsumerFlightDateTime,
  formatConsumerFlightMoney,
  formatConsumerFlightStatus,
  type ConsumerFlightOfferDto,
  type ConsumerFlightSearchDto,
} from "@/components/flights/consumer-preview/types";

function OfferCard({ enabled, offer, searchId }: { enabled: boolean; offer: ConsumerFlightOfferDto; searchId: string }) {
  return (
    <article className="border border-neutral-300 bg-white" aria-labelledby={`offer-${offer.id}-title`}>
      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_260px] lg:p-8">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[.14em] text-neutral-500">Duffel test offer</span>
              <h2 id={`offer-${offer.id}-title`} className="mt-2 text-2xl">{offer.validatingCarrier || "Test carrier"}</h2>
            </div>
            <p className="flex items-center gap-2 text-sm text-neutral-600">
              <Clock3 aria-hidden="true" className="h-4 w-4" />
              Expires <time dateTime={offer.expiresAt}>{formatConsumerFlightDateTime(offer.expiresAt)}</time>
            </p>
          </div>
          <div className="mt-6">
            <ConsumerFlightItinerary segments={offer.segments} />
          </div>
          <div className="mt-6 border-t border-neutral-200 pt-5">
            <h3 className="text-sm font-semibold uppercase tracking-[.12em]">Persisted fare terms</h3>
            <div className="mt-4"><ConsumerFlightFareTerms terms={offer.fareTerms} /></div>
          </div>
        </div>
        <aside className="flex h-fit flex-col border border-black bg-[#071b2b] p-6 text-white">
          <span className="text-xs uppercase tracking-[.14em] text-slate-400">Test total · all travelers</span>
          <strong className="mt-2 text-3xl">{formatConsumerFlightMoney(offer.totalCents, offer.currency)}</strong>
          <p className="mt-3 text-xs leading-5 text-slate-300">Revalidated server-side before a durable test order is prepared.</p>
          <ConsumerFlightAcceptOfferButton enabled={enabled} offerId={offer.id} searchId={searchId} />
        </aside>
      </div>
    </article>
  );
}

export function ConsumerFlightPreviewResults({ enabled, search }: { enabled: boolean; search: ConsumerFlightSearchDto }) {
  const searchComplete = search.status === "complete";
  const actionsEnabled = enabled && searchComplete;

  return (
    <section className="container-page py-10" aria-labelledby="preview-results-title">
      <div className="grid gap-6 border border-neutral-300 bg-white p-6 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <span className="section-kicker">Persisted test search</span>
          <h2 id="preview-results-title" className="mt-3 text-3xl">{search.origin} to {search.destination}</h2>
          <p className="mt-3 text-sm text-neutral-600">
            {formatConsumerFlightDate(search.departureDate)}
            {search.returnDate ? ` – ${formatConsumerFlightDate(search.returnDate)}` : " · One way"}
            {` · ${search.travelerCount} fictional adult${search.travelerCount === 1 ? "" : "s"} · ${formatConsumerFlightStatus(search.cabin)}`}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-6 text-sm md:text-right">
          <div><dt className="text-xs uppercase tracking-[.12em] text-neutral-500">Search status</dt><dd className="mt-1 font-semibold">{formatConsumerFlightStatus(search.status)}</dd></div>
          <div><dt className="text-xs uppercase tracking-[.12em] text-neutral-500">Evidence expires</dt><dd className="mt-1 font-semibold"><time dateTime={search.expiresAt}>{formatConsumerFlightDateTime(search.expiresAt)}</time></dd></div>
        </dl>
      </div>

      {!searchComplete ? (
        <div className="mt-6 flex items-start gap-3 border border-neutral-300 bg-neutral-100 p-5" role="status">
          <RefreshCcw aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm leading-6">This durable search is {formatConsumerFlightStatus(search.status).toLowerCase()}. Offer acceptance remains disabled.</p>
            <ConsumerFlightPreviewSearchProgress
              enabled={enabled}
              searchId={search.id}
              initialStatus={search.status}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-7 grid gap-6">
        {search.offers.length ? search.offers.map((offer) => (
          <OfferCard key={offer.id} enabled={actionsEnabled} offer={offer} searchId={search.id} />
        )) : (
          <div className="border border-neutral-300 bg-white p-8 text-center">
            <h2 className="text-2xl">No durable test offers remain.</h2>
            <p className="mt-3 text-sm text-neutral-600">Run a new Preview search. Expired offers cannot be reconstructed from the URL or browser state.</p>
          </div>
        )}
      </div>
    </section>
  );
}
