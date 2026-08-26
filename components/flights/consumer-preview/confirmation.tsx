import Link from "next/link";
import { AlertOctagon, CircleCheck, Clock3, RotateCcw, ShieldCheck, TicketCheck } from "lucide-react";
import { ConsumerFlightItinerary } from "@/components/flights/consumer-preview/itinerary";
import { ConsumerFlightOrderProgress } from "@/components/flights/consumer-preview/order-progress";
import { ConsumerFlightPreviewServiceRequests } from "@/components/flights/consumer-preview/service-requests";
import {
  formatConsumerFlightDate,
  formatConsumerFlightDateTime,
  formatConsumerFlightMoney,
  formatConsumerFlightStatus,
  type ConsumerFlightOrderDto,
} from "@/components/flights/consumer-preview/types";

type ReceiptState = {
  tone: "complete" | "pending" | "attention" | "closed";
  title: string;
  detail: string;
};

function receiptState(order: ConsumerFlightOrderDto): ReceiptState {
  const issuedTickets = order.tickets.filter((ticket) => ticket.status === "issued").length;
  const paymentStatus = order.payment?.status ?? null;

  if (
    order.status === "ticketed"
    && issuedTickets === order.search.travelerCount
    && paymentStatus === "captured"
  ) {
    return {
      tone: "complete",
      title: "Test booking evidence is complete.",
      detail: "The database records a captured Stripe test payment, a Duffel test order, and issued test-ticket evidence.",
    };
  }
  if (order.status === "requires_review" || paymentStatus === "ambiguous") {
    return {
      tone: "attention",
      title: "This test order needs review.",
      detail: "An ambiguous or mismatched boundary stopped automatic finalization. No result should be inferred until durable reconciliation is complete.",
    };
  }
  if (order.status === "refunded" || paymentStatus === "refunded") {
    return {
      tone: "closed",
      title: "The Stripe test payment was refunded.",
      detail: "The durable record shows the test-payment refund path completed. This is not an active test booking.",
    };
  }
  if (order.status === "cancelled" || paymentStatus === "cancelled") {
    return {
      tone: "closed",
      title: "This test order is cancelled.",
      detail: "The durable record shows a cancelled test order or voided test authorization.",
    };
  }
  if (order.status === "failed" || paymentStatus === "failed") {
    return {
      tone: "attention",
      title: "Test booking did not complete.",
      detail: "The durable record reports failure. Do not retry from browser history; start a new test journey or use support tooling.",
    };
  }
  if (paymentStatus === "requires_action") {
    return {
      tone: "attention",
      title: "Stripe test payment needs another action.",
      detail: "Return to test checkout to complete the Stripe-hosted authentication step. No Duffel test order is claimed yet.",
    };
  }
  if (paymentStatus === "requires_payment_method" || (order.status === "pending_payment" && !paymentStatus)) {
    return {
      tone: "attention",
      title: "Stripe test payment is not authorized.",
      detail: "This durable order is waiting for a valid Stripe test payment method. No Duffel test order is claimed yet.",
    };
  }
  if (paymentStatus === "refund_pending" || order.status === "refund_pending") {
    return {
      tone: "pending",
      title: "The Stripe test refund is processing.",
      detail: "The durable record is waiting for refund reconciliation. This receipt will update only after the database records the outcome.",
    };
  }
  if (order.status === "booked" || order.status === "ticketing_pending") {
    return {
      tone: "pending",
      title: "Duffel test order recorded; ticket evidence is pending.",
      detail: "The provider test order exists, but this receipt will not claim completion until durable test-ticket evidence is issued.",
    };
  }
  if (paymentStatus === "processing") {
    return {
      tone: "pending",
      title: "Stripe test payment is processing.",
      detail: "Payment has not reached a terminal verified state. Duffel submission and booking claims remain gated.",
    };
  }
  if (order.status === "payment_authorized") {
    return {
      tone: "pending",
      title: "Stripe test payment is authorized.",
      detail: "The durable authorization is recorded. Capture and one-shot Duffel test-order orchestration are still pending.",
    };
  }
  if (order.status === "order_creating") {
    return {
      tone: "pending",
      title: "Duffel test-order creation is processing.",
      detail: "The provider dispatch journal is authoritative. The browser will not retry an ambiguous submission or claim a booking early.",
    };
  }
  return {
    tone: "pending",
    title: "Test-order finalization is still processing.",
    detail: `The durable order is ${formatConsumerFlightStatus(order.status).toLowerCase()}${paymentStatus ? ` and its Stripe test payment is ${formatConsumerFlightStatus(paymentStatus).toLowerCase()}` : ""}.`,
  };
}

function ReceiptIcon({ tone }: { tone: ReceiptState["tone"] }) {
  if (tone === "complete") return <CircleCheck aria-hidden="true" className="h-11 w-11 text-emerald-700" />;
  if (tone === "attention") return <AlertOctagon aria-hidden="true" className="h-11 w-11 text-red-700" />;
  if (tone === "closed") return <RotateCcw aria-hidden="true" className="h-11 w-11 text-neutral-700" />;
  return <Clock3 aria-hidden="true" className="h-11 w-11 text-amber-700" />;
}

export function ConsumerFlightPreviewConfirmation({ enabled, order }: { enabled: boolean; order: ConsumerFlightOrderDto }) {
  const state = receiptState(order);
  const issuedTickets = order.tickets.filter((ticket) => ticket.status === "issued");
  const shouldPoll = enabled && state.tone === "pending";
  const canReturnToCheckout = order.status === "pending_payment" || order.payment?.status === "requires_action" || order.payment?.status === "requires_payment_method";

  return (
    <section className="container-page py-10 sm:py-14" aria-labelledby="test-receipt-title">
      <div className="mx-auto max-w-5xl border border-black bg-white">
        <div className="grid gap-8 p-7 sm:p-10 lg:grid-cols-[1fr_280px]">
          <div>
            <ReceiptIcon tone={state.tone} />
            <span className="section-kicker mt-6 block">Database-backed test receipt</span>
            <h2 id="test-receipt-title" className="mt-3 text-4xl">{state.title}</h2>
            <p className="mt-4 max-w-2xl leading-7 text-neutral-600">{state.detail}</p>
            {canReturnToCheckout ? <Link href={`/flights/preview/checkout/${encodeURIComponent(order.id)}`} className="btn-secondary mt-6">Return to test checkout</Link> : null}
            <ConsumerFlightOrderProgress enabled={enabled} orderId={order.id} initialVersion={order.updatedAt} shouldPoll={shouldPoll} />
          </div>
          <dl className="grid content-start gap-5 border border-neutral-300 bg-neutral-50 p-6 text-sm">
            <div><dt className="text-xs uppercase tracking-[.12em] text-neutral-500">iRatePilot reference</dt><dd className="mt-1 font-semibold">{order.confirmationCode}</dd></div>
            <div><dt className="text-xs uppercase tracking-[.12em] text-neutral-500">Order status</dt><dd className="mt-1 font-semibold">{formatConsumerFlightStatus(order.status)}</dd></div>
            <div><dt className="text-xs uppercase tracking-[.12em] text-neutral-500">Stripe test payment</dt><dd className="mt-1 font-semibold">{order.payment ? formatConsumerFlightStatus(order.payment.status) : "Not recorded"}</dd></div>
            <div><dt className="text-xs uppercase tracking-[.12em] text-neutral-500">Issued test tickets</dt><dd className="mt-1 font-semibold">{issuedTickets.length}</dd></div>
            <div><dt className="text-xs uppercase tracking-[.12em] text-neutral-500">Last durable update</dt><dd className="mt-1 font-semibold"><time dateTime={order.updatedAt}>{formatConsumerFlightDateTime(order.updatedAt)}</time></dd></div>
          </dl>
        </div>

        <div className="border-t border-neutral-300 p-7 sm:p-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div><span className="text-xs font-semibold uppercase tracking-[.14em] text-neutral-500">Test itinerary</span><h3 className="mt-2 text-2xl">{order.search.origin} to {order.search.destination}</h3><p className="mt-2 text-sm text-neutral-600">Depart {formatConsumerFlightDate(order.search.departureDate)} · {order.search.travelerCount} fictional traveler{order.search.travelerCount === 1 ? "" : "s"}</p></div>
            <strong className="text-2xl">{formatConsumerFlightMoney(order.totalCents, order.currency)}</strong>
          </div>
          <div className="mt-6"><ConsumerFlightItinerary segments={order.segments} /></div>
        </div>

        <div className="grid gap-px border-t border-neutral-300 bg-neutral-300 sm:grid-cols-2">
          <section className="bg-white p-7" aria-labelledby="payment-evidence-title">
            <ShieldCheck aria-hidden="true" className="h-6 w-6" />
            <h3 id="payment-evidence-title" className="mt-4 font-semibold">Stripe test evidence</h3>
            <p className="mt-2 text-sm leading-6 text-neutral-600">Authorized {formatConsumerFlightMoney(order.payment?.authorizedCents ?? 0, order.currency)} · Captured {formatConsumerFlightMoney(order.payment?.capturedCents ?? 0, order.currency)} · Refunded {formatConsumerFlightMoney(order.payment?.refundedCents ?? 0, order.currency)}</p>
          </section>
          <section className="bg-white p-7" aria-labelledby="ticket-evidence-title">
            <TicketCheck aria-hidden="true" className="h-6 w-6" />
            <h3 id="ticket-evidence-title" className="mt-4 font-semibold">Duffel test-ticket evidence</h3>
            {order.tickets.length ? <ul className="mt-2 space-y-2 text-sm text-neutral-600">{order.tickets.map((ticket) => <li key={ticket.id}>{formatConsumerFlightStatus(ticket.documentType)} · {ticket.issuingCarrier} · {formatConsumerFlightStatus(ticket.status)}{ticket.issuedAt ? ` · ${formatConsumerFlightDateTime(ticket.issuedAt)}` : ""}</li>)}</ul> : <p className="mt-2 text-sm text-neutral-600">No test-ticket document is recorded yet.</p>}
          </section>
        </div>

        <ConsumerFlightPreviewServiceRequests
          enabled={enabled}
          available={order.serviceRequestsAvailable}
          orderId={order.id}
          orderStatus={order.status}
          requests={order.serviceRequests}
        />

        <div className="border-t border-amber-300 bg-amber-50 p-7 text-sm leading-6 text-amber-950">
          <strong className="block uppercase tracking-[.12em]">Not valid for travel</strong>
          <p className="mt-2">This receipt reflects test systems only. It is not a consumer Production confirmation, airline record locator, live payment receipt, or valid electronic ticket.</p>
        </div>
      </div>
      <div className="mx-auto mt-7 flex max-w-5xl flex-wrap gap-3">
        <Link href="/account/flights" className="btn-primary">My Preview flights</Link>
        <Link href="/flights/preview" className="btn-secondary">Start another test journey</Link>
      </div>
    </section>
  );
}
