import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../lib/email/outbox", () => ({
  wakeTransactionalEmailWorker: vi.fn(async () => true),
}));

import {
  FlightConsumerPreviewNotificationDeliveryError,
  createInjectedFlightConsumerPreviewNotificationDelivery,
  type FlightConsumerPreviewDeliverableNotificationEvent,
  type FlightConsumerPreviewNotificationQueueParameters,
  type FlightConsumerPreviewNotificationStore,
} from "../lib/email/flight-notification-delivery.server";

const customerId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const eventReceiptId = "33333333-3333-4333-8333-333333333333";
const paymentId = "44444444-4444-4444-8444-444444444444";
const outboxId = "55555555-5555-4555-8555-555555555555";
const lifecycleDigest = "a".repeat(64);
const trustedDigest = "b".repeat(64);
const providerReceiptDigest = "c".repeat(64);
const bookingReceiptDigest = "d".repeat(64);
const ticketReceiptDigest = "e".repeat(64);
const paymentReceiptDigest = "f".repeat(64);
const reconciliationReceiptDigest = "1".repeat(64);

function projection(event: FlightConsumerPreviewDeliverableNotificationEvent) {
  return {
    customer_id: customerId,
    order_id: orderId,
    event_type: event,
    event_receipt_id: eventReceiptId,
    execution_scope_sha256: "2".repeat(64),
    lifecycle_evidence_sha256: lifecycleDigest,
    origin_iata: "ORD",
    destination_iata: "MIA",
    booking_reference: event === "ticketed" ? "FLT-TESTBOOKING1" : null,
    provider_order_receipt_sha256: event === "ticketed" ? providerReceiptDigest : null,
    booking_reference_receipt_sha256: event === "ticketed" ? bookingReceiptDigest : null,
    electronic_ticket_document_receipt_sha256s:
      event === "ticketed" ? [ticketReceiptDigest] : null,
    payment_id: event === "refund_completed" ? paymentId : null,
    currency: event === "refund_completed" ? "USD" : null,
    refunded_amount_minor: event === "refund_completed" ? 94_42 : null,
    payment_receipt_sha256: event === "refund_completed" ? paymentReceiptDigest : null,
    reconciliation_receipt_sha256:
      event === "refund_completed" ? reconciliationReceiptDigest : null,
    trusted_evidence_receipt_sha256: trustedDigest,
  };
}

class MemoryStore implements FlightConsumerPreviewNotificationStore {
  projections: unknown[];
  queueCalls: FlightConsumerPreviewNotificationQueueParameters[] = [];
  queueDecision: "queued" | "replay" = "queued";

  constructor(value: unknown) {
    this.projections = [structuredClone(value), structuredClone(value)];
  }

  async project() {
    return [this.projections.shift()];
  }

  async queue(parameters: FlightConsumerPreviewNotificationQueueParameters) {
    this.queueCalls.push(structuredClone(parameters));
    return [{ decision: this.queueDecision, email_outbox_id: outboxId }];
  }
}

function subject(
  event: FlightConsumerPreviewDeliverableNotificationEvent,
  store = new MemoryStore(projection(event)),
  wakeWorker = vi.fn(async () => true),
) {
  return {
    delivery: createInjectedFlightConsumerPreviewNotificationDelivery({
      store,
      appUrl: "https://preview.iratepilot.com/base-path",
      wakeWorker,
    }),
    store,
    wakeWorker,
  };
}

describe("Flight Consumer Preview notification delivery", () => {
  it("re-verifies exact ticket evidence and queues only approved, reference-free template fields", async () => {
    const { delivery, store, wakeWorker } = subject("ticketed");
    await expect(delivery.deliver({ customerId, orderId, event: "ticketed" }))
      .resolves.toEqual({
        decision: "queued",
        emailOutboxId: outboxId,
        orderId,
        event: "ticketed",
      });
    expect(store.queueCalls).toHaveLength(1);
    expect(store.queueCalls[0]).toEqual({
      p_customer_id: customerId,
      p_order_id: orderId,
      p_event_type: "ticketed",
      p_event_receipt_id: eventReceiptId,
      p_lifecycle_evidence_sha256: lifecycleDigest,
      p_trusted_evidence_receipt_sha256: trustedDigest,
      p_template_name: "flight_ticketed",
      p_dedupe_key: `flight:${orderId}:ticketed:${eventReceiptId}`,
      p_subject: "Your flight is booked and ticketed",
      p_message: "Your ORD to MIA order has a provider booking reference and electronic-ticket documentation. Review the operating carrier, itinerary, fare conditions, and support details.",
      p_action_url: "https://preview.iratepilot.com/account/flights",
    });
    expect(JSON.stringify(store.queueCalls[0])).not.toContain("FLT-TESTBOOKING1");
    expect(JSON.stringify(store.queueCalls[0])).not.toContain(providerReceiptDigest);
    expect(JSON.stringify(store.queueCalls[0])).not.toContain(ticketReceiptDigest);
    expect(wakeWorker).toHaveBeenCalledOnce();
  });

  it("requires a second durable projection to match every lifecycle field before queueing", async () => {
    const first = projection("ticketed");
    const changed = { ...projection("ticketed"), destination_iata: "LAX" };
    const store = new MemoryStore(first);
    store.projections = [first, changed];
    const { delivery, wakeWorker } = subject("ticketed", store);
    await expect(delivery.deliver({ customerId, orderId, event: "ticketed" }))
      .rejects.toBeInstanceOf(FlightConsumerPreviewNotificationDeliveryError);
    expect(store.queueCalls).toHaveLength(0);
    expect(wakeWorker).not.toHaveBeenCalled();
  });

  it("queues refund copy only from complete payment and reconciliation receipts", async () => {
    const { delivery, store } = subject("refund_completed");
    await expect(delivery.deliver({ customerId, orderId, event: "refund_completed" }))
      .resolves.toMatchObject({ decision: "queued", event: "refund_completed" });
    expect(store.queueCalls[0]).toMatchObject({
      p_event_receipt_id: eventReceiptId,
      p_lifecycle_evidence_sha256: lifecycleDigest,
      p_template_name: "flight_refund_completed",
      p_subject: "Your flight refund is complete",
      p_message: expect.stringMatching(/completed and reconciled/i),
    });

    const incomplete = projection("refund_completed");
    incomplete.reconciliation_receipt_sha256 = null;
    const unsafe = subject("refund_completed", new MemoryStore(incomplete));
    await expect(unsafe.delivery.deliver({ customerId, orderId, event: "refund_completed" }))
      .rejects.toBeInstanceOf(FlightConsumerPreviewNotificationDeliveryError);
    expect(unsafe.store.queueCalls).toHaveLength(0);
  });

  it("treats the durable outbox as authoritative when worker wake-up fails", async () => {
    const store = new MemoryStore(projection("order_pending"));
    store.queueDecision = "replay";
    const wakeWorker = vi.fn(async () => {
      throw new Error("worker unavailable");
    });
    const { delivery } = subject("order_pending", store, wakeWorker);
    await expect(delivery.deliver({ customerId, orderId, event: "order_pending" }))
      .resolves.toMatchObject({ decision: "replay", emailOutboxId: outboxId });
    expect(wakeWorker).toHaveBeenCalledOnce();
  });

  it("rejects cross-owner projections and non-HTTPS action origins before queueing", async () => {
    const crossOwner = projection("order_failed");
    crossOwner.customer_id = "66666666-6666-4666-8666-666666666666";
    const ownerStore = new MemoryStore(crossOwner);
    const ownerSubject = subject("order_failed", ownerStore);
    await expect(ownerSubject.delivery.deliver({ customerId, orderId, event: "order_failed" }))
      .rejects.toBeInstanceOf(FlightConsumerPreviewNotificationDeliveryError);
    expect(ownerStore.queueCalls).toHaveLength(0);

    const urlStore = new MemoryStore(projection("order_failed"));
    const delivery = createInjectedFlightConsumerPreviewNotificationDelivery({
      store: urlStore,
      appUrl: "http://preview.iratepilot.com",
      wakeWorker: async () => true,
    });
    await expect(delivery.deliver({ customerId, orderId, event: "order_failed" }))
      .rejects.toBeInstanceOf(FlightConsumerPreviewNotificationDeliveryError);
    expect(urlStore.queueCalls).toHaveLength(0);
  });
});
