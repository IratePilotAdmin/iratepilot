import { describe, expect, it } from "vitest";
import {
  authorizeFlightCommercePayment,
  beginFlightCommerceCancellation,
  beginFlightCommerceCompensatingRefund,
  beginFlightCommercePayment,
  beginFlightCommercePaymentCapture,
  beginFlightCommercePaymentVoid,
  beginFlightCommerceRefund,
  beginFlightCommerceTicketing,
  beginFlightCommerceTicketExchange,
  completeFlightCommerceCancellation,
  completeFlightCommerceOrder,
  completeFlightCommerceProviderOrderAtomically,
  completeFlightCommercePaymentCapture,
  completeFlightCommercePaymentVoid,
  completeFlightCommerceRefund,
  completeFlightCommerceTicketing,
  completeFlightCommerceTicketExchange,
  continueFlightCommerceRefund,
  createFlightCommerceLifecycle,
  createFlightOrderLifecycle,
  digestFlightProviderOrderCompletionCanonicalEvidence,
  getFlightCommerceAggregatePrefix,
  type FlightAuthenticatedProviderOrderCompletionFinalizer,
  type FlightAuthenticatedProviderOrderCompletionOutcome,
  type FlightAuthenticatedProviderOrderCompletionReceipt,
  type FlightAmbiguityOutcome,
  type FlightAmbiguityOperation,
  type FlightAmbiguityReconciliationEvidence,
  type FlightCommerceLifecycle,
  type FlightNoActiveTicketFailureCause,
  type FlightNoActiveTicketReconciliationEvidence,
  type FlightProviderReconciliationFinalizer,
  type FlightReconciliationAggregatePrefix,
  type FlightTransitionEvidence,
  InvalidFlightTransitionError,
  markFlightCommercePaymentAuthorizationAmbiguous,
  partiallyCompleteFlightCommerceRefund,
  reconcileFlightCommerceCancellation,
  reconcileFlightCommerceNoActiveTicket,
  reconcileFlightCommerceOrderCreation,
  reconcileFlightCommercePaymentAuthorization,
  reconcileFlightCommercePaymentCapture,
  reconcileFlightCommercePaymentVoid,
  reconcileFlightCommerceRefund,
  reconcileFlightCommerceTicketExchange,
  reconcileFlightCommerceTicketIssuance,
  rejectFlightCommerceOrder,
  rejectFlightCommercePaymentCapture,
  rejectFlightCommercePayment,
  rejectFlightCommercePaymentVoid,
  rejectFlightCommerceCancellation,
  rejectFlightCommerceRefund,
  rejectFlightCommerceTicketExchange,
  rejectFlightCommerceTicketing,
  submitFlightCommerceOrder,
  transitionFlightOrder,
  validateFlightCommerceSearchRequest,
  validateFlightOfferSnapshot,
} from "../lib/flights/commerce-domain";
import { syntheticFlightOfferFixture, syntheticFlightSearchRequest } from "../lib/flights/provider-adapter";
import { canonicalFlightJson, sha256FlightEvidence } from "../lib/flights/runtime-safety";

function occurredAt(index: number) {
  return new Date(Date.UTC(2027, 1, 1, 0, index, 0)).toISOString();
}

const COMMERCE_ID = "flight_commerce_test_0001";

function evidence(kind: "order" | "payment" | "ticket", index: number, expectedRevision: number) {
  return {
    eventId: `${kind}_event_${String(index).padStart(4, "0")}`,
    occurredAt: occurredAt(index),
    idempotencyDigest: index.toString(16).padStart(64, "0"),
    expectedRevision,
  };
}

const PROVIDER_ID = "provider_test_0001";
const PROVIDER_ORDER_ID = "provider_order_test_0001";

function acceptedVerifier(
  accepted: ReadonlyMap<string, string>,
  onFinalize?: () => void,
): FlightProviderReconciliationFinalizer {
  const persisted = new Map<string, string>();
  const finalize = async (receiptId: string, receiptDigest: string, nextLifecycleDigest: string) => {
    onFinalize?.();
    if (accepted.get(receiptId) !== receiptDigest) {
      return { status: "invalid", persistedLifecycleDigest: null } as const;
    }
    const existing = persisted.get(receiptId);
    if (existing !== undefined) {
      return existing === nextLifecycleDigest
        ? { status: "already_finalized", persistedLifecycleDigest: existing } as const
        : { status: "conflict", persistedLifecycleDigest: null } as const;
    }
    persisted.set(receiptId, nextLifecycleDigest);
    return { status: "finalized", persistedLifecycleDigest: nextLifecycleDigest } as const;
  };
  return {
    finalizeNoActiveTicketReconciliation: async ({
      evidence: input, canonicalEvidencePayload, expectedCurrentAggregate, canonicalExpectedCurrentAggregatePayload,
      nextLifecycle, canonicalNextLifecyclePayload, nextLifecycleDigest,
    }) => {
      expect(new TextDecoder().decode(canonicalEvidencePayload)).toBe(canonicalFlightJson(noActiveCanonicalEvidence(input)));
      assertExactAggregatePrefix(expectedCurrentAggregate, canonicalExpectedCurrentAggregatePayload);
      expect(new TextDecoder().decode(canonicalNextLifecyclePayload)).toBe(canonicalFlightJson(nextLifecycle as never));
      expect(nextLifecycleDigest).toBe(finalizedLifecycleDigest(nextLifecycle));
      expect(Object.isFrozen(nextLifecycle)).toBe(true);
      return finalize(input.trustedReceiptId, input.trustedReceiptDigest, nextLifecycleDigest);
    },
    finalizeAmbiguityReconciliation: async ({
      evidence: input, canonicalEvidencePayload, expectedCurrentAggregate, canonicalExpectedCurrentAggregatePayload,
      nextLifecycle, canonicalNextLifecyclePayload, nextLifecycleDigest,
    }) => {
      expect(new TextDecoder().decode(canonicalEvidencePayload)).toBe(canonicalFlightJson(ambiguityCanonicalEvidence(input)));
      assertExactAggregatePrefix(expectedCurrentAggregate, canonicalExpectedCurrentAggregatePayload);
      expect(new TextDecoder().decode(canonicalNextLifecyclePayload)).toBe(canonicalFlightJson(nextLifecycle as never));
      expect(nextLifecycleDigest).toBe(finalizedLifecycleDigest(nextLifecycle));
      expect(Object.isFrozen(nextLifecycle)).toBe(true);
      return finalize(input.trustedReceiptId, input.trustedReceiptDigest, nextLifecycleDigest);
    },
  };
}

function finalizedLifecycleDigest(lifecycle: FlightCommerceLifecycle) {
  return sha256FlightEvidence({
    version: "flight-reconciliation-finalized-lifecycle-v1",
    lifecycle: lifecycle as never,
  });
}

function aggregatePrefixEvidence(prefix: FlightReconciliationAggregatePrefix) {
  return {
    version: prefix.version,
    commerceId: prefix.commerceId,
    before: {
      order: { ...prefix.before.order },
      payment: { ...prefix.before.payment },
      ticket: { ...prefix.before.ticket },
    },
  };
}

function assertExactAggregatePrefix(prefix: FlightReconciliationAggregatePrefix, canonicalPayload: Uint8Array) {
  expect(prefix.prefixDigest).toBe(sha256FlightEvidence(aggregatePrefixEvidence(prefix)));
  expect(new TextDecoder().decode(canonicalPayload)).toBe(canonicalFlightJson(prefix as never));
  expect(Object.isFrozen(prefix)).toBe(true);
  expect(Object.isFrozen(prefix.before)).toBe(true);
}

function noActiveCanonicalEvidence(input: FlightNoActiveTicketReconciliationEvidence) {
  return {
    version: input.version,
    commerceId: input.commerceId,
    providerOrderId: input.providerOrderId,
    providerId: input.providerId,
    reconciliationCaseId: input.reconciliationCaseId,
    failureCause: input.failureCause,
    originalOperationReceiptDigest: input.originalOperationReceiptDigest,
    originalTicketDocumentReceiptDigests: [...input.originalTicketDocumentReceiptDigests],
    originalProviderStatusReceiptDigest: input.originalProviderStatusReceiptDigest,
    outcome: input.outcome,
    reconciledProviderStatusReceiptDigest: input.reconciledProviderStatusReceiptDigest,
    observedAt: input.observedAt,
    transition: { ...input.transition },
  };
}

function noActiveEvidence(
  lifecycle: FlightCommerceLifecycle,
  input: {
    at: number;
    failureCause: FlightNoActiveTicketFailureCause;
    receiptId?: string;
    receiptDigest?: string;
    originalOperationReceiptDigest?: string;
  },
): FlightNoActiveTicketReconciliationEvidence {
  const transition = evidence("ticket", input.at, lifecycle.ticket.revision);
  const documents = input.failureCause === "ticket_issuance_rejected" ? [] : ["7".repeat(64)];
  const withoutTrust = {
    version: "flight-no-active-ticket-reconciliation-v1" as const,
    commerceId: lifecycle.order.commerceId,
    providerOrderId: PROVIDER_ORDER_ID,
    providerId: PROVIDER_ID,
    reconciliationCaseId: `ticket_reconciliation_case_${String(input.at).padStart(4, "0")}`,
    failureCause: input.failureCause,
    originalOperationReceiptDigest: input.originalOperationReceiptDigest
      ?? lifecycle.ticket.history.at(-1)!.coordinatedOperationReceipt!.receiptDigest,
    originalTicketDocumentReceiptDigests: documents,
    originalProviderStatusReceiptDigest: "8".repeat(64),
    outcome: "no_active_ticket_documents" as const,
    reconciledProviderStatusReceiptDigest: "9".repeat(64),
    observedAt: transition.occurredAt,
    transition,
  };
  return {
    ...withoutTrust,
    canonicalEvidenceDigest: sha256FlightEvidence(noActiveCanonicalEvidence(withoutTrust as unknown as FlightNoActiveTicketReconciliationEvidence)),
    trustedReceiptId: input.receiptId ?? `trusted_ticket_receipt_${String(input.at).padStart(4, "0")}`,
    trustedReceiptDigest: input.receiptDigest ?? "a".repeat(64),
  };
}

function ambiguityCanonicalEvidence(input: FlightAmbiguityReconciliationEvidence) {
  return {
    version: input.version,
    commerceId: input.commerceId,
    providerOrderId: input.providerOrderId,
    providerId: input.providerId,
    reconciliationCaseId: input.reconciliationCaseId,
    operation: input.operation,
    outcome: input.outcome,
    originalOperationReceiptDigest: input.originalOperationReceiptDigest,
    originalProviderStatusReceiptDigest: input.originalProviderStatusReceiptDigest,
    resourceReceiptDigests: [...input.resourceReceiptDigests],
    reconciledProviderStatusReceiptDigest: input.reconciledProviderStatusReceiptDigest,
    observedAt: input.observedAt,
    transitions: {
      order: { ...input.transitions.order },
      payment: input.transitions.payment ? { ...input.transitions.payment } : null,
      ticket: input.transitions.ticket ? { ...input.transitions.ticket } : null,
    },
  };
}

function ambiguityEvidence(
  lifecycle: FlightCommerceLifecycle,
  input: {
    at: number;
    operation: FlightAmbiguityOperation;
    outcome: FlightAmbiguityOutcome;
    payment?: boolean;
    ticket?: boolean;
    receiptId?: string;
    receiptDigest?: string;
    originalOperationReceiptDigest?: string;
    transitionOverrides?: Partial<Record<"order" | "payment" | "ticket", Partial<FlightTransitionEvidence>>>;
  },
): FlightAmbiguityReconciliationEvidence {
  const order = { ...evidence("order", input.at, lifecycle.order.revision), ...input.transitionOverrides?.order };
  const payment = input.payment
    ? { ...evidence("payment", input.at, lifecycle.payment.revision), ...input.transitionOverrides?.payment }
    : null;
  const ticket = input.ticket
    ? { ...evidence("ticket", input.at, lifecycle.ticket.revision), ...input.transitionOverrides?.ticket }
    : null;
  const relevant = input.operation === "create_order"
    ? lifecycle.order
    : input.operation === "cancel_order"
      ? input.ticket ? lifecycle.ticket : lifecycle.order
    : ["issue_ticket", "exchange_ticket"].includes(input.operation)
      ? lifecycle.ticket
      : lifecycle.payment;
  const resourceFreeOutcome = ["payment_not_captured_no_authorization", "payment_authorization_absent", "order_absent"].includes(input.outcome);
  const withoutTrust = {
    version: "flight-ambiguity-reconciliation-v1" as const,
    commerceId: lifecycle.order.commerceId,
    providerOrderId: PROVIDER_ORDER_ID,
    providerId: PROVIDER_ID,
    reconciliationCaseId: `ambiguity_case_${input.operation}_${String(input.at).padStart(4, "0")}`,
    operation: input.operation,
    outcome: input.outcome,
    originalOperationReceiptDigest: input.originalOperationReceiptDigest
      ?? relevant.history.at(-1)!.coordinatedOperationReceipt!.receiptDigest,
    originalProviderStatusReceiptDigest: "b".repeat(64),
    resourceReceiptDigests: resourceFreeOutcome ? [] : ["c".repeat(64)],
    reconciledProviderStatusReceiptDigest: "d".repeat(64),
    observedAt: order.occurredAt,
    transitions: { order, payment, ticket },
  };
  return {
    ...withoutTrust,
    canonicalEvidenceDigest: sha256FlightEvidence(ambiguityCanonicalEvidence(withoutTrust as unknown as FlightAmbiguityReconciliationEvidence)),
    trustedReceiptId: input.receiptId ?? `trusted_ambiguity_receipt_${String(input.at).padStart(4, "0")}`,
    trustedReceiptDigest: input.receiptDigest ?? "e".repeat(64),
  };
}

function pricedLifecycle() {
  let current = createFlightCommerceLifecycle(COMMERCE_ID);
  current = { ...current, order: transitionFlightOrder(current.order, { type: "select_offer", ...evidence("order", 0, 0) }) };
  current = { ...current, order: transitionFlightOrder(current.order, { type: "start_reprice", ...evidence("order", 1, 1) }) };
  current = { ...current, order: transitionFlightOrder(current.order, { type: "accept_reprice", ...evidence("order", 2, 2) }) };
  return current;
}

function capturedOrderPendingLifecycle() {
  let current = pricedLifecycle();
  current = beginFlightCommercePayment(current, { order: evidence("order", 3, 3), payment: evidence("payment", 3, 0) });
  current = authorizeFlightCommercePayment(current, { order: evidence("order", 4, 4), payment: evidence("payment", 4, 1) });
  current = beginFlightCommercePaymentCapture(current, evidence("payment", 5, 2));
  current = completeFlightCommercePaymentCapture(current, evidence("payment", 6, 3));
  return submitFlightCommerceOrder(current, evidence("order", 7, 5));
}

function providerOrderCompletionCanonicalEvidence(receipt: FlightAuthenticatedProviderOrderCompletionReceipt) {
  return {
    version: receipt.version,
    operation: receipt.operation,
    commerceId: receipt.commerceId,
    providerId: receipt.providerId,
    providerOrderId: receipt.providerOrderId,
    providerOrderState: receipt.providerOrderState,
    providerTicketState: receipt.providerTicketState,
    providerOperationRequestReceiptDigest: receipt.providerOperationRequestReceiptDigest,
    providerOperationReceiptDigest: receipt.providerOperationReceiptDigest,
    outcome: receipt.outcome,
    electronicTicketDocumentReceiptDigests: [...receipt.electronicTicketDocumentReceiptDigests],
    observedAt: receipt.observedAt,
    expectedCurrentAggregate: {
      version: receipt.expectedCurrentAggregate.version,
      commerceId: receipt.expectedCurrentAggregate.commerceId,
      before: {
        order: { ...receipt.expectedCurrentAggregate.before.order },
        payment: { ...receipt.expectedCurrentAggregate.before.payment },
        ticket: { ...receipt.expectedCurrentAggregate.before.ticket },
      },
      prefixDigest: receipt.expectedCurrentAggregate.prefixDigest,
    },
    transitions: {
      order: { ...receipt.transitions.order },
      ticket: receipt.transitions.ticket === null ? null : { ...receipt.transitions.ticket },
    },
  };
}

function authenticatedProviderOrderCompletionReceipt(
  lifecycle: FlightCommerceLifecycle,
  outcome: FlightAuthenticatedProviderOrderCompletionOutcome,
  at: number,
  documents = outcome === "ticketed" ? ["4".repeat(64)] : [],
): FlightAuthenticatedProviderOrderCompletionReceipt {
  const expectedCurrentAggregate = getFlightCommerceAggregatePrefix(lifecycle);
  const withoutTrust = {
    version: "flight-authenticated-provider-order-completion-v1" as const,
    operation: "create_order" as const,
    commerceId: lifecycle.order.commerceId,
    providerId: PROVIDER_ID,
    providerOrderId: PROVIDER_ORDER_ID,
    providerOrderState: "order_confirmed" as const,
    providerTicketState: outcome === "order_confirmed"
      ? "not_started" as const
      : outcome === "ticketing_pending"
        ? "issuance_pending" as const
        : "issued" as const,
    providerOperationRequestReceiptDigest: "1".repeat(64),
    providerOperationReceiptDigest: "2".repeat(64),
    outcome,
    electronicTicketDocumentReceiptDigests: documents,
    observedAt: occurredAt(at),
    expectedCurrentAggregate,
    transitions: {
      order: evidence("order", at, lifecycle.order.revision),
      ticket: outcome === "order_confirmed" ? null : evidence("ticket", at, lifecycle.ticket.revision),
    },
  };
  const receipt = {
    ...withoutTrust,
    canonicalEvidenceDigest: "0".repeat(64),
    trustedReceiptId: `trusted_provider_order_receipt_${String(at).padStart(4, "0")}`,
    trustedReceiptDigest: "3".repeat(64),
  };
  return {
    ...receipt,
    canonicalEvidenceDigest: digestFlightProviderOrderCompletionCanonicalEvidence(withoutTrust),
  };
}

function acceptedProviderOrderCompletionFinalizer(
  authenticatedReceipt: FlightAuthenticatedProviderOrderCompletionReceipt,
  observedStatuses?: string[],
): FlightAuthenticatedProviderOrderCompletionFinalizer {
  let persistedLifecycleDigest: string | null = null;
  const expectedEvidence = canonicalFlightJson(providerOrderCompletionCanonicalEvidence(authenticatedReceipt) as never);
  return {
    finalizeAuthenticatedProviderOrderCompletion: async ({
      receipt,
      canonicalEvidencePayload,
      expectedCurrentAggregate,
      canonicalExpectedCurrentAggregatePayload,
      nextLifecycle,
      canonicalNextLifecyclePayload,
      nextLifecycleDigest,
    }) => {
      if (
        receipt.trustedReceiptId !== authenticatedReceipt.trustedReceiptId
        || receipt.trustedReceiptDigest !== authenticatedReceipt.trustedReceiptDigest
        || new TextDecoder().decode(canonicalEvidencePayload) !== expectedEvidence
      ) {
        observedStatuses?.push("invalid");
        return { status: "invalid", persistedLifecycleDigest: null };
      }
      expect(canonicalFlightJson(expectedCurrentAggregate as never)).toBe(
        canonicalFlightJson(authenticatedReceipt.expectedCurrentAggregate as never),
      );
      expect(new TextDecoder().decode(canonicalExpectedCurrentAggregatePayload)).toBe(
        canonicalFlightJson(expectedCurrentAggregate as never),
      );
      expect(new TextDecoder().decode(canonicalNextLifecyclePayload)).toBe(canonicalFlightJson(nextLifecycle as never));
      expect(nextLifecycleDigest).toBe(finalizedLifecycleDigest(nextLifecycle));
      expect(Object.isFrozen(nextLifecycle)).toBe(true);
      if (persistedLifecycleDigest !== null) {
        observedStatuses?.push("already_finalized");
        return { status: "already_finalized", persistedLifecycleDigest };
      }
      persistedLifecycleDigest = nextLifecycleDigest;
      observedStatuses?.push("finalized");
      return { status: "finalized", persistedLifecycleDigest };
    },
  };
}

function ticketedLifecycle() {
  let current = capturedOrderPendingLifecycle();
  current = completeFlightCommerceOrder(current, evidence("order", 8, 6));
  current = beginFlightCommerceTicketing(current, {
    order: evidence("order", 9, 7),
    ticket: evidence("ticket", 9, 0),
  });
  return completeFlightCommerceTicketing(current, {
    order: evidence("order", 10, 8),
    ticket: evidence("ticket", 10, 1),
  });
}

function paymentAuthorizationAmbiguousLifecycle() {
  let current = pricedLifecycle();
  current = beginFlightCommercePayment(current, { order: evidence("order", 3, 3), payment: evidence("payment", 3, 0) });
  return markFlightCommercePaymentAuthorizationAmbiguous(current, {
    order: evidence("order", 4, 4),
    payment: evidence("payment", 4, 1),
  });
}

function captureFailureLifecycle() {
  let current = pricedLifecycle();
  current = beginFlightCommercePayment(current, { order: evidence("order", 3, 3), payment: evidence("payment", 3, 0) });
  current = authorizeFlightCommercePayment(current, { order: evidence("order", 4, 4), payment: evidence("payment", 4, 1) });
  current = beginFlightCommercePaymentCapture(current, evidence("payment", 5, 2));
  return rejectFlightCommercePaymentCapture(current, {
    order: evidence("order", 6, 5),
    payment: evidence("payment", 6, 3),
  });
}

function paymentVoidFailureLifecycle() {
  let current = pricedLifecycle();
  current = beginFlightCommercePayment(current, { order: evidence("order", 3, 3), payment: evidence("payment", 3, 0) });
  current = authorizeFlightCommercePayment(current, { order: evidence("order", 4, 4), payment: evidence("payment", 4, 1) });
  current = beginFlightCommercePaymentVoid(current, evidence("payment", 5, 2));
  return rejectFlightCommercePaymentVoid(current, {
    order: evidence("order", 6, 5),
    payment: evidence("payment", 6, 3),
  });
}

function orderCreationFailureLifecycle() {
  return rejectFlightCommerceOrder(capturedOrderPendingLifecycle(), evidence("order", 8, 6));
}

function issuanceFailureLifecycle() {
  let current = capturedOrderPendingLifecycle();
  current = completeFlightCommerceOrder(current, evidence("order", 8, 6));
  current = beginFlightCommerceTicketing(current, {
    order: evidence("order", 9, 7),
    ticket: evidence("ticket", 9, 0),
  });
  return rejectFlightCommerceTicketing(current, {
    order: evidence("order", 10, 8),
    ticket: evidence("ticket", 10, 1),
  });
}

function exchangeFailureLifecycle() {
  let current = ticketedLifecycle();
  current = beginFlightCommerceTicketExchange(current, {
    order: evidence("order", 11, 9),
    ticket: evidence("ticket", 11, 2),
  });
  return rejectFlightCommerceTicketExchange(current, {
    order: evidence("order", 12, 10),
    ticket: evidence("ticket", 12, 3),
  });
}

function ticketVoidFailureLifecycle() {
  let current = ticketedLifecycle();
  current = beginFlightCommerceCancellation(current, {
    order: evidence("order", 11, 9),
    ticket: evidence("ticket", 11, 2),
  });
  return rejectFlightCommerceCancellation(current, {
    order: evidence("order", 12, 10),
    ticket: evidence("ticket", 12, 3),
  });
}

function unticketedCancellationFailureLifecycle() {
  let current = capturedOrderPendingLifecycle();
  current = completeFlightCommerceOrder(current, evidence("order", 8, 6));
  current = beginFlightCommerceCancellation(current, { order: evidence("order", 9, 7) });
  return rejectFlightCommerceCancellation(current, { order: evidence("order", 10, 8) });
}

function refundFailureLifecycle() {
  let current = ticketedLifecycle();
  current = beginFlightCommerceCancellation(current, {
    order: evidence("order", 11, 9),
    ticket: evidence("ticket", 11, 2),
  });
  current = completeFlightCommerceCancellation(current, {
    order: evidence("order", 12, 10),
    ticket: evidence("ticket", 12, 3),
  });
  current = beginFlightCommerceRefund(current, {
    order: evidence("order", 13, 11),
    payment: evidence("payment", 13, 4),
  });
  return rejectFlightCommerceRefund(current, {
    order: evidence("order", 14, 12),
    payment: evidence("payment", 14, 5),
  });
}

describe("provider-neutral flight commerce domain", () => {
  it("validates normalized search and offer snapshots without provider behavior", () => {
    expect(validateFlightCommerceSearchRequest(syntheticFlightSearchRequest)).toEqual({
      valid: true,
      totalPassengers: 1,
      errors: [],
    });
    expect(validateFlightOfferSnapshot(syntheticFlightOfferFixture)).toEqual({ valid: true, errors: [] });
  });

  it("rejects impossible passenger groups, routes, dates, money, and segment chronology", () => {
    expect(validateFlightCommerceSearchRequest({
      ...syntheticFlightSearchRequest,
      destination: "ORD",
      returnDate: "2027-02-09",
      passengers: { adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 2 },
    }).errors).toEqual(expect.arrayContaining([
      "Origin and destination must differ.",
      "Return date must be after departure date.",
      "Lap infants cannot exceed adults.",
    ]));

    expect(validateFlightOfferSnapshot({
      ...syntheticFlightOfferFixture,
      total: { currency: "usd", amountMinor: -1 },
      segments: [{
        ...syntheticFlightOfferFixture.segments[0],
        arrivesAt: syntheticFlightOfferFixture.segments[0].departsAt,
      }],
    }).errors).toEqual(expect.arrayContaining([
      "Offer currency must be an uppercase three-letter code.",
      "Offer total must be a non-negative safe integer in minor units.",
      "Every segment requires exact, increasing UTC departure and arrival times.",
    ]));
  });

  it("advances booking, payment, ticketing, cancellation, and refund as one evidence-bound lifecycle", () => {
    const initial = createFlightCommerceLifecycle(COMMERCE_ID);
    let current = initial;
    current = { ...current, order: transitionFlightOrder(current.order, { type: "select_offer", ...evidence("order", 0, 0) }) };
    current = { ...current, order: transitionFlightOrder(current.order, { type: "start_reprice", ...evidence("order", 1, 1) }) };
    current = { ...current, order: transitionFlightOrder(current.order, { type: "accept_reprice", ...evidence("order", 2, 2) }) };
    current = beginFlightCommercePayment(current, {
      order: evidence("order", 3, 3),
      payment: evidence("payment", 3, 0),
    });
    current = authorizeFlightCommercePayment(current, {
      order: evidence("order", 4, 4),
      payment: evidence("payment", 4, 1),
    });
    current = beginFlightCommercePaymentCapture(current, evidence("payment", 5, 2));
    current = completeFlightCommercePaymentCapture(current, evidence("payment", 6, 3));
    current = submitFlightCommerceOrder(current, evidence("order", 7, 5));
    current = completeFlightCommerceOrder(current, evidence("order", 8, 6));
    current = beginFlightCommerceTicketing(current, {
      order: evidence("order", 9, 7),
      ticket: evidence("ticket", 9, 0),
    });
    current = completeFlightCommerceTicketing(current, {
      order: evidence("order", 10, 8),
      ticket: evidence("ticket", 10, 1),
    });
    current = beginFlightCommerceCancellation(current, {
      order: evidence("order", 11, 9),
      ticket: evidence("ticket", 11, 2),
    });
    current = completeFlightCommerceCancellation(current, {
      order: evidence("order", 12, 10),
      ticket: evidence("ticket", 12, 3),
    });
    current = beginFlightCommerceRefund(current, {
      order: evidence("order", 13, 11),
      payment: evidence("payment", 13, 4),
    });
    current = completeFlightCommerceRefund(current, {
      order: evidence("order", 14, 12),
      payment: evidence("payment", 14, 5),
    });

    expect(initial).toEqual({
      order: { commerceId: COMMERCE_ID, state: "draft", revision: 0, history: [] },
      payment: { commerceId: COMMERCE_ID, state: "not_started", revision: 0, history: [] },
      ticket: { commerceId: COMMERCE_ID, state: "not_started", revision: 0, history: [] },
    });
    expect(current.order.state).toBe("refunded");
    expect(current.payment.state).toBe("refunded");
    expect(current.ticket.state).toBe("voided");
    expect(current.order.history[8]).toMatchObject({ type: "issue_tickets", fromState: "ticketing_pending", toState: "ticketed" });
  });

  it("rejects direct or premature commercial state claims without matching evidence", () => {
    let current = pricedLifecycle();
    expect(() => transitionFlightOrder(current.order, { type: "begin_payment", ...evidence("order", 3, 3) })).toThrow(/coordinated/i);
    expect(() => transitionFlightOrder(current.order, {
      type: "reconcile_cancelled_order_active_ticket",
      ...evidence("order", 3, 3),
    })).toThrow(/coordinated/i);
    current = beginFlightCommercePayment(current, { order: evidence("order", 3, 3), payment: evidence("payment", 3, 0) });
    current = authorizeFlightCommercePayment(current, { order: evidence("order", 4, 4), payment: evidence("payment", 4, 1) });
    expect(() => submitFlightCommerceOrder(current, evidence("order", 5, 5))).toThrow(/payment state must be captured/i);
    expect(current).toMatchObject({ order: { state: "payment_authorized" }, payment: { state: "authorized" }, ticket: { state: "not_started" } });
  });

  it("keeps failure, authenticated reconciliation, and compensation paths synchronized", async () => {
    let paymentFailure = pricedLifecycle();
    paymentFailure = beginFlightCommercePayment(paymentFailure, {
      order: evidence("order", 3, 3),
      payment: evidence("payment", 3, 0),
    });
    paymentFailure = rejectFlightCommercePayment(paymentFailure, {
      order: evidence("order", 4, 4),
      payment: evidence("payment", 4, 1),
    });
    expect(paymentFailure).toMatchObject({
      order: { state: "failed" },
      payment: { state: "failed" },
      ticket: { state: "not_started" },
    });

    let ticketFailure = capturedOrderPendingLifecycle();
    ticketFailure = completeFlightCommerceOrder(ticketFailure, evidence("order", 8, 6));
    ticketFailure = beginFlightCommerceTicketing(ticketFailure, {
      order: evidence("order", 9, 7),
      ticket: evidence("ticket", 9, 0),
    });
    ticketFailure = rejectFlightCommerceTicketing(ticketFailure, {
      order: evidence("order", 10, 8),
      ticket: evidence("ticket", 10, 1),
    });
    expect(ticketFailure).toMatchObject({
      order: { state: "manual_review" },
      payment: { state: "captured" },
      ticket: { state: "manual_review" },
    });
    expect(() => beginFlightCommerceCompensatingRefund(ticketFailure, {
      order: evidence("order", 11, 9),
      payment: evidence("payment", 11, 4),
    })).toThrow(/authenticated reconciliation/i);
    const ticketAbsence = noActiveEvidence(ticketFailure, {
      at: 11,
      failureCause: "ticket_issuance_rejected",
    });
    ticketFailure = await reconcileFlightCommerceNoActiveTicket(
      ticketFailure,
      ticketAbsence,
      acceptedVerifier(new Map([[ticketAbsence.trustedReceiptId, ticketAbsence.trustedReceiptDigest]])),
    );
    ticketFailure = beginFlightCommerceCompensatingRefund(ticketFailure, {
      order: evidence("order", 12, 9),
      payment: evidence("payment", 12, 4),
    });
    expect(ticketFailure).toMatchObject({
      order: { state: "refund_pending" },
      payment: { state: "refund_pending" },
      ticket: { state: "no_active_ticket" },
    });

    let compensation = capturedOrderPendingLifecycle();
    compensation = rejectFlightCommerceOrder(compensation, evidence("order", 8, 6));
    expect(compensation).toMatchObject({
      order: { state: "manual_review" },
      payment: { state: "captured" },
      ticket: { state: "not_started" },
    });
    expect(() => beginFlightCommerceCompensatingRefund(compensation, {
      order: evidence("order", 9, 7),
      payment: evidence("payment", 9, 4),
    })).toThrow(/authenticated reconciliation/i);
    const absentOrder = ambiguityEvidence(compensation, {
      at: 9,
      operation: "create_order",
      outcome: "order_absent",
    });
    compensation = await reconcileFlightCommerceOrderCreation(
      compensation,
      absentOrder,
      acceptedVerifier(new Map([[absentOrder.trustedReceiptId, absentOrder.trustedReceiptDigest]])),
    );
    compensation = beginFlightCommerceCompensatingRefund(compensation, {
      order: evidence("order", 10, 8),
      payment: evidence("payment", 10, 4),
    });
    const refundFailure = rejectFlightCommerceRefund(compensation, {
      order: evidence("order", 11, 9),
      payment: evidence("payment", 11, 5),
    });
    expect(refundFailure).toMatchObject({
      order: { state: "manual_review" },
      payment: { state: "manual_review" },
      ticket: { state: "not_started" },
    });
  });

  it("coordinates capture failure, authorization void, exchange, cancellation, and partial refund paths", async () => {
    let captureFailure = pricedLifecycle();
    captureFailure = beginFlightCommercePayment(captureFailure, { order: evidence("order", 3, 3), payment: evidence("payment", 3, 0) });
    captureFailure = authorizeFlightCommercePayment(captureFailure, { order: evidence("order", 4, 4), payment: evidence("payment", 4, 1) });
    captureFailure = beginFlightCommercePaymentCapture(captureFailure, evidence("payment", 5, 2));
    captureFailure = rejectFlightCommercePaymentCapture(captureFailure, {
      order: evidence("order", 6, 5),
      payment: evidence("payment", 6, 3),
    });
    expect(captureFailure).toMatchObject({ order: { state: "manual_review" }, payment: { state: "manual_review" } });

    let voided = pricedLifecycle();
    voided = beginFlightCommercePayment(voided, { order: evidence("order", 3, 3), payment: evidence("payment", 3, 0) });
    voided = authorizeFlightCommercePayment(voided, { order: evidence("order", 4, 4), payment: evidence("payment", 4, 1) });
    voided = beginFlightCommercePaymentVoid(voided, evidence("payment", 5, 2));
    voided = completeFlightCommercePaymentVoid(voided, {
      order: evidence("order", 6, 5),
      payment: evidence("payment", 6, 3),
    });
    expect(voided).toMatchObject({ order: { state: "failed" }, payment: { state: "voided" } });

    let serviced = ticketedLifecycle();
    serviced = beginFlightCommerceTicketExchange(serviced, {
      order: evidence("order", 11, 9),
      ticket: evidence("ticket", 11, 2),
    });
    serviced = completeFlightCommerceTicketExchange(serviced, {
      order: evidence("order", 12, 10),
      ticket: evidence("ticket", 12, 3),
    });
    expect(serviced).toMatchObject({ order: { state: "ticketed" }, ticket: { state: "exchanged" } });
    serviced = beginFlightCommerceCancellation(serviced, {
      order: evidence("order", 13, 11),
      ticket: evidence("ticket", 13, 4),
    });
    serviced = completeFlightCommerceCancellation(serviced, {
      order: evidence("order", 14, 12),
      ticket: evidence("ticket", 14, 5),
    });
    serviced = beginFlightCommerceRefund(serviced, {
      order: evidence("order", 15, 13),
      payment: evidence("payment", 15, 4),
    });
    serviced = partiallyCompleteFlightCommerceRefund(serviced, evidence("payment", 16, 5));
    expect(serviced).toMatchObject({ order: { state: "refund_pending" }, payment: { state: "partially_refunded" }, ticket: { state: "voided" } });
    serviced = continueFlightCommerceRefund(serviced, evidence("payment", 17, 6));
    serviced = completeFlightCommerceRefund(serviced, {
      order: evidence("order", 18, 14),
      payment: evidence("payment", 18, 7),
    });
    expect(serviced).toMatchObject({ order: { state: "refunded" }, payment: { state: "refunded" }, ticket: { state: "voided" } });

    let exchangeFailure = ticketedLifecycle();
    exchangeFailure = beginFlightCommerceTicketExchange(exchangeFailure, {
      order: evidence("order", 11, 9),
      ticket: evidence("ticket", 11, 2),
    });
    exchangeFailure = rejectFlightCommerceTicketExchange(exchangeFailure, {
      order: evidence("order", 12, 10),
      ticket: evidence("ticket", 12, 3),
    });
    expect(exchangeFailure).toMatchObject({ order: { state: "manual_review" }, ticket: { state: "manual_review" } });
    expect(() => beginFlightCommerceCompensatingRefund(exchangeFailure, {
      order: evidence("order", 13, 11),
      payment: evidence("payment", 13, 4),
    })).toThrow(/authenticated reconciliation/i);
    const exchangeAbsence = noActiveEvidence(exchangeFailure, {
      at: 13,
      failureCause: "ticket_exchange_rejected",
    });
    exchangeFailure = await reconcileFlightCommerceNoActiveTicket(
      exchangeFailure,
      exchangeAbsence,
      acceptedVerifier(new Map([[exchangeAbsence.trustedReceiptId, exchangeAbsence.trustedReceiptDigest]])),
    );
    expect(beginFlightCommerceCompensatingRefund(exchangeFailure, {
      order: evidence("order", 14, 11),
      payment: evidence("payment", 14, 4),
    })).toMatchObject({
      order: { state: "refund_pending" },
      payment: { state: "refund_pending" },
      ticket: { state: "no_active_ticket" },
    });
  });

  it("rejects forged aggregate states and tampered lifecycle histories before coordination", () => {
    let authorized = pricedLifecycle();
    authorized = beginFlightCommercePayment(authorized, {
      order: evidence("order", 3, 3),
      payment: evidence("payment", 3, 0),
    });
    authorized = authorizeFlightCommercePayment(authorized, {
      order: evidence("order", 4, 4),
      payment: evidence("payment", 4, 1),
    });

    const forgedPayment = {
      ...authorized,
      payment: { ...authorized.payment, state: "captured" as const },
    };
    expect(() => submitFlightCommerceOrder(forgedPayment, evidence("order", 5, 5))).toThrow(/state does not match/i);

    const forgedOrder = {
      ...authorized,
      order: { ...authorized.order, state: "order_confirmed" as const },
    };
    expect(() => beginFlightCommerceTicketing(forgedOrder, {
      order: evidence("order", 5, 5),
      ticket: evidence("ticket", 5, 0),
    })).toThrow(/state does not match/i);

    const selected = transitionFlightOrder(createFlightOrderLifecycle(COMMERCE_ID), {
      type: "select_offer",
      ...evidence("order", 1, 0),
    });
    const firstEvent = selected.history[0];
    const nextCommand = { type: "start_reprice" as const, ...evidence("order", 2, 1) };
    expect(() => transitionFlightOrder({
      ...selected,
      revision: 2,
    }, nextCommand)).toThrow(/revision does not match/i);
    expect(() => transitionFlightOrder({
      ...selected,
      history: [{ ...firstEvent, fromState: "priced" }],
    }, nextCommand)).toThrow(/exact permitted transition chain/i);
    expect(() => transitionFlightOrder({
      ...selected,
      history: [{ ...firstEvent, toState: "priced" }],
    }, nextCommand)).toThrow(/exact permitted transition chain/i);
    expect(() => transitionFlightOrder({
      ...selected,
      history: [{ ...firstEvent, idempotencyDigest: "not-a-digest" }],
    }, nextCommand)).toThrow(/invalid or duplicate idempotency/i);
    expect(() => transitionFlightOrder({
      ...selected,
      history: [{ ...firstEvent, occurredAt: "not-an-instant" }],
    }, nextCommand)).toThrow(/timestamps are invalid/i);

    const otherCommerce = createFlightCommerceLifecycle("flight_commerce_test_0002");
    expect(() => beginFlightCommercePayment({
      ...pricedLifecycle(),
      payment: otherCommerce.payment,
    }, {
      order: evidence("order", 3, 3),
      payment: evidence("payment", 3, 0),
    })).toThrow(/share one commerce ID/i);
  });

  it("fails closed on skipped, stale, duplicate, malformed, or out-of-order lifecycle events", () => {
    const initial = createFlightOrderLifecycle(COMMERCE_ID);
    const command = {
      type: "select_offer" as const,
      eventId: "order_event_initial_0001",
      occurredAt: occurredAt(1),
      idempotencyDigest: "a".repeat(64),
      expectedRevision: 0,
    };
    const selected = transitionFlightOrder(initial, command);
    expect(() => transitionFlightOrder(initial, { ...command, type: "submit_order" })).toThrow(InvalidFlightTransitionError);
    expect(() => transitionFlightOrder(selected, { ...command, type: "start_reprice" })).toThrow("Lifecycle revision is stale.");
    expect(() => transitionFlightOrder(selected, {
      ...command,
      type: "start_reprice",
      expectedRevision: 1,
    })).toThrow("Event ID has already been recorded.");
    expect(() => transitionFlightOrder(selected, {
      ...command,
      type: "start_reprice",
      eventId: "order_event_second_0002",
      expectedRevision: 1,
    })).toThrow("Idempotency digest has already been recorded.");
    expect(() => transitionFlightOrder(selected, {
      ...command,
      type: "start_reprice",
      eventId: "order_event_second_0002",
      idempotencyDigest: "b".repeat(64),
      occurredAt: occurredAt(0),
      expectedRevision: 1,
    })).toThrow("Event time must be strictly later");
  });

  it("stores one exact coordinated receipt across streams and rejects history splices", () => {
    let first = pricedLifecycle();
    first = beginFlightCommercePayment(first, {
      order: evidence("order", 3, 3),
      payment: evidence("payment", 3, 0),
    });
    const firstReceipt = first.order.history.at(-1)!.coordinatedOperationReceipt;
    expect(firstReceipt).not.toBeNull();
    expect(first.payment.history.at(-1)!.coordinatedOperationReceipt).toEqual(firstReceipt);
    expect(firstReceipt).toMatchObject({
      operation: "begin_payment",
      commerceId: COMMERCE_ID,
      events: [
        { lifecycle: "order", expectedRevision: 3 },
        { lifecycle: "payment", expectedRevision: 0 },
      ],
    });

    let second = createFlightCommerceLifecycle(COMMERCE_ID);
    second = { ...second, order: transitionFlightOrder(second.order, { type: "select_offer", ...evidence("order", 20, 0) }) };
    second = { ...second, order: transitionFlightOrder(second.order, { type: "start_reprice", ...evidence("order", 21, 1) }) };
    second = { ...second, order: transitionFlightOrder(second.order, { type: "accept_reprice", ...evidence("order", 22, 2) }) };
    second = beginFlightCommercePayment(second, {
      order: evidence("order", 23, 3),
      payment: evidence("payment", 23, 0),
    });
    const spliced = { ...first, payment: second.payment };
    expect(() => authorizeFlightCommercePayment(spliced, {
      order: evidence("order", 24, 4),
      payment: evidence("payment", 24, 1),
    })).toThrow(/receipt.*missing|aggregate history prefix|event binding/i);
  });

  it("does not consume trusted reconciliation receipts for a stale transition or the wrong original attempt", async () => {
    const lifecycle = captureFailureLifecycle();
    let consumes = 0;
    const verifier = acceptedVerifier(new Map([["trusted_ambiguity_receipt_0007", "e".repeat(64)]]), () => {
      consumes += 1;
    });
    const wrongAttempt = ambiguityEvidence(lifecycle, {
      at: 7,
      operation: "capture_payment",
      outcome: "payment_captured",
      payment: true,
      originalOperationReceiptDigest: "f".repeat(64),
    });
    await expect(reconcileFlightCommercePaymentCapture(lifecycle, wrongAttempt, verifier)).rejects.toThrow(/another coordinated operation attempt/i);
    expect(consumes).toBe(0);

    const stale = ambiguityEvidence(lifecycle, {
      at: 7,
      operation: "capture_payment",
      outcome: "payment_captured",
      payment: true,
      transitionOverrides: { order: { expectedRevision: lifecycle.order.revision - 1 } },
    });
    await expect(reconcileFlightCommercePaymentCapture(lifecycle, stale, verifier)).rejects.toThrow(/stale or invalid/i);
    expect(consumes).toBe(0);

    const ticketLifecycle = issuanceFailureLifecycle();
    const staleTicket = noActiveEvidence(ticketLifecycle, {
      at: 11,
      failureCause: "ticket_issuance_rejected",
    });
    staleTicket.transition.expectedRevision -= 1;
    staleTicket.canonicalEvidenceDigest = sha256FlightEvidence(noActiveCanonicalEvidence(staleTicket));
    let ticketConsumes = 0;
    await expect(reconcileFlightCommerceNoActiveTicket(
      ticketLifecycle,
      staleTicket,
      acceptedVerifier(new Map([[staleTicket.trustedReceiptId, staleTicket.trustedReceiptDigest]]), () => {
        ticketConsumes += 1;
      }),
    )).rejects.toThrow(/stale or invalid/i);
    expect(ticketConsumes).toBe(0);
  });

  it("uses an immutable ambiguity snapshot while trusted receipt verification is deferred", async () => {
    const lifecycle = captureFailureLifecycle();
    const input = ambiguityEvidence(lifecycle, {
      at: 7,
      operation: "capture_payment",
      outcome: "payment_captured",
      payment: true,
    });
    const expectedCanonical = canonicalFlightJson(ambiguityCanonicalEvidence(input));
    let enterVerifier!: () => void;
    let releaseVerifier!: () => void;
    const verifierEntered = new Promise<void>((resolve) => { enterVerifier = resolve; });
    const verifierReleased = new Promise<void>((resolve) => { releaseVerifier = resolve; });
    const verifier: FlightProviderReconciliationFinalizer = {
      finalizeNoActiveTicketReconciliation: async () => ({ status: "unavailable", persistedLifecycleDigest: null }),
      finalizeAmbiguityReconciliation: async ({
        evidence: reviewed, canonicalEvidencePayload, nextLifecycle, canonicalNextLifecyclePayload, nextLifecycleDigest,
      }) => {
        expect(Object.isFrozen(reviewed)).toBe(true);
        expect(Object.isFrozen(reviewed.transitions)).toBe(true);
        expect(Object.isFrozen(reviewed.transitions.order)).toBe(true);
        expect(Object.isFrozen(reviewed.resourceReceiptDigests)).toBe(true);
        expect(new TextDecoder().decode(canonicalEvidencePayload)).toBe(expectedCanonical);
        expect(new TextDecoder().decode(canonicalNextLifecyclePayload)).toBe(canonicalFlightJson(nextLifecycle as never));
        expect(nextLifecycleDigest).toBe(finalizedLifecycleDigest(nextLifecycle));
        expect(Object.isFrozen(nextLifecycle)).toBe(true);
        enterVerifier();
        await verifierReleased;
        expect(canonicalFlightJson(ambiguityCanonicalEvidence(reviewed))).toBe(expectedCanonical);
        expect(new TextDecoder().decode(canonicalEvidencePayload)).toBe(expectedCanonical);
        return { status: "finalized", persistedLifecycleDigest: nextLifecycleDigest };
      },
    };

    const pending = reconcileFlightCommercePaymentCapture(lifecycle, input, verifier);
    await verifierEntered;
    lifecycle.order.state = "cancelled";
    lifecycle.payment.state = "refunded";
    input.outcome = "payment_not_captured_no_authorization";
    input.transitions.order.expectedRevision = 999;
    (input.resourceReceiptDigests as string[]).push("f".repeat(64));
    releaseVerifier();

    const result = await pending;
    expect(result).toMatchObject({ order: { state: "payment_authorized" }, payment: { state: "captured" } });
    expect(result.order.history.at(-1)?.ambiguityReconciliation?.outcome).toBe("payment_captured");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.order)).toBe(true);
    expect(Object.isFrozen(result.order.history)).toBe(true);
  });

  it("uses an immutable no-active-ticket snapshot while trusted receipt verification is deferred", async () => {
    const lifecycle = issuanceFailureLifecycle();
    const input = noActiveEvidence(lifecycle, {
      at: 11,
      failureCause: "ticket_issuance_rejected",
    });
    const expectedCanonical = canonicalFlightJson(noActiveCanonicalEvidence(input));
    let enterVerifier!: () => void;
    let releaseVerifier!: () => void;
    const verifierEntered = new Promise<void>((resolve) => { enterVerifier = resolve; });
    const verifierReleased = new Promise<void>((resolve) => { releaseVerifier = resolve; });
    const verifier: FlightProviderReconciliationFinalizer = {
      finalizeAmbiguityReconciliation: async () => ({ status: "unavailable", persistedLifecycleDigest: null }),
      finalizeNoActiveTicketReconciliation: async ({
        evidence: reviewed, canonicalEvidencePayload, nextLifecycle, canonicalNextLifecyclePayload, nextLifecycleDigest,
      }) => {
        expect(Object.isFrozen(reviewed)).toBe(true);
        expect(Object.isFrozen(reviewed.transition)).toBe(true);
        expect(Object.isFrozen(reviewed.originalTicketDocumentReceiptDigests)).toBe(true);
        expect(new TextDecoder().decode(canonicalEvidencePayload)).toBe(expectedCanonical);
        expect(new TextDecoder().decode(canonicalNextLifecyclePayload)).toBe(canonicalFlightJson(nextLifecycle as never));
        expect(nextLifecycleDigest).toBe(finalizedLifecycleDigest(nextLifecycle));
        expect(Object.isFrozen(nextLifecycle)).toBe(true);
        enterVerifier();
        await verifierReleased;
        expect(canonicalFlightJson(noActiveCanonicalEvidence(reviewed))).toBe(expectedCanonical);
        expect(new TextDecoder().decode(canonicalEvidencePayload)).toBe(expectedCanonical);
        return { status: "finalized", persistedLifecycleDigest: nextLifecycleDigest };
      },
    };

    const pending = reconcileFlightCommerceNoActiveTicket(lifecycle, input, verifier);
    await verifierEntered;
    lifecycle.ticket.state = "issued";
    input.transition.expectedRevision = 999;
    input.reconciledProviderStatusReceiptDigest = "f".repeat(64);
    (input.originalTicketDocumentReceiptDigests as string[]).push("7".repeat(64));
    releaseVerifier();

    const result = await pending;
    expect(result.ticket.state).toBe("no_active_ticket");
    expect(result.ticket.history.at(-1)?.noActiveTicketReconciliation?.transition.expectedRevision).not.toBe(999);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.ticket)).toBe(true);
    expect(Object.isFrozen(result.ticket.history)).toBe(true);
  });

  it("leaves the trusted receipt unconsumed on persistence failure and completes safely on retry", async () => {
    const lifecycle = captureFailureLifecycle();
    const input = ambiguityEvidence(lifecycle, {
      at: 7,
      operation: "capture_payment",
      outcome: "payment_captured",
      payment: true,
    });
    const persisted = new Map<string, { lifecycleDigest: string; lifecycleCanonical: string }>();
    const consumed = new Set<string>();
    let failPersistence = true;
    const statuses: string[] = [];
    const expectedPrefixes: string[] = [];
    const finalizer: FlightProviderReconciliationFinalizer = {
      finalizeNoActiveTicketReconciliation: async () => ({ status: "unavailable", persistedLifecycleDigest: null }),
      finalizeAmbiguityReconciliation: async ({
        evidence: reviewed, expectedCurrentAggregate, nextLifecycle, nextLifecycleDigest,
      }) => {
        expectedPrefixes.push(expectedCurrentAggregate.prefixDigest);
        const existing = persisted.get(reviewed.trustedReceiptId);
        if (existing !== undefined) {
          const status = existing.lifecycleDigest === nextLifecycleDigest ? "already_finalized" : "conflict";
          statuses.push(status);
          return status === "already_finalized"
            ? { status, persistedLifecycleDigest: existing.lifecycleDigest }
            : { status, persistedLifecycleDigest: null };
        }
        if (failPersistence) {
          failPersistence = false;
          statuses.push("unavailable");
          return { status: "unavailable", persistedLifecycleDigest: null };
        }
        // This assignment and receipt consumption model one database transaction: neither is visible without both.
        persisted.set(reviewed.trustedReceiptId, {
          lifecycleDigest: nextLifecycleDigest,
          lifecycleCanonical: canonicalFlightJson(nextLifecycle as never),
        });
        consumed.add(reviewed.trustedReceiptId);
        statuses.push("finalized");
        return { status: "finalized", persistedLifecycleDigest: nextLifecycleDigest };
      },
    };

    await expect(reconcileFlightCommercePaymentCapture(lifecycle, input, finalizer))
      .rejects.toThrow(/lifecycle finalization was not accepted: unavailable/i);
    expect(consumed.size).toBe(0);
    expect(persisted.size).toBe(0);

    const retried = await reconcileFlightCommercePaymentCapture(lifecycle, input, finalizer);
    expect(retried).toMatchObject({ order: { state: "payment_authorized" }, payment: { state: "captured" } });
    expect(consumed).toEqual(new Set([input.trustedReceiptId]));
    expect(persisted.get(input.trustedReceiptId)).toEqual({
      lifecycleDigest: finalizedLifecycleDigest(retried),
      lifecycleCanonical: canonicalFlightJson(retried as never),
    });

    const completionRetry = await reconcileFlightCommercePaymentCapture(retried, input, finalizer);
    expect(completionRetry).toEqual(retried);
    expect(statuses).toEqual(["unavailable", "finalized", "already_finalized"]);
    expect(new Set(expectedPrefixes).size).toBe(1);
    expect(persisted.size).toBe(1);

    await expect(reconcileFlightCommerceRefund(retried, input, finalizer))
      .rejects.toThrow(/another operation handler/i);

    const alteredReceipt = { ...input, trustedReceiptDigest: "f".repeat(64) };
    await expect(reconcileFlightCommercePaymentCapture(retried, alteredReceipt, finalizer))
      .rejects.toThrow(/order state must be manual_review/i);
    expect(persisted.size).toBe(1);
  });

  it("serializes concurrent finalization to one durable lifecycle and one digest-bound completion", async () => {
    const lifecycle = captureFailureLifecycle();
    const input = ambiguityEvidence(lifecycle, {
      at: 7,
      operation: "capture_payment",
      outcome: "payment_captured",
      payment: true,
    });
    const persisted = new Map<string, string>();
    const statuses: string[] = [];
    const finalizer: FlightProviderReconciliationFinalizer = {
      finalizeNoActiveTicketReconciliation: async () => ({ status: "unavailable", persistedLifecycleDigest: null }),
      finalizeAmbiguityReconciliation: async ({ evidence: reviewed, nextLifecycleDigest }) => {
        const existing = persisted.get(reviewed.trustedReceiptId);
        if (existing !== undefined) {
          statuses.push("already_finalized");
          return { status: "already_finalized", persistedLifecycleDigest: existing };
        }
        persisted.set(reviewed.trustedReceiptId, nextLifecycleDigest);
        statuses.push("finalized");
        return { status: "finalized", persistedLifecycleDigest: nextLifecycleDigest };
      },
    };

    const [first, second] = await Promise.all([
      reconcileFlightCommercePaymentCapture(lifecycle, input, finalizer),
      reconcileFlightCommercePaymentCapture(lifecycle, input, finalizer),
    ]);
    expect(first).toEqual(second);
    expect(persisted).toEqual(new Map([[input.trustedReceiptId, finalizedLifecycleDigest(first)]]));
    expect(statuses.sort()).toEqual(["already_finalized", "finalized"]);
  });

  it("compare-and-swaps one aggregate prefix when distinct trusted receipts race", async () => {
    const lifecycle = captureFailureLifecycle();
    const captured = ambiguityEvidence(lifecycle, {
      at: 7,
      operation: "capture_payment",
      outcome: "payment_captured",
      payment: true,
      receiptId: "trusted_racing_receipt_captured",
      receiptDigest: "1".repeat(64),
    });
    const absent = ambiguityEvidence(lifecycle, {
      at: 8,
      operation: "capture_payment",
      outcome: "payment_not_captured_no_authorization",
      payment: true,
      receiptId: "trusted_racing_receipt_absent",
      receiptDigest: "2".repeat(64),
    });
    const completions = new Map<string, string>();
    let aggregatePrefixDigest: string | null = null;
    let persistedLifecycleDigest: string | null = null;
    let entered = 0;
    let release!: () => void;
    const bothEntered = new Promise<void>((resolve) => { release = resolve; });
    const finalizer: FlightProviderReconciliationFinalizer = {
      finalizeNoActiveTicketReconciliation: async () => ({ status: "unavailable", persistedLifecycleDigest: null }),
      finalizeAmbiguityReconciliation: async ({
        evidence: reviewed, expectedCurrentAggregate, nextLifecycleDigest,
      }) => {
        const completed = completions.get(reviewed.trustedReceiptId);
        if (completed !== undefined) {
          return completed === nextLifecycleDigest
            ? { status: "already_finalized", persistedLifecycleDigest: completed }
            : { status: "conflict", persistedLifecycleDigest: null };
        }
        if (aggregatePrefixDigest === null) aggregatePrefixDigest = expectedCurrentAggregate.prefixDigest;
        entered += 1;
        if (entered === 2) release();
        await bothEntered;
        if (aggregatePrefixDigest !== expectedCurrentAggregate.prefixDigest) {
          return { status: "conflict", persistedLifecycleDigest: null };
        }
        // Synchronous compare-and-swap point: the first continuation advances the aggregate before the other checks.
        aggregatePrefixDigest = nextLifecycleDigest;
        persistedLifecycleDigest = nextLifecycleDigest;
        completions.set(reviewed.trustedReceiptId, nextLifecycleDigest);
        return { status: "finalized", persistedLifecycleDigest: nextLifecycleDigest };
      },
    };

    const settled = await Promise.allSettled([
      reconcileFlightCommercePaymentCapture(lifecycle, captured, finalizer),
      reconcileFlightCommercePaymentCapture(lifecycle, absent, finalizer),
    ]);
    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((settled.find((result) => result.status === "rejected") as PromiseRejectedResult).reason)
      .toMatchObject({ message: expect.stringMatching(/finalization was not accepted: conflict/i) });
    expect(completions.size).toBe(1);
    expect([...completions.values()]).toEqual([persistedLifecycleDigest]);
  });

  it("retries a persisted no-active-ticket result through the exact completion record", async () => {
    const lifecycle = issuanceFailureLifecycle();
    const input = noActiveEvidence(lifecycle, {
      at: 11,
      failureCause: "ticket_issuance_rejected",
    });
    const persisted = new Map<string, string>();
    const statuses: string[] = [];
    const finalizer: FlightProviderReconciliationFinalizer = {
      finalizeAmbiguityReconciliation: async () => ({ status: "unavailable", persistedLifecycleDigest: null }),
      finalizeNoActiveTicketReconciliation: async ({ evidence: reviewed, nextLifecycleDigest }) => {
        const existing = persisted.get(reviewed.trustedReceiptId);
        if (existing !== undefined) {
          statuses.push("already_finalized");
          return { status: "already_finalized", persistedLifecycleDigest: existing };
        }
        persisted.set(reviewed.trustedReceiptId, nextLifecycleDigest);
        statuses.push("finalized");
        return { status: "finalized", persistedLifecycleDigest: nextLifecycleDigest };
      },
    };

    const first = await reconcileFlightCommerceNoActiveTicket(lifecycle, input, finalizer);
    const retry = await reconcileFlightCommerceNoActiveTicket(first, input, finalizer);
    expect(retry).toEqual(first);
    expect(statuses).toEqual(["finalized", "already_finalized"]);
  });

  it("rejects caller-minted no-active-ticket hashes without a trusted persisted receipt", async () => {
    const lifecycle = issuanceFailureLifecycle();
    const forged = noActiveEvidence(lifecycle, {
      at: 11,
      failureCause: "ticket_issuance_rejected",
      receiptDigest: "f".repeat(64),
    });
    await expect(reconcileFlightCommerceNoActiveTicket(
      lifecycle,
      forged,
      acceptedVerifier(new Map()),
    )).rejects.toThrow(/receipt and lifecycle finalization was not accepted: invalid/i);
  });

  it("recovers authorization, capture, payment-void, and create-order ambiguity only from exact trusted attempts", async () => {
    for (const [outcome, orderState, paymentState] of [
      ["payment_authorized", "payment_authorized", "authorized"],
      ["payment_authorization_absent", "failed", "failed"],
    ] as const) {
      const lifecycle = paymentAuthorizationAmbiguousLifecycle();
      const input = ambiguityEvidence(lifecycle, { at: 5, operation: "authorize_payment", outcome, payment: true });
      const result = await reconcileFlightCommercePaymentAuthorization(
        lifecycle,
        input,
        acceptedVerifier(new Map([[input.trustedReceiptId, input.trustedReceiptDigest]])),
      );
      expect(result).toMatchObject({ order: { state: orderState }, payment: { state: paymentState } });
    }

    for (const [outcome, orderState, paymentState] of [
      ["payment_captured", "payment_authorized", "captured"],
      ["payment_not_captured_no_authorization", "failed", "not_captured"],
      ["payment_not_captured_authorization_active", "payment_authorized", "authorized"],
      ["payment_not_captured_authorization_voided", "failed", "voided"],
    ] as const) {
      const lifecycle = captureFailureLifecycle();
      const input = ambiguityEvidence(lifecycle, { at: 7, operation: "capture_payment", outcome, payment: true });
      const result = await reconcileFlightCommercePaymentCapture(
        lifecycle,
        input,
        acceptedVerifier(new Map([[input.trustedReceiptId, input.trustedReceiptDigest]])),
      );
      expect(result).toMatchObject({ order: { state: orderState }, payment: { state: paymentState } });
      if (outcome === "payment_not_captured_authorization_active") {
        expect(beginFlightCommercePaymentVoid(result, evidence("payment", 8, result.payment.revision)))
          .toMatchObject({ order: { state: "payment_authorized" }, payment: { state: "void_pending" } });
      }
    }

    for (const [outcome, orderState, paymentState] of [
      ["payment_voided", "failed", "voided"],
      ["payment_authorization_active", "payment_authorized", "authorized"],
    ] as const) {
      const lifecycle = paymentVoidFailureLifecycle();
      const input = ambiguityEvidence(lifecycle, { at: 7, operation: "void_payment", outcome, payment: true });
      const result = await reconcileFlightCommercePaymentVoid(
        lifecycle,
        input,
        acceptedVerifier(new Map([[input.trustedReceiptId, input.trustedReceiptDigest]])),
      );
      expect(result).toMatchObject({ order: { state: orderState }, payment: { state: paymentState } });
    }

    for (const [outcome, orderState, ticketState] of [
      ["order_absent", "order_absent", "not_started"],
      ["order_confirmed", "order_confirmed", "not_started"],
      ["order_ticketed", "ticketed", "issued"],
    ] as const) {
      const lifecycle = orderCreationFailureLifecycle();
      const input = ambiguityEvidence(lifecycle, {
        at: 9,
        operation: "create_order",
        outcome,
        ticket: outcome === "order_ticketed",
      });
      const result = await reconcileFlightCommerceOrderCreation(
        lifecycle,
        input,
        acceptedVerifier(new Map([[input.trustedReceiptId, input.trustedReceiptDigest]])),
      );
      expect(result).toMatchObject({ order: { state: orderState }, payment: { state: "captured" }, ticket: { state: ticketState } });
    }
  });

  it("recovers refund, issuance, exchange, and ticket-void ambiguity without blind retries", async () => {
    for (const [outcome, orderState, paymentState] of [
      ["payment_still_captured", "cancelled", "captured"],
      ["payment_partially_refunded", "refund_pending", "partially_refunded"],
      ["payment_fully_refunded", "refunded", "refunded"],
    ] as const) {
      const lifecycle = refundFailureLifecycle();
      const input = ambiguityEvidence(lifecycle, { at: 15, operation: "refund_payment", outcome, payment: true });
      const result = await reconcileFlightCommerceRefund(
        lifecycle,
        input,
        acceptedVerifier(new Map([[input.trustedReceiptId, input.trustedReceiptDigest]])),
      );
      expect(result).toMatchObject({ order: { state: orderState }, payment: { state: paymentState }, ticket: { state: "voided" } });
    }

    {
      const lifecycle = issuanceFailureLifecycle();
      const input = ambiguityEvidence(lifecycle, { at: 11, operation: "issue_ticket", outcome: "tickets_issued", ticket: true });
      const result = await reconcileFlightCommerceTicketIssuance(
        lifecycle,
        input,
        acceptedVerifier(new Map([[input.trustedReceiptId, input.trustedReceiptDigest]])),
      );
      expect(result).toMatchObject({ order: { state: "ticketed" }, ticket: { state: "issued" } });
    }

    for (const [outcome, ticketState] of [
      ["tickets_exchanged", "exchanged"],
      ["original_issued_ticket_active", "issued"],
      ["original_exchanged_ticket_active", "exchanged"],
    ] as const) {
      const lifecycle = exchangeFailureLifecycle();
      const input = ambiguityEvidence(lifecycle, { at: 13, operation: "exchange_ticket", outcome, ticket: true });
      const result = await reconcileFlightCommerceTicketExchange(
        lifecycle,
        input,
        acceptedVerifier(new Map([[input.trustedReceiptId, input.trustedReceiptDigest]])),
      );
      expect(result).toMatchObject({ order: { state: "ticketed" }, ticket: { state: ticketState } });
    }

    for (const [outcome, orderState] of [
      ["unticketed_order_cancelled", "cancelled"],
      ["unticketed_order_active", "order_confirmed"],
    ] as const) {
      const lifecycle = unticketedCancellationFailureLifecycle();
      const input = ambiguityEvidence(lifecycle, { at: 11, operation: "cancel_order", outcome });
      const result = await reconcileFlightCommerceCancellation(
        lifecycle,
        input,
        acceptedVerifier(new Map([[input.trustedReceiptId, input.trustedReceiptDigest]])),
      );
      expect(result).toMatchObject({ order: { state: orderState }, ticket: { state: "not_started" } });
    }

    for (const [outcome, orderState, ticketState] of [
      ["ticketed_order_cancelled_tickets_voided", "cancelled", "voided"],
      ["ticketed_order_active_original_issued_ticket_active", "ticketed", "issued"],
      ["ticketed_order_active_original_exchanged_ticket_active", "ticketed", "exchanged"],
      ["ticketed_order_active_tickets_voided", "order_confirmed", "voided"],
    ] as const) {
      const lifecycle = ticketVoidFailureLifecycle();
      const input = ambiguityEvidence(lifecycle, { at: 13, operation: "cancel_order", outcome, ticket: true });
      const result = await reconcileFlightCommerceCancellation(
        lifecycle,
        input,
        acceptedVerifier(new Map([[input.trustedReceiptId, input.trustedReceiptDigest]])),
      );
      expect(result).toMatchObject({ order: { state: orderState }, ticket: { state: ticketState } });
      if (outcome === "ticketed_order_active_tickets_voided") {
        expect(beginFlightCommerceCancellation(result, { order: evidence("order", 14, result.order.revision) }))
          .toMatchObject({ order: { state: "cancellation_pending" }, ticket: { state: "voided" } });
      }
    }
  });

  it("keeps a cancelled provider order with an active ticket in manual review until separate no-active proof", async () => {
    for (const [outcome, ticketState] of [
      ["ticketed_order_cancelled_original_issued_ticket_active", "issued"],
      ["ticketed_order_cancelled_original_exchanged_ticket_active", "exchanged"],
    ] as const) {
      const lifecycle = ticketVoidFailureLifecycle();
      const input = ambiguityEvidence(lifecycle, {
        at: 13,
        operation: "cancel_order",
        outcome,
        ticket: true,
      });
      const activeTicket = await reconcileFlightCommerceCancellation(
        lifecycle,
        input,
        acceptedVerifier(new Map([[input.trustedReceiptId, input.trustedReceiptDigest]])),
      );
      expect(activeTicket).toMatchObject({
        order: { state: "manual_review" },
        payment: { state: "captured" },
        ticket: { state: ticketState },
      });
      expect(activeTicket.order.history.at(-1)).toMatchObject({
        type: "reconcile_cancelled_order_active_ticket",
        ambiguityReconciliation: { operation: "cancel_order", outcome },
      });
      expect(() => beginFlightCommerceRefund(activeTicket, {
        order: evidence("order", 14, activeTicket.order.revision),
        payment: evidence("payment", 14, activeTicket.payment.revision),
      })).toThrow(/order state must be cancelled/i);
      expect(() => beginFlightCommerceCompensatingRefund(activeTicket, {
        order: evidence("order", 14, activeTicket.order.revision),
        payment: evidence("payment", 14, activeTicket.payment.revision),
      })).toThrow(/authenticated reconciliation/i);

      const absence = noActiveEvidence(activeTicket, {
        at: 14,
        failureCause: "ticket_void_rejected",
      });
      const noActiveTicket = await reconcileFlightCommerceNoActiveTicket(
        activeTicket,
        absence,
        acceptedVerifier(new Map([[absence.trustedReceiptId, absence.trustedReceiptDigest]])),
      );
      expect(noActiveTicket).toMatchObject({
        order: { state: "manual_review" },
        payment: { state: "captured" },
        ticket: { state: "no_active_ticket" },
      });
      expect(beginFlightCommerceCompensatingRefund(noActiveTicket, {
        order: evidence("order", 15, noActiveTicket.order.revision),
        payment: evidence("payment", 15, noActiveTicket.payment.revision),
      })).toMatchObject({
        order: { state: "refund_pending" },
        payment: { state: "refund_pending" },
        ticket: { state: "no_active_ticket" },
      });
    }
  });

  it("atomically completes one confirmed provider order with the exact matching ticket outcome", async () => {
    for (const [outcome, orderState, ticketState, operation] of [
      ["order_confirmed", "order_confirmed", "not_started", "complete_provider_order_confirmed"],
      ["ticketing_pending", "ticketing_pending", "issuance_pending", "complete_provider_order_ticketing_pending"],
      ["ticketed", "ticketed", "issued", "complete_provider_order_ticketed"],
    ] as const) {
      const lifecycle = capturedOrderPendingLifecycle();
      const receipt = authenticatedProviderOrderCompletionReceipt(lifecycle, outcome, 8);
      const statuses: string[] = [];
      const finalizer = acceptedProviderOrderCompletionFinalizer(receipt, statuses);
      const completed = await completeFlightCommerceProviderOrderAtomically(lifecycle, receipt, finalizer);

      expect(completed).toMatchObject({
        order: { state: orderState, revision: lifecycle.order.revision + 1 },
        payment: { state: "captured", revision: lifecycle.payment.revision },
        ticket: {
          state: ticketState,
          revision: lifecycle.ticket.revision + (outcome === "order_confirmed" ? 0 : 1),
        },
      });
      expect(completed.order.history.at(-1)?.coordinatedOperationReceipt).toMatchObject({
        operation,
        commerceId: COMMERCE_ID,
        providerOrderCompletionReceiptDigest: receipt.canonicalEvidenceDigest,
      });
      expect(completed.order.history.at(-1)?.providerOrderCompletionReceipt).toEqual(receipt);
      if (outcome === "order_confirmed") {
        expect(completed.ticket.history).toHaveLength(0);
      } else {
        expect(completed.ticket.history.at(-1)?.coordinatedOperationReceipt).toEqual(
          completed.order.history.at(-1)?.coordinatedOperationReceipt,
        );
        expect(completed.ticket.history.at(-1)?.providerOrderCompletionReceipt).toEqual(receipt);
      }
      expect(completed.order.history.at(-1)?.providerOrderCompletionReceipt?.electronicTicketDocumentReceiptDigests)
        .toEqual(outcome === "ticketed" ? ["4".repeat(64)] : []);
      expect(statuses).toEqual(["finalized"]);

      const retried = await completeFlightCommerceProviderOrderAtomically(completed, receipt, finalizer);
      expect(retried).toEqual(completed);
      expect(statuses).toEqual(["finalized", "already_finalized"]);
    }
  });

  it("rejects direct atomic claims and a false separate ticket mutation after atomic issuance", async () => {
    const lifecycle = capturedOrderPendingLifecycle();
    expect(() => transitionFlightOrder(lifecycle.order, {
      type: "confirm_provider_order_ticketed",
      ...evidence("order", 8, lifecycle.order.revision),
    })).toThrow(/requires the coordinated flight-commerce lifecycle/i);

    const receipt = authenticatedProviderOrderCompletionReceipt(lifecycle, "ticketed", 8);
    const ticketed = await completeFlightCommerceProviderOrderAtomically(
      lifecycle,
      receipt,
      acceptedProviderOrderCompletionFinalizer(receipt),
    );
    expect(() => beginFlightCommerceTicketing(ticketed, {
      order: evidence("order", 9, ticketed.order.revision),
      ticket: evidence("ticket", 9, ticketed.ticket.revision),
    })).toThrow(/order state must be order_confirmed/i);
    expect(() => completeFlightCommerceTicketing(ticketed, {
      order: evidence("order", 9, ticketed.order.revision),
      ticket: evidence("ticket", 9, ticketed.ticket.revision),
    })).toThrow(/order state must be ticketing_pending/i);
  });

  it("rejects missing, duplicate, forged, and outcome-inconsistent electronic-ticket receipts", async () => {
    const lifecycle = capturedOrderPendingLifecycle();
    const authenticated = authenticatedProviderOrderCompletionReceipt(lifecycle, "ticketed", 8);
    const finalizer = acceptedProviderOrderCompletionFinalizer(authenticated);

    const missing = authenticatedProviderOrderCompletionReceipt(lifecycle, "ticketed", 8, []);
    await expect(completeFlightCommerceProviderOrderAtomically(lifecycle, missing, finalizer))
      .rejects.toThrow(/outcome contradicts its exact ticket evidence/i);

    const duplicate = authenticatedProviderOrderCompletionReceipt(
      lifecycle,
      "ticketed",
      8,
      ["4".repeat(64), "4".repeat(64)],
    );
    await expect(completeFlightCommerceProviderOrderAtomically(lifecycle, duplicate, finalizer))
      .rejects.toThrow(/exact, unique, and sorted/i);

    const forged = authenticatedProviderOrderCompletionReceipt(lifecycle, "ticketed", 8, ["5".repeat(64)]);
    await expect(completeFlightCommerceProviderOrderAtomically(lifecycle, forged, finalizer))
      .rejects.toThrow(/finalization was not accepted: invalid/i);

    const falsePendingDocuments = authenticatedProviderOrderCompletionReceipt(
      lifecycle,
      "ticketing_pending",
      8,
      ["4".repeat(64)],
    );
    await expect(completeFlightCommerceProviderOrderAtomically(lifecycle, falsePendingDocuments, finalizer))
      .rejects.toThrow(/outcome contradicts its exact ticket evidence/i);

    const providerStillPending = {
      ...authenticatedProviderOrderCompletionReceipt(lifecycle, "order_confirmed", 8),
      providerOrderState: "order_pending",
    } as unknown as FlightAuthenticatedProviderOrderCompletionReceipt;
    await expect(completeFlightCommerceProviderOrderAtomically(lifecycle, providerStillPending, finalizer))
      .rejects.toThrow(/receipt is malformed/i);
  });

  it("rejects cross-commerce splicing, stale revisions, and durable CAS conflicts", async () => {
    const lifecycle = capturedOrderPendingLifecycle();
    const receipt = authenticatedProviderOrderCompletionReceipt(lifecycle, "ticketed", 8);
    const otherLifecycle = (() => {
      let current = createFlightCommerceLifecycle("flight_commerce_test_0002");
      current = { ...current, order: transitionFlightOrder(current.order, { type: "select_offer", ...evidence("order", 0, 0) }) };
      current = { ...current, order: transitionFlightOrder(current.order, { type: "start_reprice", ...evidence("order", 1, 1) }) };
      current = { ...current, order: transitionFlightOrder(current.order, { type: "accept_reprice", ...evidence("order", 2, 2) }) };
      current = beginFlightCommercePayment(current, { order: evidence("order", 3, 3), payment: evidence("payment", 3, 0) });
      current = authorizeFlightCommercePayment(current, { order: evidence("order", 4, 4), payment: evidence("payment", 4, 1) });
      current = beginFlightCommercePaymentCapture(current, evidence("payment", 5, 2));
      current = completeFlightCommercePaymentCapture(current, evidence("payment", 6, 3));
      return submitFlightCommerceOrder(current, evidence("order", 7, 5));
    })();
    const otherReceipt = authenticatedProviderOrderCompletionReceipt(otherLifecycle, "ticketed", 8);
    await expect(completeFlightCommerceProviderOrderAtomically(
      lifecycle,
      otherReceipt,
      acceptedProviderOrderCompletionFinalizer(otherReceipt),
    )).rejects.toThrow(/bound to another commerce lifecycle|another aggregate prefix/i);

    const staleWithoutDigest = {
      ...receipt,
      transitions: {
        ...receipt.transitions,
        order: { ...receipt.transitions.order, expectedRevision: receipt.transitions.order.expectedRevision - 1 },
      },
    };
    const stale = {
      ...staleWithoutDigest,
      canonicalEvidenceDigest: digestFlightProviderOrderCompletionCanonicalEvidence(staleWithoutDigest),
    };
    await expect(completeFlightCommerceProviderOrderAtomically(
      lifecycle,
      stale,
      acceptedProviderOrderCompletionFinalizer(receipt),
    )).rejects.toThrow(/revisions do not match/i);

    await expect(completeFlightCommerceProviderOrderAtomically(lifecycle, receipt, {
      finalizeAuthenticatedProviderOrderCompletion: async () => ({ status: "conflict", persistedLifecycleDigest: null }),
    })).rejects.toThrow(/finalization was not accepted: conflict/i);

    const completed = await completeFlightCommerceProviderOrderAtomically(
      lifecycle,
      receipt,
      acceptedProviderOrderCompletionFinalizer(receipt),
    );
    const spliced = JSON.parse(canonicalFlightJson(completed as never)) as FlightCommerceLifecycle;
    const ticketEvent = spliced.ticket.history.at(-1)!;
    (ticketEvent as { providerOrderCompletionReceipt: FlightAuthenticatedProviderOrderCompletionReceipt })
      .providerOrderCompletionReceipt = otherReceipt;
    expect(() => getFlightCommerceAggregatePrefix(spliced)).toThrow(
      /another commerce lifecycle|spliced receipt evidence|does not match its lifecycle event/i,
    );
  });

});
