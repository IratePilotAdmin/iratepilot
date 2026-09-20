import { describe, expect, it } from "vitest";
import {
  buildFlightNotification,
  flightNotificationEvents,
  type FlightNotificationEvidenceVerificationInput,
  type FlightNotificationEvidenceVerifier,
} from "../lib/email/flight-notifications";

const digest = "a".repeat(64);
const refundDigest = "b".repeat(64);
const trustedDigest = "c".repeat(64);
const providerOrderDigest = "d".repeat(64);
const bookingReferenceDigest = "e".repeat(64);
const ticketDocumentDigest = "f".repeat(64);
const base = {
  orderId: "ord_preview_1",
  origin: "ORD",
  destination: "MIA",
  eventReceiptId: "event_receipt_1",
  lifecycleEvidenceDigest: digest,
} as const;

const acceptingVerifier: FlightNotificationEvidenceVerifier = {
  async verify() {
    return { verified: true, trustedReceiptDigest: trustedDigest };
  },
};

const ticketingEvidence = {
  providerOrderReceiptDigest: providerOrderDigest,
  bookingReferenceReceiptDigest: bookingReferenceDigest,
  electronicTicketDocumentReceiptDigests: [ticketDocumentDigest],
} as const;

const refundEvidence = {
  paymentId: "payment_test_1",
  currency: "USD",
  refundedAmountMinor: 22800,
  paymentReceiptDigest: digest,
  reconciliationReceiptDigest: refundDigest,
} as const;

describe("flight notification contracts", () => {
  it("defines one deterministic, idempotent payload for every lifecycle event", async () => {
    const payloads = await Promise.all(flightNotificationEvents.map((event) => buildFlightNotification({
      ...base,
      event,
      ...(event === "ticketed" ? { bookingReference: "TEST123", ticketingEvidence } : {}),
      ...(event === "refund_completed" ? { refundEvidence } : {}),
    }, acceptingVerifier)));
    expect(new Set(payloads.map((payload) => payload.templateName)).size).toBe(flightNotificationEvents.length);
    expect(new Set(payloads.map((payload) => payload.dedupeKey)).size).toBe(flightNotificationEvents.length);
    expect(payloads.every((payload) => payload.actionPath === null)).toBe(true);
    expect(payloads.every((payload) => payload.lifecycleEvidenceDigest === digest)).toBe(true);
  });

  it("does not call a pending order confirmed or ticketed", async () => {
    const payload = await buildFlightNotification({ ...base, event: "order_pending" }, acceptingVerifier);
    expect(payload.ticketed).toBe(false);
    expect(payload.message).toMatch(/not confirmed or ticketed/i);
    expect(payload.paymentOutcomeClaimed).toBe(false);
  });

  it("requires provider, booking-reference, and exact electronic-ticket evidence before ticketed copy", async () => {
    await expect(buildFlightNotification({
      ...base,
      event: "ticketed",
      bookingReference: "TEST123",
      ticketingEvidence: { ...ticketingEvidence, electronicTicketDocumentReceiptDigests: [] },
    }, acceptingVerifier)).rejects.toThrow(/exact provider-order/i);
    await expect(buildFlightNotification({ ...base, event: "ticketed", ticketingEvidence }, acceptingVerifier)).rejects.toThrow(/valid booking reference/i);
    await expect(buildFlightNotification({
      ...base,
      event: "ticketed",
      bookingReference: "TEST123",
      ticketingEvidence,
    }, acceptingVerifier)).resolves.toMatchObject({
      ticketed: true,
      bookingReference: "TEST123",
      ticketingEvidence,
      trustedEvidenceReceiptDigest: trustedDigest,
    });
  });

  it("keeps cancellation and traveler-refund claims separate", async () => {
    const cancelled = await buildFlightNotification({ ...base, event: "cancellation_confirmed" }, acceptingVerifier);
    await expect(buildFlightNotification({ ...base, event: "refund_completed" }, acceptingVerifier)).rejects.toThrow(/reconciliation evidence/i);
    const refunded = await buildFlightNotification({ ...base, event: "refund_completed", refundEvidence }, acceptingVerifier);
    expect(cancelled.paymentOutcomeClaimed).toBe(false);
    expect(cancelled.message).toMatch(/does not by itself prove/i);
    expect(refunded).toMatchObject({
      paymentOutcomeClaimed: true,
      refundReconciliationEvidenceDigest: refundDigest,
      refundEvidence,
    });
  });

  it("rejects malformed identifiers and evidence before creating an outbox contract", async () => {
    await expect(buildFlightNotification({ ...base, event: "order_pending", orderId: "../unsafe" }, acceptingVerifier)).rejects.toThrow(/order ID/i);
    await expect(buildFlightNotification({ ...base, event: "order_pending", destination: "ORD" }, acceptingVerifier)).rejects.toThrow(/airport pair/i);
    await expect(buildFlightNotification({ ...base, event: "order_pending", lifecycleEvidenceDigest: "not-a-digest" }, acceptingVerifier)).rejects.toThrow(/evidence digest/i);
    await expect(buildFlightNotification({ ...base, event: "order_pending", refundEvidence }, acceptingVerifier)).rejects.toThrow(/refund reconciliation evidence/i);
  });

  it("uses the exact event receipt in deduplication so repeated lifecycle event types remain distinct", async () => {
    const first = await buildFlightNotification({ ...base, event: "schedule_changed" }, acceptingVerifier);
    const second = await buildFlightNotification({ ...base, event: "schedule_changed", eventReceiptId: "event_receipt_2" }, acceptingVerifier);
    expect(first.dedupeKey).not.toBe(second.dedupeKey);
  });

  it("fails closed when durable evidence does not exactly verify", async () => {
    let observed: FlightNotificationEvidenceVerificationInput | null = null;
    const rejectingVerifier: FlightNotificationEvidenceVerifier = {
      async verify(input) {
        observed = input;
        return { verified: false, trustedReceiptDigest: null };
      },
    };
    await expect(buildFlightNotification({
      ...base,
      event: "refund_completed",
      refundEvidence,
    }, rejectingVerifier)).rejects.toThrow(/could not be verified/i);
    expect(observed).toMatchObject({
      event: "refund_completed",
      orderId: base.orderId,
      lifecycleEvidenceDigest: digest,
      refundEvidence,
    });
  });

  it("uses one immutable evidence snapshot across an asynchronous verification boundary", async () => {
    let resolveVerification: ((value: { verified: true; trustedReceiptDigest: string }) => void) | undefined;
    let observed: FlightNotificationEvidenceVerificationInput | null = null;
    const deferredVerifier: FlightNotificationEvidenceVerifier = {
      verify(input) {
        observed = input;
        return new Promise((resolve) => {
          resolveVerification = resolve;
        });
      },
    };
    const mutableInput: Record<string, unknown> = {
      ...base,
      event: "order_pending",
    };
    const pending = buildFlightNotification(
      mutableInput as unknown as Parameters<typeof buildFlightNotification>[0],
      deferredVerifier,
    );
    mutableInput.event = "refund_completed";
    mutableInput.refundEvidence = { ...refundEvidence };
    resolveVerification?.({ verified: true, trustedReceiptDigest: trustedDigest });
    const notification = await pending;
    expect(observed).toMatchObject({ event: "order_pending", refundEvidence: null });
    expect(Object.isFrozen(observed)).toBe(true);
    expect(notification).toMatchObject({
      templateName: "flight_order_pending",
      refundEvidence: null,
      paymentOutcomeClaimed: false,
    });
    expect(notification.message).toMatch(/not confirmed or ticketed/i);
  });

  it("snapshots nested ticket evidence and rejects accessors or unexpected fields before verification", async () => {
    let resolveVerification: ((value: { verified: true; trustedReceiptDigest: string }) => void) | undefined;
    const documents = [ticketDocumentDigest];
    const nestedTicketingEvidence = {
      providerOrderReceiptDigest: providerOrderDigest,
      bookingReferenceReceiptDigest: bookingReferenceDigest,
      electronicTicketDocumentReceiptDigests: documents,
    };
    const mutableInput = {
      ...base,
      event: "ticketed" as const,
      bookingReference: "TEST123",
      ticketingEvidence: nestedTicketingEvidence,
    };
    const pending = buildFlightNotification(mutableInput, {
      verify() {
        return new Promise((resolve) => {
          resolveVerification = resolve;
        });
      },
    });
    documents[0] = digest;
    nestedTicketingEvidence.providerOrderReceiptDigest = digest;
    mutableInput.bookingReference = "CHANGED1";
    resolveVerification?.({ verified: true, trustedReceiptDigest: trustedDigest });
    await expect(pending).resolves.toMatchObject({
      bookingReference: "TEST123",
      ticketingEvidence: {
        providerOrderReceiptDigest: providerOrderDigest,
        electronicTicketDocumentReceiptDigests: [ticketDocumentDigest],
      },
    });

    let getterCalls = 0;
    const accessorInput = {
      ...base,
      get event() {
        getterCalls += 1;
        return "order_pending" as const;
      },
    };
    await expect(buildFlightNotification(accessorInput, acceptingVerifier)).rejects.toThrow(/data fields only/i);
    expect(getterCalls).toBe(0);
    await expect(buildFlightNotification({
      ...base,
      event: "order_pending",
      unexpected: true,
    } as unknown as Parameters<typeof buildFlightNotification>[0], acceptingVerifier)).rejects.toThrow(/unexpected field/i);
    await expect(buildFlightNotification({
      ...base,
      event: "ticketed",
      bookingReference: "TEST123",
      ticketingEvidence: { ...ticketingEvidence, unexpected: true },
    } as unknown as Parameters<typeof buildFlightNotification>[0], acceptingVerifier)).rejects.toThrow(/unexpected field/i);
    await expect(buildFlightNotification(new Proxy({ ...base, event: "order_pending" as const }, {}), acceptingVerifier))
      .rejects.toThrow(/plain data object/i);
  });
});
