import Link from "next/link";
import { ArrowRight, Plane, TicketCheck } from "lucide-react";
import {
  formatConsumerFlightDate,
  formatConsumerFlightDateTime,
  formatConsumerFlightMoney,
  formatConsumerFlightStatus,
  type ConsumerFlightOrderSummaryDto,
} from "@/components/flights/consumer-preview/types";

function orderHref(order: ConsumerFlightOrderSummaryDto) {
  return order.status === "pending_payment"
    ? `/flights/preview/checkout/${encodeURIComponent(order.id)}`
    : `/flights/preview/confirmation/${encodeURIComponent(order.id)}`;
}

export function ConsumerFlightPreviewTrips({ enabled, orders }: { enabled: boolean; orders: readonly ConsumerFlightOrderSummaryDto[] }) {
  if (!enabled) return null;

  if (!orders.length) {
    return (
      <section className="border border-neutral-300 bg-white p-8 text-center sm:p-12" aria-labelledby="no-preview-flights-title">
        <Plane aria-hidden="true" className="mx-auto h-9 w-9" />
        <h2 id="no-preview-flights-title" className="mt-5 text-3xl">No durable Preview flights yet.</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-neutral-600">A test search alone does not create a trip. Accepted offers appear here only after an owner-bound order record exists.</p>
        <Link href="/flights/preview" className="btn-primary mt-7">Start a test journey</Link>
      </section>
    );
  }

  return (
    <section aria-labelledby="preview-flight-list-title">
      <h2 id="preview-flight-list-title" className="sr-only">Durable Preview flight orders</h2>
      <div className="grid gap-5">
        {orders.map((order) => (
          <article key={order.id} className="grid gap-6 border border-neutral-300 bg-white p-6 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-[.14em] text-neutral-500">{order.confirmationCode}</span>
                <span className="border border-neutral-300 px-2 py-1 text-xs font-semibold">{formatConsumerFlightStatus(order.status)}</span>
              </div>
              <h3 className="mt-4 text-3xl">{order.search.origin} to {order.search.destination}</h3>
              <p className="mt-2 text-sm text-neutral-600">Depart {formatConsumerFlightDate(order.search.departureDate)}{order.search.returnDate ? ` · Return ${formatConsumerFlightDate(order.search.returnDate)}` : " · One way"} · {formatConsumerFlightStatus(order.search.cabin)}</p>
              <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 text-sm">
                <div><dt className="text-xs uppercase tracking-[.12em] text-neutral-500">Stripe test payment</dt><dd className="mt-1 font-semibold">{order.paymentStatus ? formatConsumerFlightStatus(order.paymentStatus) : "Not recorded"}</dd></div>
                <div><dt className="text-xs uppercase tracking-[.12em] text-neutral-500">Issued ticket records</dt><dd className="mt-1 flex items-center gap-2 font-semibold"><TicketCheck aria-hidden="true" className="h-4 w-4" />{order.ticketCount}</dd></div>
                <div><dt className="text-xs uppercase tracking-[.12em] text-neutral-500">Test support requests</dt><dd className="mt-1 font-semibold">{order.serviceRequestsAvailable ? <>{order.serviceRequestCount}{order.latestServiceRequestStatus ? ` · ${formatConsumerFlightStatus(order.latestServiceRequestStatus)}` : ""}</> : "Ledger unavailable"}</dd></div>
                <div><dt className="text-xs uppercase tracking-[.12em] text-neutral-500">Last updated</dt><dd className="mt-1 font-semibold"><time dateTime={order.updatedAt}>{formatConsumerFlightDateTime(order.updatedAt)}</time></dd></div>
              </dl>
            </div>
            <div className="md:text-right">
              <strong className="block text-2xl">{formatConsumerFlightMoney(order.totalCents, order.currency)}</strong>
              <span className="mt-1 block text-xs text-neutral-500">Test total</span>
              <Link href={orderHref(order)} className="btn-primary mt-5 gap-2">{order.status === "pending_payment" ? "Continue test checkout" : "Read durable receipt"}<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
